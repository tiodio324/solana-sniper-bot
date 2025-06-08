import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { solanaConnection } from './config';
import { TokenData, HistoryFilterType } from './types';
import { cryptoPalettes } from './constants';

// Store historical token prices for profit calculation
const tokenPriceHistory = new Map<string, {
    initialPrice: number;
    currentPrice: number;
    timestamps: number[];
    prices: number[];
}>();
// Store tokens that are ready to sell
const tokensReadyToSell = new Set<string>();

// Cache for token metadata to prevent duplicate API calls
const tokenMetadataCache = new Map<string, { 
    name: string | null;
    symbol: string | null;
    logoURI: string | null;
    fetchedAt: number;
}>();

// Function to get token metadata from Solana
export async function getTokenMetadata(tokenMint: string) {
    // Check if we already have this metadata cached
    const cachedData = tokenMetadataCache.get(tokenMint);
    const cacheTime = parseInt(import.meta.env.VITE_TOKEN_METADATA_CACHE_TIME);

    if (cachedData && (Date.now() - cachedData.fetchedAt < cacheTime)) {
        return {
            name: cachedData.name,
            symbol: cachedData.symbol,
            logoURI: cachedData.logoURI
        };
    }

    try {
        // Helius getAsset API
        const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

        const response = await fetch(heliusUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-token-metadata',
                method: 'getAsset',
                params: {
                    id: tokenMint,
                    displayOptions: {
                        showFungible: true
                    }
                },
            }),
        });

        const responseData = await response.json();
        
        if (responseData.result) {
            const assetData = responseData.result;

            let name = null;
            let symbol = null;

            // Try to get from content.metadata first
            if (assetData.content && assetData.content.metadata) {
                name = assetData.content.metadata.name || null;
                symbol = assetData.content.metadata.symbol || null;
            }

            // If not found, try token_info for fungible tokens
            if (!name && assetData.token_info) {
                name = assetData.token_info.name || null;
                symbol = assetData.token_info.symbol || null;
            }

            const metadata = {
                name: name,
                symbol: symbol,
                logoURI: assetData.content.metadata.image || null,
                fetchedAt: Date.now()
            };

            // Cache the result
            tokenMetadataCache.set(tokenMint, metadata);

            return {
                name: metadata.name,
                symbol: metadata.symbol,
                logoURI: metadata.logoURI
            };
        }

        // Solscan API
        const solscanResponse = await fetch(`https://api.solscan.io/token/meta?token=${tokenMint}`);
        const solscanData = await solscanResponse.json();

        if (solscanData && solscanData.success && solscanData.data) {
            const metadata = {
                name: solscanData.data.name || null,
                symbol: solscanData.data.symbol || null,
                logoURI: solscanData.data.icon || null,
                fetchedAt: Date.now()
            };

            // Cache the result
            tokenMetadataCache.set(tokenMint, metadata);

            return {
                name: metadata.name,
                symbol: metadata.symbol,
                logoURI: metadata.logoURI
            };
        }

        // Cache negative result to prevent repeated API calls
        tokenMetadataCache.set(tokenMint, {
            name: null,
            symbol: null,
            logoURI: null,
            fetchedAt: Date.now()
        });

        return {
            name: null,
            symbol: null,
            logoURI: null
        };
    } catch (error) {
        console.error(`Error fetching token metadata: ${error instanceof Error ? error.message : String(error)}`);
        return {
            name: null,
            symbol: null,
            logoURI: null
        };
    }
}

// Function to get bought token price data
export async function checkTokenPrice(tokenMint: string) {
    const WSOL_ADDRESS = import.meta.env.VITE_WSOL_ADDRESS;
    const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;

    // Get the input amount from environment variable
    const INPUT_AMOUNT = parseInt(import.meta.env.VITE_TOKEN_PRICE_LAMPORTS_AMOUNT_TO_GET); // Amount in lamports

    try {
        // First check price SOL -> Token (buying)
        const buyResponse = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${WSOL_ADDRESS}&outputMint=${tokenMint}&amount=${INPUT_AMOUNT}&slippageBps=50`);
        const buyData = await buyResponse.json();

        // Then check price Token -> USDC (selling to stablecoin for price)
        // Get the token output amount from buy quote to use as input for sell quote
        if (buyData && buyData.outAmount) {
            const tokenAmount = buyData.outAmount;

            const sellResponse = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${tokenMint}&outputMint=${USDC_ADDRESS}&amount=${tokenAmount}&slippageBps=50`);
            const sellData = await sellResponse.json();

            if (sellData && sellData.outAmount) {
                // Calculate token price in USDC
                const usdcAmount = parseFloat(sellData.outAmount) / 1e6; // USDC has 6 decimals
                const solAmount = INPUT_AMOUNT / 1e9; // SOL has 9 decimals

                // This gives us the USDC price per token
                const currentPrice = usdcAmount / solAmount * 0.1; // Normalize to price per token for 1 SOL
                let priceHistory;

                if (!tokenPriceHistory.has(tokenMint) && currentPrice > 0) {
                    // First time seeing this token - set initial and current to the same value
                    priceHistory = {
                        initialPrice: currentPrice,
                        currentPrice: currentPrice,
                        timestamps: [Date.now()],
                        prices: [currentPrice]
                    };
                    tokenPriceHistory.set(tokenMint, priceHistory);
                } else if (currentPrice > 0) {
                    // Token seen before - update current price but preserve initial
                    priceHistory = tokenPriceHistory.get(tokenMint);
                    if (priceHistory) {
                        priceHistory.currentPrice = currentPrice;
                        priceHistory.timestamps.push(Date.now());
                        priceHistory.prices.push(currentPrice);

                        // Keep only last 100 data points to prevent memory issues
                        if (priceHistory.prices.length > 100) {
                            priceHistory.prices.shift();
                            priceHistory.timestamps.shift();
                        }

                        tokenPriceHistory.set(tokenMint, priceHistory);
                    }
                }

                // Get the current price history
                priceHistory = tokenPriceHistory.get(tokenMint);

                // Calculate percent change and ensure it's accurate
                let priceChangePercent = 0;
                if (priceHistory && priceHistory.initialPrice > 0) {
                    priceChangePercent = (priceHistory.currentPrice / priceHistory.initialPrice) * 100;
                }

                // Get price impact for various SOL amounts from Jupiter quote data
                const priceImpactBuy = buyData.priceImpactPct ? parseFloat(buyData.priceImpactPct) : null;
                const priceImpactSell = sellData.priceImpactPct ? parseFloat(sellData.priceImpactPct) : null;

                const result = {
                    price: currentPrice.toString(),
                    type: "Jupiter-Swap",
                    confidenceLevel: "high", // Real-time quote from Jupiter Swap
                    buyPrice: buyData.outAmount ? (parseFloat(buyData.outAmount) / INPUT_AMOUNT * 1e9).toString() : null,
                    sellPrice: sellData.outAmount ? (parseFloat(sellData.outAmount) / tokenAmount).toString() : null,
                    lastSwappedBuyPrice: null,
                    lastSwappedSellPrice: null,
                    depth: {
                        buy10SOL: priceImpactBuy ? priceImpactBuy / 100 : null, // Convert percentage to decimal
                        buy100SOL: null,
                        buy1000SOL: null,
                        sell10SOL: priceImpactSell ? priceImpactSell / 100 : null, // Convert percentage to decimal
                        sell100SOL: null,
                        sell1000SOL: null,
                    },
                    hasLiquidity: currentPrice > 0 && buyData.outAmount && sellData.outAmount,
                    priceHistory: priceHistory ? {
                        initialPrice: priceHistory.initialPrice,
                        currentPrice: priceHistory.currentPrice,
                        priceChangePercent: priceChangePercent,
                        lastUpdated: new Date().toISOString()
                    } : null
                };

                if (result.hasLiquidity && (!result.price || parseFloat(result.price) <= 0)) {
                    result.hasLiquidity = false;
                }

                if (result.priceHistory && result.priceHistory.currentPrice <= 0) {
                    result.hasLiquidity = false;
                }
                return result;
            }
        }
    } catch (error) {
        console.warn(`[checkTokenPrice] Error using Jupiter Swap API: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.warn(`No price data found for token ${tokenMint}`);
    return {
        price: null,
        type: null,
        confidenceLevel: 'unknown',
        buyPrice: null,
        sellPrice: null,
        lastSwappedBuyPrice: null,
        lastSwappedSellPrice: null,
        depth: {
            buy10SOL: null,
            buy100SOL: null,
            buy1000SOL: null,
            sell10SOL: null,
            sell100SOL: null,
            sell1000SOL: null,
        },
        hasLiquidity: false,
        priceHistory: null
    };
}

export async function getJupiterQuoteResponse(tokenMint: PublicKey, amount: string, jupiterUrlSlippageBps: string, isBuy: boolean = true) {
    const WSOL_ADDRESS = new PublicKey(import.meta.env.VITE_WSOL_ADDRESS);
    const inputMint = isBuy ? WSOL_ADDRESS.toString() : tokenMint.toString();
    const outputMint = isBuy ? tokenMint.toString() : WSOL_ADDRESS.toString();

    const jupiterUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${jupiterUrlSlippageBps}`;
    const response = await fetch(jupiterUrl);
    const quoteResponse = await response.json();
    return quoteResponse;
}

export async function checkRug(mint: string) {
    try {
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`);
        return response.data;
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response: { status: number; data: unknown } };
            console.error(`Error checking token on RugCheck: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`);
        } else if (error && typeof error === 'object' && 'message' in error) {
            console.error(`Error checking token on RugCheck: ${(error as { message: string }).message}`);
        } else {
            console.error(`Error checking token on RugCheck: Unknown error`);
        }
        return null;
    }
}

export async function customPerfomanceTimer() {
    const startTime = performance.now();
    const elapsedMs = performance.now() - startTime;
    const seconds = Math.floor(elapsedMs / 1000);
    const ms = Math.floor(elapsedMs % 1000);
    return `${seconds}s:${ms.toString().padStart(3, '0')}ms`;
}

export const delayMS = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to generate a modern crypto SVG icon from token address
export function generateTokenIcon(tokenAddress: string): string {
    // Validate the token address to ensure it's not empty or invalid
    if (!tokenAddress || typeof tokenAddress !== 'string') {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="6" fill="#1e293b" />
            <path d="M12 8v8M9 12h6" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round" />
        </svg>`;
    }
    
    try {
        // Use the token address to create a deterministic but unique icon
        const hash = tokenAddress.slice(0, 6) + tokenAddress.slice(-6);
        
        // Use token hash to deterministically select a color palette
        const hashValue = parseInt(hash.substring(0, 2), 16);
        const paletteIndex = hashValue % cryptoPalettes.length;
        
        // Ensure we have a valid palette
        const selectedPalette = cryptoPalettes[paletteIndex] || cryptoPalettes[0];
        
        // Generate deterministic colors with safeguards
        const color1 = selectedPalette.primary || '#9945FF';  // Default if primary is undefined
        const color2 = selectedPalette.secondary || '#14F195'; // Default if secondary is undefined
        const accentColor = selectedPalette.accent || '#6466ee'; // Default if accent is undefined
        
        // Generate a shape variant based on the hash
        const shapeVariant = parseInt(hash.substring(6, 8), 16) % 5;
        
        // Create a unique ID that's safe for SVG
        const uniqueId = `icon-${hash.replace(/[^a-z0-9]/gi, '')}`;
        const borderRadius = 6;
        
        // Create an SVG with shorter attribute names and simpler structure
        return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${color1}" />
                    <stop offset="100%" style="stop-color:${color2}" />
                </linearGradient>
            </defs>
            <rect x="3" y="3" width="18" height="18" rx="${borderRadius}" fill="url(#${uniqueId})" />
            ${shapeVariant === 0 ?
                `<path d="M12 7L8.5 9v4L12 15l3.5-2v-4L12 7z" fill="${accentColor}" opacity="0.5" />` :
            shapeVariant === 1 ?
                `<circle cx="9" cy="12" r="1.8" fill="${accentColor}" opacity="0.9" />
                <circle cx="15" cy="12" r="1.8" fill="${accentColor}" opacity="0.9" />
                <circle cx="12" cy="8" r="1.8" fill="${accentColor}" opacity="0.9" />
                <path d="M9 12L12 8L15 12" stroke="${accentColor}" stroke-width="0.8" />` :
            shapeVariant === 2 ?
                `<path d="M12 6L17 12L12 18L7 12L12 6z" fill="${accentColor}" opacity="0.7" />` :
            shapeVariant === 3 ?
                `<circle cx="12" cy="12" r="4" fill="${accentColor}" opacity="0.8" />
                <ellipse cx="12" cy="12" rx="7" ry="2" fill="none" stroke="${accentColor}" stroke-width="0.5" />` :
                `<circle cx="12" cy="12" r="6" fill="none" stroke="${accentColor}" stroke-width="1" opacity="0.8" />
                <path d="M12 8v8M9 10.5h6M9 13.5h6" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" />`
            }
        </svg>`;
    } catch (error) {
        // Create a deterministic yet visually distinct fallback
        const charCode = tokenAddress.charCodeAt(0) || 65;
        const hue = (charCode * 137) % 360; // Distribute colors evenly
        const fallbackColor = `hsl(${hue}, 80%, 60%)`;
        
        // Simple fallback that will always render
        return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="6" fill="${fallbackColor}" />
            <text x="12" y="16" font-size="12" text-anchor="middle" fill="white" style="font-family: sans-serif;">${tokenAddress.substring(0, 1).toUpperCase()}</text>
        </svg>`;
    }
}

// Function to get transaction signatures for a token address using Helius API
export async function getSignaturesForAddress(tokenAddress: string) {
    try {
        const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

        const response = await fetch(heliusUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-signatures',
                method: 'getSignaturesForAddress',
                params: [
                    tokenAddress,
                    { limit: 1 } // Get only the most recent signature
                ],
            }),
        });

        const responseData = await response.json();

        if (responseData.result && responseData.result.length > 0) {
            return responseData.result[0].signature;
        }

        return null;
    } catch (error) {
        console.error(`Error getting signatures for address: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

export async function sellTokenFilter(baseAddress: string) {
    const profitThreshold = 100 + parseFloat(import.meta.env.VITE_SELL_TOKEN_PROFIT_THRESHOLD);
    const stopLossThreshold = 100 - parseFloat(import.meta.env.VITE_SELL_TOKEN_STOP_LOSS_THRESHOLD);
    let isSellable = false;

    try {
        // Check token info before selling
        const tokenPriceInfo = await checkTokenPrice(baseAddress);
        if (tokenPriceInfo) {
            if (!tokenPriceInfo.hasLiquidity || 
                !tokenPriceInfo.priceHistory || 
                !tokenPriceInfo.price || 
                parseFloat(tokenPriceInfo.price) <= 0 ||
                tokenPriceInfo.priceHistory.currentPrice <= 0) {
                return false;
            }

            const priceChangePercent = tokenPriceInfo.priceHistory.priceChangePercent;
            const currentPrice = tokenPriceInfo.priceHistory.currentPrice;
            const initialPrice = tokenPriceInfo.priceHistory.initialPrice;

            // Sell if Take Profit or Stop Loss is reached
            if ((priceChangePercent >= profitThreshold && currentPrice > initialPrice) || (priceChangePercent <= stopLossThreshold && currentPrice < initialPrice)) {
                isSellable = true;
            } else {
                return false;
            }

            // // Check if the price impact for selling is too high (e.g., over 10% for 10 SOL)
            // const priceImpactThreshold = parseFloat(import.meta.env.VITE_SELL_TOKEN_PRICE_IMPACT_THRESHOLD);
            // if (tokenPriceInfo.depth.sell10SOL && tokenPriceInfo.depth.sell10SOL > priceImpactThreshold) {
            //     console.warn(`Token is Ready to Sell (${baseAddress}) has high price impact for selling: (${tokenPriceInfo.depth.sell10SOL * 100}%), considering smaller sell amount`);
            //     return false;
            // }

            if (isSellable) {
                tokensReadyToSell.add(baseAddress);
            }
        } else {
            return false;
        }

        return isSellable;
    } catch (error) {
        console.error(`[sellTokenFilter] Fatal Error for token ${baseAddress}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

// Function to check if a specific token is ready to sell
export function isTokenReadyToSell(baseAddress: string) {
    return tokensReadyToSell.has(baseAddress);
}

// Function to clear a token from the ready-to-sell list (after it's been sold)
export function clearTokenReadyToSell(baseAddress: string) {
    tokensReadyToSell.delete(baseAddress);
}

export async function getTradeAccountSolBalance() {
    const walletAddress = import.meta.env.VITE_WALLET_PUBLIC_KEY;
    const balance = await solanaConnection.getBalance(new PublicKey(walletAddress));
    return balance / 1e9;
};

export async function getMainAccountSolBalance() {
    const walletAddress = import.meta.env.VITE_WALLET_PUBLIC_KEY;
    const balance = await solanaConnection.getBalance(new PublicKey(walletAddress));
    return balance / 1e9;
};

export function filterHistoryTokens(tokens: TokenData[], filterType: HistoryFilterType): TokenData[] {
    switch (filterType) {
        case 'all':
            return tokens;
        case 'inTrade':
            return tokens.filter(token => token.confirmed && !token.sellConfirmed);
        case 'sold':
            return tokens.filter(token => token.confirmed && token.sellConfirmed);
        default:
            return tokens;
    }
}
