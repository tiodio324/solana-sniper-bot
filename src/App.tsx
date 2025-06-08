import { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { downloadExcel } from "react-export-table-to-excel";
import './assets/css/app.css';
import TokenConfirmedIcon from './assets/img/tokenConfirmed.svg';
import TokenNotConfirmedIcon from './assets/img/tokenNotConfirmed.svg';
import TokenSoldIcon from './assets/img/tokenSold.svg';
import SolanaIcon from './assets/img/solana-icon.svg';
import CryptoIcon from './assets/img/crypto-icon.svg';
import UpArrowIcon from './assets/img/upArrow.svg';
import TableLoaderIcon from './assets/img/tableLoader.svg';
import HistoryLoaderIcon from './assets/img/historyLoader.svg';
import { rayFee, solanaConnection } from './utils/config';
import { storeData, buyToken, sellToken } from './utils/utils';
import { HistoryFilterType, TokenData } from './utils/types';
import HistoryCard from './components/HistoryCard';
import {
    getTokenMetadata,
    generateTokenIcon,
    getSignaturesForAddress,
    sellTokenFilter,
    isTokenReadyToSell,
    clearTokenReadyToSell,
    checkTokenPrice,
    filterHistoryTokens,
    getTradeAccountSolBalance,
} from './utils/functions';
import {
    getConfirmedTokensStoreFromDB,
    getSellConfirmedTokensStoreFromDB,
    getTokenDataStoreFromDB,
    getTokenHistoryFromDB,
    setConfirmedTokensStoreToDB,
    setSellConfirmedTokensStoreToDB,
    setTokenDataStoreToDB,
    setTokenHistoryToDB,
    removeTokenFromDB
} from './utils/http';
import { ValueContext } from './utils/value-context';

const walletPublicKey = import.meta.env.VITE_WALLET_PUBLIC_KEY || '';


async function monitorNewTokens(
    connection: Connection,
    tokenDataStore: TokenData[],
    setTokenDataStore: React.Dispatch<React.SetStateAction<TokenData[]>>,
    userTypedSignature: boolean,
    confirmedTokensRef: React.RefObject<TokenData[]>,
    setConfirmedTokensStore: React.Dispatch<React.SetStateAction<TokenData[]>>,
    setIsMonitoring: React.Dispatch<React.SetStateAction<boolean>>,
    userSignature?: string,
    userTypedValueIsBaseAddress?: string
) {
    const maxTokensToTrade = parseInt(import.meta.env.VITE_MAX_TOKENS_TO_TRADE);
    const currentTokensToTrade = [...tokenDataStore || []].filter((token) => 
        token.confirmed === true && token.sellConfirmed === false
    );

    async function processToken(signature: string, signer: string, baseAddress: string) {
        try {
            const newTokenData: TokenData = {
                lpSignature: signature,
                creator: signer,
                baseInfo: {
                    baseAddress,
                },
                confirmed: false,
                confirmedAt: undefined,
                sellConfirmed: false,
                sellConfirmedAt: undefined,
                tokenLabel: `${baseAddress.substring(0, 4)}`,
                logoURI: '',
                priceInfo: {
                    initialPrice: 0,
                    currentPrice: 0,
                    priceChangePercent: 0,
                    lastUpdated: '',
                    lastPrice: 0,
                    lastPricePercent: 0
                }
            };

            const buyTokenResult = await buyToken(baseAddress, newTokenData.confirmed, newTokenData.confirmedAt);

            // Fetch token metadata
            try {
                const tokenMetadata = await getTokenMetadata(baseAddress);
                if (tokenMetadata) {
                    newTokenData.tokenLabel = tokenMetadata.name || tokenMetadata.symbol || `${baseAddress.substring(0, 8)}`;
                    newTokenData.logoURI = tokenMetadata.logoURI || '';
                }
            } catch (metadataError) {
                console.error(`[processToken] Error fetching token metadata: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
            }

            if (buyTokenResult?.confirmedNewTokenData) {
                newTokenData.confirmed = buyTokenResult.confirmedNewTokenData;
                newTokenData.confirmedAt = buyTokenResult.confirmedAtNewTokenData;
                setConfirmedTokensStore(prev => {
                    const updatedStore = [...new Set([newTokenData, ...prev])];
                    confirmedTokensRef.current = updatedStore;
                    return updatedStore;
                });
            }

            await storeData(newTokenData, setTokenDataStore);
        } catch (error) {
            console.error(`[processToken] Error processing token ${baseAddress}:`, error);
        }
    }

    if (!userTypedSignature) {
        const tokenLimitInterval = setInterval(() => {
            if (currentTokensToTrade.length >= maxTokensToTrade && onLogsListenerId) {
                console.warn(`[monitorNewTokens] Max tokens to trade reached: ${maxTokensToTrade}.`);
                stopMonitoring(onLogsListenerId);
            }
        }, 20000);

        const stopMonitoring = (listenerId: number) => {
            connection.removeOnLogsListener(listenerId);
            clearInterval(tokenLimitInterval);
        };

        const onLogsListenerId = connection.onLogs(
            rayFee,
            async ({ err, signature }) => {
                try {
                    if (err) {
                        setIsMonitoring(false);
                        console.error(`Connection error, please try again later: ${err}`);
                        return;
                    }

                    if (currentTokensToTrade.length >= maxTokensToTrade) {
                        if (onLogsListenerId) {
                            stopMonitoring(onLogsListenerId);
                        }
                        return;
                    }

                    let signer = '';
                    let baseAddress = '';

                    const parsedTransaction = await connection.getParsedTransaction(
                        signature,
                        {
                            maxSupportedTransactionVersion: 0,
                            commitment: 'confirmed',
                        }
                    );

                    if (parsedTransaction && parsedTransaction.meta && parsedTransaction.meta.err == null) {
                        signer = parsedTransaction?.transaction.message.accountKeys[0].pubkey.toString();
                        const postTokenBalances = parsedTransaction?.meta?.postTokenBalances || [];

                        const baseInfo = postTokenBalances.find(
                            (balance) =>
                                balance.owner ===
                                '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' &&
                                balance.mint !== 'So11111111111111111111111111111111111111112'
                        );

                        if (baseInfo) {
                            baseAddress = baseInfo.mint;
                        }
                    }

                    if (baseAddress) {
                        await processToken(signature, signer, baseAddress);
                    }
                } catch (error: unknown) {
                    let errorMessage = '[monitorNewTokens] Error: ';
                    if (error && typeof error === 'object' && 'message' in error) {
                        errorMessage += (error as { message: string }).message;
                    } else {
                        errorMessage += JSON.stringify(error);
                    }
                    console.error(errorMessage);
                }
            },
            'confirmed'
        );

        return () => {
            if (onLogsListenerId) {
                connection.removeOnLogsListener(onLogsListenerId);
            }
            clearInterval(tokenLimitInterval);
        };
    } else {
        if (typeof userSignature === 'string') {
            try {
                if (currentTokensToTrade.length >= maxTokensToTrade) {
                    console.warn(`[monitorNewTokens] Max tokens to trade reached: ${maxTokensToTrade}.`);
                    return;
                }

                let signer = '';
                let baseAddress = '';

                if ((userTypedValueIsBaseAddress && userTypedValueIsBaseAddress.length === 44) || (userTypedValueIsBaseAddress && userTypedValueIsBaseAddress.length === 43)) {
                    baseAddress = userTypedValueIsBaseAddress;
                }

                const parsedTransaction = await connection.getParsedTransaction(
                    userSignature,
                    {
                        maxSupportedTransactionVersion: 0,
                        commitment: 'confirmed',
                    }
                );

                if (parsedTransaction && parsedTransaction.meta && parsedTransaction.meta.err == null) {
                    signer = parsedTransaction?.transaction.message.accountKeys[0].pubkey.toString();
                    const postTokenBalances = parsedTransaction?.meta?.postTokenBalances || [];

                    const baseInfo = postTokenBalances.find(
                        (balance) =>
                            balance.owner ===
                            '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' &&
                            balance.mint !== 'So11111111111111111111111111111111111111112'
                    );

                    if (baseInfo && baseAddress === '') {
                        baseAddress = baseInfo.mint;
                    }
                }

                if (baseAddress) {
                    await processToken(userSignature, signer, baseAddress);
                }
            } catch (error: unknown) {
                let errorMessage = '[monitorNewTokens] Error: ';
                if (error && typeof error === 'object' && 'message' in error) {
                    errorMessage += (error as { message: string }).message;
                } else {
                    errorMessage += JSON.stringify(error);
                }
                console.error(errorMessage);
            }
        }
    }
}



function App() {
    const {
        isMonitoring,
        setIsMonitoring,
        tokenDataStore,
        setTokenDataStore,
        confirmedTokensStore,
        setConfirmedTokensStore,
        sellConfirmedTokensStore,
        setSellConfirmedTokensStore,
        isInitialized,
        setIsInitialized
    } = useContext(ValueContext);

    const confirmedTokensRef = useRef(confirmedTokensStore);
    const sellConfirmedTokensRef = useRef(sellConfirmedTokensStore);
    const previousPricesRef = useRef<Record<string, number>>({});
    const trackingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isTrackingRef = useRef(false);

    const [tokenList, setTokenList] = useState<TokenData[]>([]);
    const [typedSignatureValue, setTypedSignatureValue] = useState('');
    const [invalidTypedSignatureMessage, setInvalidTypedSignatureMessage] = useState('');
    const [buyTokenBySignatureOrBaseAddressIsLoading, setBuyTokenBySignatureOrBaseAddressIsLoading] = useState(false);
    const [sellingTokens, setSellingTokens] = useState<Record<string, boolean>>({});
    const [isMainDataLoading, setIsMainDataLoading] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyTokens, setHistoryTokens] = useState<TokenData[]>([]);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>('all');
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [visibleHistoryItemsAll, setVisibleHistoryItemsAll] = useState(15);
    const [visibleHistoryItemsInTrade, setVisibleHistoryItemsInTrade] = useState(15);
    const [visibleHistoryItemsSold, setVisibleHistoryItemsSold] = useState(15);
    const [walletBalance, setWalletBalance] = useState(0);
    const [showTooltip, setShowTooltip] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });


    const getCurrentVisibleItems = useCallback(() => {
        switch (historyFilter) {
            case 'all':
                return visibleHistoryItemsAll;
            case 'inTrade':
                return visibleHistoryItemsInTrade;
            case 'sold':
                return visibleHistoryItemsSold;
            default:
                return visibleHistoryItemsAll;
        }
    }, [historyFilter, visibleHistoryItemsAll, visibleHistoryItemsInTrade, visibleHistoryItemsSold]);

    const incrementVisibleItems = useCallback(() => {
        switch (historyFilter) {
            case 'all':
                setVisibleHistoryItemsAll(prev => prev + 25);
                break;
            case 'inTrade':
                setVisibleHistoryItemsInTrade(prev => prev + 25);
                break;
            case 'sold':
                setVisibleHistoryItemsSold(prev => prev + 25);
                break;
        }
    }, [historyFilter]);

    // Handle scroll event to load more history items when user scrolls to bottom
    const handleHistoryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        // When user scrolls to 80% of the way down, load more items
        if (scrollTop + clientHeight >= scrollHeight * 0.8) {
            incrementVisibleItems();
        }
    }, [incrementVisibleItems]);

    // fetch tokenDataStore from database
    const fetchTokenData = useCallback(async () => {
        try {
            if (tokenDataStore.length > 0) {
                return;
            }

            const res = await getTokenDataStoreFromDB();
            if (res && Array.isArray(res) && res.length > 0) {
                setTokenDataStore(res);
            }
        } catch (error) {
            console.error("Error fetching tokenDataStore from database:", error);
        }
    }, [setTokenDataStore]);

    // fetch confirmedTokensStore from database
    const fetchConfirmedTokensStore = useCallback(async () => {
        try {
            if (confirmedTokensStore.length > 0) {
                return;
            }

            const res = await getConfirmedTokensStoreFromDB();
            if (res && Array.isArray(res) && res.length > 0) {
                setConfirmedTokensStore(res);
            }
        } catch (error) {
            throw new Error("Error fetching confirmedTokensStore from database: " + error);
        }
    }, [setConfirmedTokensStore]);

    // fetch sellConfirmedTokensStore from database
    const fetchSellConfirmedTokensStore = useCallback(async () => {
        try {
            if (sellConfirmedTokensStore.length > 0) {
                return;
            }

            const res = await getSellConfirmedTokensStoreFromDB();
            if (res && Array.isArray(res) && res.length > 0) {
                setSellConfirmedTokensStore(res);
            }
        } catch (error) {
            throw new Error("Error fetching sellConfirmedTokensStore from database: " + error);
        }
    }, [setSellConfirmedTokensStore]);

    const updateConfirmedTokensRef = useCallback(() => {
        if (confirmedTokensStore && confirmedTokensStore.length > 0) {
            confirmedTokensRef.current = [...confirmedTokensStore];

            setConfirmedTokensStoreToDB(confirmedTokensStore);
        }
    }, [confirmedTokensStore]);

    const updateSellConfirmedTokensRef = useCallback(() => {
        if (sellConfirmedTokensStore && sellConfirmedTokensStore.length > 0) {
            sellConfirmedTokensRef.current = [...sellConfirmedTokensStore];

            setSellConfirmedTokensStoreToDB(sellConfirmedTokensStore);
        }
    }, [sellConfirmedTokensStore]);

    const trackTokenPrices = useCallback(async () => {
        if (isTrackingRef.current) {
            return;
        }
        isTrackingRef.current = true;

        try {
            // Function to track token prices in real-time
            if (confirmedTokensStore.length > 0) {
                // Check if all confirmed tokens have already been sold
                const unsoldConfirmedTokens = confirmedTokensStore.filter(confirmedToken => 
                    !sellConfirmedTokensStore.some(soldToken => 
                        soldToken.baseInfo.baseAddress === confirmedToken.baseInfo.baseAddress
                    )
                );

                // If all confirmed tokens have been sold, stop tracking
                if (unsoldConfirmedTokens.length === 0) {
                    isTrackingRef.current = false;
                    return;
                }

                // Get tokens that are confirmed and not sold
                const currentTokens = [...confirmedTokensStore].filter((token) => 
                    token.confirmed === true && token.sellConfirmed === false
                );

                // If no active tokens remain, stop the tracking
                if (currentTokens.length === 0) {
                    isTrackingRef.current = false;
                    return;
                }

                for (const token of currentTokens) {
                    try {
                        const tokenPriceInfo = await checkTokenPrice(token.baseInfo.baseAddress);

                        if (tokenPriceInfo && tokenPriceInfo.priceHistory) {
                            // Skip tokens with zero or invalid prices
                            if (!tokenPriceInfo.hasLiquidity || 
                                !tokenPriceInfo.price || 
                                parseFloat(tokenPriceInfo.price) <= 0 ||
                                tokenPriceInfo.priceHistory.currentPrice <= 0) {
                                continue;
                            }

                            // Skip tokens that have already been sold
                            if (sellConfirmedTokensStore.some(soldToken => 
                                soldToken.baseInfo.baseAddress === token.baseInfo.baseAddress
                            )) {
                                continue;
                            }

                            // Skip tokens that have lost more than 98% of their value
                            if (tokenPriceInfo.priceHistory.priceChangePercent < 2) {
                                continue;
                            }

                            // Only update if price has actually changed to avoid unnecessary re-renders
                            const existingToken = confirmedTokensStore.find(t => t.baseInfo.baseAddress === token.baseInfo.baseAddress);
                            const currentPrice = tokenPriceInfo.priceHistory.currentPrice;
                            const previousPrice = existingToken?.priceInfo?.currentPrice;

                            // Skip update if price hasn't changed (within a small tolerance)
                            if (previousPrice !== undefined && Math.abs(currentPrice - previousPrice) < 0.01) {
                                continue;
                            }

                            // Update the token price in confirmedTokensStore
                            setConfirmedTokensStore((prev) => {
                                return prev.map(t => {
                                    if (t.baseInfo.baseAddress === token.baseInfo.baseAddress) {
                                        const initialPrice = t.priceInfo?.initialPrice || tokenPriceInfo.priceHistory!.initialPrice;
                                        const currentPrice = tokenPriceInfo.priceHistory!.currentPrice;
                                        const priceChangePercent = initialPrice > 0 ? (currentPrice / initialPrice) * 100 : 0;

                                        return {
                                            ...t,
                                            priceInfo: {
                                                initialPrice,
                                                currentPrice,
                                                priceChangePercent,
                                                lastUpdated: tokenPriceInfo.priceHistory!.lastUpdated,
                                                lastPrice: 0,
                                                lastPricePercent: 0
                                            }
                                        };
                                    }
                                    return t;
                                });
                            });

                            setTokenDataStore((prev) => {
                                if (!prev || prev.length === 0) {
                                    return [];
                                }

                                return prev.map(t => {
                                    if (t.baseInfo.baseAddress === token.baseInfo.baseAddress) {
                                        const initialPrice = t.priceInfo?.initialPrice || tokenPriceInfo.priceHistory!.initialPrice;
                                        const currentPrice = tokenPriceInfo.priceHistory!.currentPrice;
                                        const priceChangePercent = initialPrice > 0 ? (currentPrice / initialPrice) * 100 : 0;

                                        return {
                                            ...t,
                                            priceInfo: {
                                                initialPrice,
                                                currentPrice,
                                                priceChangePercent,
                                                lastUpdated: tokenPriceInfo.priceHistory!.lastUpdated,
                                                lastPrice: 0,
                                                lastPricePercent: 0
                                            }
                                        };
                                    }
                                    return t;
                                });
                            });

                            // Check if token is sellable
                            const isSellable = await sellTokenFilter(token.baseInfo.baseAddress);

                            // If the token is ready to sell
                            if (isSellable && isTokenReadyToSell(token.baseInfo.baseAddress)) {
                                const tokenToSell = confirmedTokensRef.current?.filter(t => 
                                    t.baseInfo.baseAddress === token.baseInfo.baseAddress
                                );

                                if (tokenToSell && tokenToSell.length > 0) {
                                    const sellTokenResult = await sellToken(tokenToSell, token.sellConfirmed, token.sellConfirmedAt);

                                    if (sellTokenResult?.confirmedSellTokenData) {
                                        const updatedToken = {
                                            ...token,
                                            sellConfirmed: sellTokenResult.confirmedSellTokenData,
                                            sellConfirmedAt: sellTokenResult.confirmedAtSellTokenData,
                                            priceInfo: token.priceInfo
                                        };
                                        setConfirmedTokensStore(prev => {
                                            const updatedStore = [...new Set([updatedToken, ...prev])];
                                            confirmedTokensRef.current = updatedStore;
                                            return updatedStore;
                                        });
                                        setSellConfirmedTokensStore(prev => {
                                            const updatedStore = [...new Set([updatedToken, ...prev])];
                                            sellConfirmedTokensRef.current = updatedStore;
                                            return updatedStore;
                                        });

                                        // Remove this token from the ready-to-sell list
                                        clearTokenReadyToSell(token.baseInfo.baseAddress);

                                        // Update the token in tokenDataStore to mark it as sold
                                        await storeData(updatedToken, setTokenDataStore);

                                        // Check if all tokens have been sold after this one
                                        const remainingUnsoldTokens = confirmedTokensStore.filter(confirmedToken => 
                                            confirmedToken.baseInfo.baseAddress !== token.baseInfo.baseAddress && 
                                            !sellConfirmedTokensStore.some(soldToken => 
                                                soldToken.baseInfo.baseAddress === confirmedToken.baseInfo.baseAddress
                                            )
                                        );

                                        if (remainingUnsoldTokens.length === 0) {
                                            console.log('[trackTokenPrices] All confirmed tokens have been sold. Stopping price tracking.');
                                            if (trackingTimerRef.current) {
                                                clearTimeout(trackingTimerRef.current);
                                                trackingTimerRef.current = null;
                                            }
                                            isTrackingRef.current = false;
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`[trackTokenPrices] Error checking price for token ${token.baseInfo.baseAddress}:`, error);
                    }
                }

                // Schedule the next tracking interval instead of recursive calling
                if (trackingTimerRef.current) {
                    clearTimeout(trackingTimerRef.current);
                }

                trackingTimerRef.current = setTimeout(() => {
                    isTrackingRef.current = false;
                    trackTokenPrices();
                }, 5000);
            }
        } catch (error) {
            console.error('[trackTokenPrices] Error:', error);
        } finally {
            isTrackingRef.current = false;
        }
    }, [tokenDataStore, confirmedTokensStore, sellConfirmedTokensStore]);

    // Fetch main data from the database
    const initializeApp = useCallback(async () => {
        if (isInitialized) return;
        setIsMainDataLoading(true);

        try {
            await fetchTokenData();
            await fetchConfirmedTokensStore();
            await fetchSellConfirmedTokensStore();
            setIsInitialized(true);
        } catch (error) {
            throw new Error("Fetching main data from database failed: " + error);
        } finally {
            setIsMainDataLoading(false);
        }
    }, [isInitialized]);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    // fetch tokenHistory
    const fetchTokenHistory = useCallback(async () => {
        if (!isHistoryOpen) return;

        setIsHistoryLoading(true);
        try {
            const history = await getTokenHistoryFromDB();
            setHistoryTokens(history);
        } catch (error) {
            throw new Error("Error fetching tokenHistory: " + error);
        } finally {
            setIsHistoryLoading(false);
        }
    }, [isHistoryOpen]);

    useEffect(() => {
        fetchTokenHistory();
    }, [setTokenHistoryToDB, isHistoryOpen]);

    useEffect(() => {
        // Get tokens that are confirmed and not sold
        const currentTokensToTrade = [...tokenDataStore || []].filter((token) => 
            token.confirmed === true && token.sellConfirmed === false
        );
        if (currentTokensToTrade.length > 0 && !isTrackingRef.current) {
            trackTokenPrices();
        }
    }, [trackTokenPrices, tokenDataStore]);

    useEffect(() => {
        updateConfirmedTokensRef();
    }, [updateConfirmedTokensRef, confirmedTokensStore]);

    useEffect(() => {
        updateSellConfirmedTokensRef();
    }, [updateSellConfirmedTokensRef, sellConfirmedTokensStore]);

    useEffect(() => {
        if (tokenDataStore.length > 0) {
            setTokenDataStoreToDB(tokenDataStore);
            setTokenHistoryToDB(tokenDataStore);
        }
        setTokenList(tokenDataStore);
    }, [tokenDataStore]);

    useEffect(() => {
        async function getWalletBalance() {
            const balance = await getTradeAccountSolBalance();
            setWalletBalance(balance);
        }
        getWalletBalance();
    }, [tokenDataStore.length, sellConfirmedTokensStore]);

    // Detect price changes and apply animation
    useEffect(() => {
        const animatePriceUpdates = () => {
            if (confirmedTokensRef.current && confirmedTokensRef.current.length > 0) {
                const currentTokensToTrade = [...confirmedTokensRef.current].filter((token) => 
                    token.confirmed === true && token.sellConfirmed === false
                );

                currentTokensToTrade.forEach(token => {
                    if (token.priceInfo && token.baseInfo.baseAddress) {
                        const previousPrice = previousPricesRef.current[token.baseInfo.baseAddress];
                        const currentPrice = token.priceInfo.currentPrice;

                        if (previousPrice !== undefined && previousPrice !== currentPrice) {
                            const priceElement = document.querySelector(`[data-token-id="${token.baseInfo.baseAddress}"] .current-price`) as HTMLElement;
                            if (priceElement) {
                                priceElement.classList.remove('price-update-animation');
                                void priceElement.offsetWidth;
                                priceElement.classList.add('price-update-animation');
                            }
                        }

                        previousPricesRef.current[token.baseInfo.baseAddress] = currentPrice;
                    }
                });
            }
        };

        animatePriceUpdates();
    }, [tokenList]);

    // Stop tracking when component unmounts
    useEffect(() => {
        return () => {
            if (trackingTimerRef.current) {
                clearTimeout(trackingTimerRef.current);
                trackingTimerRef.current = null;
            }
        };
    }, []);

    // function to manually sell a token
    async function handleManualSell(token: TokenData) {
        if (!token || !token.baseInfo || !token.baseInfo.baseAddress || token.sellConfirmed) {
            return;
        }

        setSellingTokens(prev => ({ ...prev, [token.baseInfo.baseAddress]: true }));

        try {
            const tokenToSell = confirmedTokensStore.filter(t => 
                t.baseInfo.baseAddress === token.baseInfo.baseAddress
            );

            if (tokenToSell && tokenToSell.length > 0) {
                const sellTokenResult = await sellToken(tokenToSell, token.sellConfirmed, token.sellConfirmedAt);

                if (sellTokenResult?.confirmedSellTokenData) {
                    const updatedToken = {
                        ...token,
                        sellConfirmed: sellTokenResult.confirmedSellTokenData,
                        sellConfirmedAt: sellTokenResult.confirmedAtSellTokenData,
                        priceInfo: token.priceInfo
                    };
                    setSellConfirmedTokensStore(prev => {
                        const updatedStore = [...new Set([updatedToken, ...prev])];
                        sellConfirmedTokensRef.current = updatedStore;
                        return updatedStore;
                    });

                    // Remove this token from the ready-to-sell list
                    clearTokenReadyToSell(token.baseInfo.baseAddress);

                    // Update the token in tokenDataStore to mark it as sold
                    await storeData(updatedToken, setTokenDataStore);
                } else {
                    console.error(`Failed to sell token: ${token.baseInfo.baseAddress}. This token may have already been sold.`);
                }
            }
        } catch (error) {
            console.error(`[handleManualSell] Error selling token ${token.baseInfo.baseAddress}:`, error);
        } finally {
            setSellingTokens(prev => {
                const newState = { ...prev };
                delete newState[token.baseInfo.baseAddress];
                return newState;
            });
        }
    };

    async function handleManualRemoveNotConfirmedToken(token: TokenData) {
        if (tokenDataStore.length <= 1) {
            removeTokenFromDB(token.baseInfo.baseAddress);

            setTokenDataStore([]);
            setTokenList([]);

            setTimeout(async () => {
                try {
                    const res = await getTokenDataStoreFromDB();
                    if (res && Array.isArray(res)) {
                        setTokenDataStore(res);
                        setTokenList(res);
                    }
                } catch (error) {
                    throw new Error("Error refreshing token data: " + error);
                }
            }, 500);
        } else {
            const updatedStore = tokenDataStore.filter(t => 
                t.baseInfo.baseAddress !== token.baseInfo.baseAddress
            );

            setTokenDataStore(updatedStore);
            setTokenList(updatedStore);
        }
    }

    async function handleRemoveNotInTradeTokens() {
        const tokensInTrade = tokenDataStore.filter((token) => 
            token.confirmed === true && token.sellConfirmed === false
        );

        const tokensToRemove = tokenDataStore.filter((token) => 
            !(token.confirmed === true && token.sellConfirmed === false)
        );

        for (const token of tokensToRemove) {
            if (token.baseInfo && token.baseInfo.baseAddress) {
                await removeTokenFromDB(token.baseInfo.baseAddress);
            }
        }

        setTokenDataStore(tokensInTrade);
        setTokenList(tokensInTrade);

        setTimeout(async () => {
            try {
                const res = await getTokenDataStoreFromDB();
                if (res && Array.isArray(res)) {
                    setTokenDataStore(res);
                    setTokenList(res);
                }
            } catch (error) {
                throw new Error("Error refreshing token data: " + error);
            }
        }, 500);
    }

    async function handleMonitorTokens() {
        setIsMonitoring(true);
        await monitorNewTokens(
            solanaConnection,
            tokenDataStore,
            setTokenDataStore,
            false,
            confirmedTokensRef,
            setConfirmedTokensStore,
            setIsMonitoring
        );
    };

    async function handleBuyTokenBySignature() {
        if (typedSignatureValue.trim() === '') {
            setInvalidTypedSignatureMessage('Please enter a transaction signature or token address');
            return;
        }

        setBuyTokenBySignatureOrBaseAddressIsLoading(true);
        try {
            let signature = typedSignatureValue;
            let baseAddress = undefined;

            if (typedSignatureValue.length === 44 || typedSignatureValue.length === 43) {
                baseAddress = typedSignatureValue;
                const retrievedSignature = await getSignaturesForAddress(typedSignatureValue);
                if (retrievedSignature) {
                    signature = retrievedSignature;
                } else {
                    setInvalidTypedSignatureMessage('Please enter a valid token address');
                    setBuyTokenBySignatureOrBaseAddressIsLoading(false);
                    return;
                }
            } else if (typedSignatureValue.length !== 88) {
                setInvalidTypedSignatureMessage('Invalid input');
                setBuyTokenBySignatureOrBaseAddressIsLoading(false);
                return;
            }

            await monitorNewTokens(
                solanaConnection,
                tokenDataStore,
                setTokenDataStore,
                true,
                confirmedTokensRef,
                setConfirmedTokensStore,
                setIsMonitoring,
                signature,
                baseAddress
            );
        } catch (error) {
            console.error('[handleBuyTokenBySignature] Error buy token by signature/address:', error);
            setInvalidTypedSignatureMessage('Failed to convert token address to signature. Please try again later.');
        } finally {
            setBuyTokenBySignatureOrBaseAddressIsLoading(false);
        }
    }

    function toggleHistoryPanel() {
        setIsHistoryOpen((prev) => !prev);
    };

    async function handleExportToExcel() {
        const header = ["Title", "Base Address", "LP Signature", "Creator", "Confirmed At", "Sold At", "Initial Price (USDC)", "Price (USDC)", "Price Percentage", "Status"];
        const body = historyTokens.map(token => [
            token.tokenLabel || "",
            token.baseInfo.baseAddress || "",
            token.lpSignature || "",
            token.creator || "",
            token.confirmedAt || "",
            token.sellConfirmedAt || "",
            token.priceInfo ? token.priceInfo.initialPrice : 0,
            token.priceInfo ? token.priceInfo.lastPrice > 0 ? token.priceInfo.lastPrice : token.priceInfo.currentPrice : 0,
            token.priceInfo ? token.priceInfo.lastPricePercent > 0 ? token.priceInfo.lastPricePercent : token.priceInfo.priceChangePercent : 0,
            token.confirmed ? (token.sellConfirmed ? "Sold" : "Confirmed") : "Not Confirmed"
        ]);

        downloadExcel({
            fileName: "Solana Trading Sniper Bot History",
            sheet: "History",
            tablePayload: {
                header,
                body,
            },
        });
    };

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        if (viewportWidth <= 768) {
            setTooltipPosition({
                top: rect.top - 30,
                left: 10
            });
        } else {
            // A typical Solana wallet address is 44 chars
            // Estimate tooltip width based on font size and address length
            const estimatedTooltipWidth = isCopied ? 100 : 308; // 44 chars * ~7px per char
            let leftPosition = rect.left - (estimatedTooltipWidth / 2) + (rect.width / 2);
            leftPosition = Math.max(10, leftPosition);

            if (leftPosition + estimatedTooltipWidth > viewportWidth) {
                leftPosition = viewportWidth - estimatedTooltipWidth - 10;
            }

            setTooltipPosition({
                top: rect.top - 40,
                left: leftPosition
            });
        }

        setShowTooltip(true);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(walletPublicKey).then(() => {
            setIsCopied(true);
            setTimeout(() => {
                setIsCopied(false);
            }, 1000);
        });
    };


    return (
        <div className='app'>
            <div className="container">
                <div className="header">
                    <div className="title-container">
                        <h1>Solana Sniper Bot</h1>
                        <div className="title-lines">
                            <div className="title-line"></div>
                            <div className="title-line"></div>
                        </div>
                    </div>
                    <div className="crypto-decorations">
                        <img src={SolanaIcon} alt="" className="float-icon solana-icon-1" />
                        <img src={CryptoIcon} alt="" className="float-icon crypto-icon-1" />
                        <img src={SolanaIcon} alt="" className="float-icon solana-icon-2" />
                        <img src={CryptoIcon} alt="" className="float-icon crypto-icon-2" />
                    </div>
                    <div className="buyTokenBySignatureContainer">
                        <input
                            type="text"
                            placeholder="Enter Transaction Signature or Token Address"
                            onChange={(e) => {
                                setTypedSignatureValue(e.target.value);
                                if (invalidTypedSignatureMessage) {
                                    setInvalidTypedSignatureMessage('');
                                }
                            }}
                            disabled={buyTokenBySignatureOrBaseAddressIsLoading}
                        />
                        <button 
                            onClick={handleBuyTokenBySignature} 
                            className="monitor-button"
                            disabled={buyTokenBySignatureOrBaseAddressIsLoading}
                        >
                            {buyTokenBySignatureOrBaseAddressIsLoading ? 'Processing...' : 'Buy Token'}
                        </button>
                        {invalidTypedSignatureMessage !== '' && (
                            <div className="error-message">
                                {invalidTypedSignatureMessage}
                            </div>
                        )}
                    </div>
                    <button onClick={handleMonitorTokens} className={`monitor-button ${isMonitoring ? 'monitoring' : ''}`}>
                        {isMonitoring ? 'Monitoring' : 'Monitor New Tokens'}
                    </button>
                </div>
                <div className="left-controls">
                    <span
                        className="wallet-balance-span-container"
                    >
                        Balance: <span
                            className="wallet-balance"
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={() => setShowTooltip(false)}
                            onClick={copyToClipboard}
                        >{walletBalance.toFixed(5)} SOL</span>
                    </span>
                    {showTooltip && (
                        <div 
                            className="wallet-tooltip"
                            style={{ 
                                top: tooltipPosition.top, 
                                left: tooltipPosition.left 
                            }}
                        >
                            {isCopied ? 'Copied to clipboard!' : walletPublicKey}
                        </div>
                    )}
                </div>
                {tokenList.filter((token) => !token.confirmed || token.sellConfirmed).length > 0 &&
                    <div className="right-controls-first">
                        <button onClick={handleRemoveNotInTradeTokens} className="history-button">
                            Clear
                        </button>
                    </div>
                }
                <div className="right-controls">
                    <button onClick={toggleHistoryPanel} className={`history-button ${isHistoryOpen ? 'active' : ''}`}>
                        History
                    </button>
                </div>
                {tokenList.length > 0 ? (
                    <div className="table-container">
                        <table className="token-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>LP Signature</th>
                                    <th>Creator</th>
                                    <th>Confirmed At</th>
                                    <th>Sold At</th>
                                    <th>Price (USDC)</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tokenList.map((token, index) => (
                                    <tr key={index} data-token-id={token.baseInfo.baseAddress}>
                                        <td>
                                            {token.logoURI ? (
                                                <div className="token-info">
                                                    <img 
                                                        src={token.logoURI} 
                                                        alt={token.tokenLabel} 
                                                        className="token-logo" 
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                    <a 
                                                        href={`https://solscan.io/token/${token.baseInfo.baseAddress}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                    >
                                                        {token.tokenLabel || token.baseInfo.baseAddress.substring(0, 8) + (token.baseInfo.baseAddress.length > 8 ? '...' : '')}
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className="token-info">
                                                    <div 
                                                        className="token-logo generated-logo"
                                                        dangerouslySetInnerHTML={{ 
                                                            __html: generateTokenIcon(token.baseInfo.baseAddress)
                                                        }}
                                                    />
                                                    <a 
                                                        href={`https://solscan.io/token/${token.baseInfo.baseAddress}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                    >
                                                        {token.tokenLabel || token.baseInfo.baseAddress.substring(0, 8) + (token.baseInfo.baseAddress.length > 8 ? '...' : '')}
                                                    </a>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <a 
                                                href={`https://solscan.io/tx/${token.lpSignature}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                            >
                                                {token.lpSignature.substring(0, 12) + (token.lpSignature.length > 12 ? '...' : '')}
                                            </a>
                                        </td>
                                        <td>
                                            <a 
                                                href={`https://solscan.io/account/${token.creator}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                            >
                                                {token.creator.substring(0, 8) + (token.creator.length > 8 ? '...' : '')}
                                            </a>
                                        </td>
                                        <td>
                                            {token.confirmed ? token.confirmedAt : ''}
                                        </td>
                                        <td>
                                            {token.sellConfirmed ? token.sellConfirmedAt : ''}
                                        </td>
                                        <td>
                                            {token.confirmed ? (
                                                token.priceInfo ? (
                                                    <div className="price-info">
                                                        <div className="current-price">
                                                            {token.sellConfirmed ? 
                                                                (token.priceInfo.lastPrice > 0 ? token.priceInfo.lastPrice.toFixed(6) : token.priceInfo.currentPrice.toFixed(6)) :
                                                                token.priceInfo.currentPrice.toFixed(6)
                                                            }
                                                        </div>
                                                        <div className={`price-change ${
                                                            token.priceInfo.lastPricePercent > 0 
                                                                ? token.priceInfo.lastPricePercent >= 100 
                                                                    ? 'positive' 
                                                                    : token.priceInfo.lastPricePercent > 0.01 
                                                                        ? 'negative' 
                                                                        : 'lowLiquidity' 
                                                                : token.priceInfo.priceChangePercent >= 100 
                                                                    ? 'positive' 
                                                                    : token.priceInfo.priceChangePercent > 0.01 
                                                                        ? 'negative' 
                                                                        : 'lowLiquidity'
                                                        }`}>
                                                            {(token.priceInfo.lastPricePercent > 0.01 && token.priceInfo.lastPricePercent >= 100) || 
                                                            (token.priceInfo.lastPricePercent <= 0 && token.priceInfo.priceChangePercent >= 100) 
                                                                ? <img src={UpArrowIcon} alt="+" className="up-arrow-icon" /> 
                                                                : ''}
                                                            
                                                            {token.priceInfo.lastPricePercent > 0.01 
                                                                ? parseFloat(token.priceInfo.lastPricePercent.toFixed(2)) 
                                                                : token.priceInfo.priceChangePercent > 0.01 
                                                                    ? parseFloat(token.priceInfo.priceChangePercent.toFixed(2)) 
                                                                    : "Low Liquidity"}
                                                            
                                                            {(token.priceInfo.lastPricePercent > 0.01 || token.priceInfo.priceChangePercent > 0.01) 
                                                                ? '%' 
                                                                : ''}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    '...'
                                                )
                                            ) : (
                                                ''
                                            )}
                                        </td>
                                        <td>
                                            {!token.sellConfirmed ? (
                                                <span className={`tokenStatus ${token.confirmed ? 'confirmed' : 'not-confirmed'}`}>
                                                    {token.confirmed ? (
                                                        <img src={TokenConfirmedIcon} alt="Confirmed" className="status-icon" />
                                                    ) : (
                                                        <img src={TokenNotConfirmedIcon} alt="Not Confirmed" className="status-icon" />
                                                    )}
                                                    <span className="status-text">{token.confirmed ? 'Confirmed' : 'Not Confirmed'}</span>
                                                </span>
                                            ) : (
                                                <span className="tokenStatus">
                                                    <img src={TokenSoldIcon} alt="Sold" className="status-icon" />
                                                    <span className="status-text">Sold</span>
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {token.confirmed && !token.sellConfirmed ? (
                                                <button 
                                                    className="sell-button"
                                                    onClick={() => handleManualSell(token)}
                                                    disabled={sellingTokens[token.baseInfo.baseAddress]}
                                                >
                                                    {sellingTokens[token.baseInfo.baseAddress] ? 'Selling...' : 'Sell'}
                                                </button>
                                            ) : (
                                                token.sellConfirmed ? (
                                                    <button 
                                                        className="sold-button"
                                                        onClick={() => handleManualRemoveNotConfirmedToken(token)}
                                                    >
                                                        Hide
                                                    </button>
                                                ) : (
                                                    <button 
                                                        className="hide-button"
                                                        onClick={() => handleManualRemoveNotConfirmedToken(token)}
                                                    >
                                                        Hide
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    isMainDataLoading ? (
                        <div className="table-loader">
                            <img src={TableLoaderIcon} alt="Loading..." />
                        </div>
                    ) : (
                        <div className="no-tokens">
                            <p>No tokens detected yet.</p>
                        </div>
                    )
                )}
            </div>
            <div className={`historyContainer ${isHistoryOpen ? 'open' : ''}`}>
                <div className="history-header">
                    <h2>History Panel</h2>
                    <button onClick={toggleHistoryPanel} className="close-history">×</button>
                    <div className="history-actions">
                        <button 
                            className="export-button"
                            onClick={handleExportToExcel}
                        >
                            Export to Excel
                        </button>
                    </div>
                    <div className="history-filters">
                        <button 
                            className={`filter-btn ${historyFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setHistoryFilter('all')}
                        >
                            All
                        </button>
                        <button 
                            className={`filter-btn ${historyFilter === 'inTrade' ? 'active' : ''}`}
                            onClick={() => setHistoryFilter('inTrade')}
                        >
                            In Trade
                        </button>
                        <button 
                            className={`filter-btn ${historyFilter === 'sold' ? 'active' : ''}`}
                            onClick={() => setHistoryFilter('sold')}
                        >
                            Sold
                        </button>
                    </div>
                </div>
                <div className="history-content" onScroll={handleHistoryScroll}>
                    {isHistoryLoading ? (
                        <div className="history-cards">
                            <div className="history-loader">
                                <img src={HistoryLoaderIcon} alt="Loading..." />
                            </div>
                        </div>
                    ) : historyTokens.length > 0 ? (
                        <div className="history-cards">
                            {(() => {
                                const filteredTokens = filterHistoryTokens(historyTokens, historyFilter);
                                const visibleItems = getCurrentVisibleItems();

                                if (filteredTokens.length === 0) {
                                    return (
                                        <div className="no-history">
                                            <p>No items with status {historyFilter !== 'all' ? historyFilter : ''} found.</p>
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        {filteredTokens
                                            .slice(0, visibleItems)
                                            .map((token, index) => (
                                                <HistoryCard key={`${token.baseInfo.baseAddress}-${index}`} token={token} />
                                            ))}
                                        {visibleItems < filteredTokens.length && (
                                            <div className="pagination-loader">
                                                <img src={HistoryLoaderIcon} alt="Loading more..." />
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="no-history">
                            <p>Trading history is empty.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
};

export default App;