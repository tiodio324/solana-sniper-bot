import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { 
  Transaction, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  Keypair,
  VersionedTransaction
} from '@solana/web3.js';  
import { solanaConnection } from './config';
import { Buffer } from "buffer";
import { TokenData } from './types';
import { getJupiterQuoteResponse } from './functions';
window.Buffer = Buffer;

// Function to store token data
export async function storeData(
  data: TokenData,
  setTokenDataStore: React.Dispatch<React.SetStateAction<TokenData[]>>
): Promise<void> {
  try {
    setTokenDataStore((prev) => {
      // Find if this token already exists in the store
      const existingTokenIndex = prev.findIndex(
        token => token.baseInfo.baseAddress === data.baseInfo.baseAddress
      );

      if (existingTokenIndex >= 0) {
        // Update existing token with new data
        const updatedTokens = [...prev];

        if (data.sellConfirmed && !updatedTokens[existingTokenIndex].sellConfirmed) {
          const preservedPriceInfo = updatedTokens[existingTokenIndex].priceInfo;
          updatedTokens[existingTokenIndex] = {
            ...updatedTokens[existingTokenIndex],
            ...data,

            confirmed: data.confirmed || updatedTokens[existingTokenIndex].confirmed,
            confirmedAt: data.confirmedAt || updatedTokens[existingTokenIndex].confirmedAt,
            sellConfirmed: data.sellConfirmed,
            sellConfirmedAt: data.sellConfirmedAt,
            priceInfo: preservedPriceInfo && {
              initialPrice: preservedPriceInfo.initialPrice,
              currentPrice: preservedPriceInfo.currentPrice,
              priceChangePercent: preservedPriceInfo.priceChangePercent,
              lastUpdated: data.sellConfirmedAt || preservedPriceInfo.lastUpdated,
              lastPrice: preservedPriceInfo.currentPrice,
              lastPricePercent: (preservedPriceInfo.currentPrice / preservedPriceInfo.initialPrice) * 100
            }
          };
        } else {
          // Normal update (not being marked as sold)
          updatedTokens[existingTokenIndex] = {
            ...updatedTokens[existingTokenIndex],
            ...data,
            confirmed: data.confirmed || updatedTokens[existingTokenIndex].confirmed,
            confirmedAt: data.confirmedAt || updatedTokens[existingTokenIndex].confirmedAt,
            sellConfirmed: data.sellConfirmed || updatedTokens[existingTokenIndex].sellConfirmed,
            sellConfirmedAt: data.sellConfirmedAt || updatedTokens[existingTokenIndex].sellConfirmedAt,
            priceInfo: data.priceInfo ? {
              initialPrice: updatedTokens[existingTokenIndex].priceInfo?.initialPrice || data.priceInfo.initialPrice,
              currentPrice: data.priceInfo.currentPrice,
              priceChangePercent: updatedTokens[existingTokenIndex].priceInfo?.initialPrice && 
                updatedTokens[existingTokenIndex].priceInfo.initialPrice > 0 ? 
                (data.priceInfo.currentPrice / updatedTokens[existingTokenIndex].priceInfo.initialPrice) * 100 : 
                0,
              lastUpdated: data.priceInfo.lastUpdated,
              lastPrice: 0,
              lastPricePercent: 0
            } : updatedTokens[existingTokenIndex].priceInfo
          };
        }
        return updatedTokens;
      }

      return [data, ...prev];
    });
  } catch (error) {
    console.error(`Error storing data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to clear token data
export function clearTokenData(setTokenDataStore: React.Dispatch<React.SetStateAction<TokenData[]>>): void {
  setTokenDataStore([]);
} 

// Function to buy token using private key
export async function buyToken(
  baseAddress: string,
  confirmedNewTokenData: boolean,
  confirmedAtNewTokenData: string | undefined
) {
  try {
    const amountToBuy = import.meta.env.VITE_AMOUNT_TO_BUY * LAMPORTS_PER_SOL;
    const jupiterUrlSlippageBpsLow = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_LOW;
    const jupiterUrlSlippageBpsMedium = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_MEDIUM;
    const jupiterUrlSlippageBpsHigh = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_HIGH;
    const privateKeyString = import.meta.env.VITE_WALLET_PRIVATE_KEY;
    let quoteResponse;

    if (!privateKeyString) {
      throw new Error('WALLET_PRIVATE_KEY not found in .env file. privateKeyString: ' + privateKeyString);
    }
    
    // Parse the private key
    const secretKeyArray = JSON.parse(privateKeyString);
    const secretKey = new Uint8Array(secretKeyArray);
    
    // Create keypair from private key
    const walletKeypair = Keypair.fromSecretKey(secretKey);
    const walletPublicKey = walletKeypair.publicKey;
    
    // Set up token addresses
    const tokenMint = new PublicKey(baseAddress);
    
    // Get associated token account
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletPublicKey
    );
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if token account exists and create it if it doesn't
    const tokenAccount = await solanaConnection.getAccountInfo(userTokenAccount);
    if (!tokenAccount) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          walletPublicKey,
          userTokenAccount,
          walletPublicKey,
          tokenMint
        )
      );
    }

    quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToBuy.toString(), jupiterUrlSlippageBpsLow, true);

    if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
      quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToBuy.toString(), jupiterUrlSlippageBpsMedium, true);
      if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
        quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToBuy.toString(), jupiterUrlSlippageBpsHigh, true);
        if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
          console.warn('No routes found for buying token: ', tokenMint + '. Too many tokens in the queue.');
          return null;
        }
      }
    }
    
    // Get serialized transactions from Jupiter API
    const swapTransactionUrl = 'https://lite-api.jup.ag/swap/v1/swap';
    const swapRequestBody = {
      quoteResponse: quoteResponse,
      userPublicKey: walletPublicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000000,
          priorityLevel: "veryHigh"
        }
      }
    };
    
    const swapResponse = await fetch(swapTransactionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(swapRequestBody)
    });

    const swapData = await swapResponse.json();
    if (!swapData.swapTransaction) {
      throw new Error('Failed to get serialized transaction from Jupiter');
    }

    // Get latest blockhash BEFORE transaction signing and sending
    const latestBlockhash = await solanaConnection.getLatestBlockhash('confirmed');
    
    // Deserialize and sign the transaction
    const { swapTransaction } = swapData;
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const jupiterTransaction = VersionedTransaction.deserialize(swapTransactionBuf);

    jupiterTransaction.sign([walletKeypair]);
    
    // Send the transaction to the blockchain
    const signature = await solanaConnection.sendTransaction(jupiterTransaction, {
      skipPreflight: true,
      maxRetries: 5
    });

    try {
      // Wait for transaction to be confirmed with proper blockhash-based strategy
      const confirmation = await solanaConnection.confirmTransaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        signature: signature
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error(`[buyToken] Transaction failed for token ${baseAddress}:`, confirmation.value.err);
        return null;
      }

      let isConfirmed = confirmedNewTokenData;
      let confirmedAt = confirmedAtNewTokenData;

      // Get final status for additional verification
      const finalStatus = await solanaConnection.getSignatureStatus(signature, {searchTransactionHistory: true});

      if (finalStatus.value?.confirmationStatus === 'confirmed' || finalStatus.value?.confirmationStatus === 'finalized') {
        isConfirmed = true;
        const now = new Date();
        confirmedAt = now.getFullYear() + '.' + 
          String(now.getMonth() + 1).padStart(2, '0') + '.' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0');
      }

      return {
        signature,
        confirmedNewTokenData: isConfirmed,
        confirmedAtNewTokenData: confirmedAt
      };
    } catch (error) {
      console.warn('Failed to confirm transaction');
      return null;
    }
  } catch (error) {
    console.error(`[buyToken] Fatal Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function sellToken(
  confirmedTokensStore: TokenData[],
  confirmedSellTokenData: boolean,
  confirmedAtSellTokenData: string | undefined
) {
  const jupiterUrlSlippageBpsLow = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_LOW;
  const jupiterUrlSlippageBpsMedium = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_MEDIUM;
  const jupiterUrlSlippageBpsHigh = import.meta.env.VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_HIGH;
  const privateKeyString = import.meta.env.VITE_WALLET_PRIVATE_KEY;
  let quoteResponse;

  if (!privateKeyString) {
    throw new Error('WALLET_PRIVATE_KEY not found in .env file');
  }

  // Parse the private key
  const secretKeyArray = JSON.parse(privateKeyString);
  const secretKey = new Uint8Array(secretKeyArray);

  // Create keypair from private key
  const walletKeypair = Keypair.fromSecretKey(secretKey);

  // Process each confirmed token
  for (const token of confirmedTokensStore) {
    // Set up token addresses
    const tokenMint = new PublicKey(token.baseInfo.baseAddress);

    // Get associated token account for the token we want to sell
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletKeypair.publicKey
    );

    // Check bought token balance
    const tokenBalance = await solanaConnection.getTokenAccountBalance(userTokenAccount);
    if (!tokenBalance.value.uiAmount || tokenBalance.value.uiAmount <= 0) {
      console.warn(`Tokens balance: ${tokenBalance.value.uiAmount}, skipping sell`);
      return null;
    }

    // Use 100% balance of the token for selling
    const amountToSell = tokenBalance.value.amount;

    // Get quote for selling the token
    quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToSell, jupiterUrlSlippageBpsLow, false);

    if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
      quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToSell, jupiterUrlSlippageBpsMedium, false);
      if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
        quoteResponse = await getJupiterQuoteResponse(tokenMint, amountToSell, jupiterUrlSlippageBpsHigh, false);
        if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
          console.warn(`No routes found for selling token: ${token.baseInfo.baseAddress}. Too many tokens in the queue.`);
          return null;
        }
      }
    }

    try {
      // Get serialized transactions from Jupiter API
      const swapTransactionUrl = 'https://lite-api.jup.ag/swap/v1/swap';
      const swapRequestBody = {
        quoteResponse: quoteResponse,
        userPublicKey: walletKeypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 10000000,
            priorityLevel: "veryHigh"
          }
        }
      };

      const swapResponse = await fetch(swapTransactionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(swapRequestBody)
      });

      const swapData = await swapResponse.json();
      if (!swapData.swapTransaction) {
        const swapDataTry2 = await swapResponse.json();
        if (!swapDataTry2.swapTransaction) {
          const swapDataTry3 = await swapResponse.json();
          if (!swapDataTry3.swapTransaction) {
            throw new Error(`Failed to get serialized transaction from Jupiter for selling token: ${token.baseInfo.baseAddress}`);
          }
        }
      }

      // Get latest blockhash BEFORE transaction signing and sending
      const latestBlockhash = await solanaConnection.getLatestBlockhash('confirmed');

      // Deserialize and sign the transaction
      const { swapTransaction } = swapData;
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const jupiterTransaction = VersionedTransaction.deserialize(swapTransactionBuf);

      jupiterTransaction.sign([walletKeypair]);

      // Send the transaction to the blockchain
      const signature = await solanaConnection.sendTransaction(jupiterTransaction, {
        skipPreflight: true,
        maxRetries: 5
      });

      try {
        // Wait for confirmation
        const confirmation = await solanaConnection.confirmTransaction({
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          signature: signature
        }, 'confirmed');

        if (confirmation.value.err) {
          console.error(`[sellToken] Transaction failed for token: ${token.baseInfo.baseAddress}. Error: `, confirmation.value.err);
          return null;
        }

        // Create local variables for the confirmation state
        let isConfirmed = confirmedSellTokenData;
        let confirmedAt = confirmedAtSellTokenData;

        // Get final status for additional verification
        const finalStatus = await solanaConnection.getSignatureStatus(signature, {searchTransactionHistory: true});

        if (finalStatus.value?.confirmationStatus === 'confirmed' || finalStatus.value?.confirmationStatus === 'finalized') {
          isConfirmed = true;
          const now = new Date();
          confirmedAt = now.getFullYear() + '.' + 
            String(now.getMonth() + 1).padStart(2, '0') + '.' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
        }

        return { 
          signature, 
          confirmedSellTokenData: isConfirmed, 
          confirmedAtSellTokenData: confirmedAt 
        };
      } catch (error) {
        console.warn('Failed to confirm transaction');
        return null;
      }
    } catch (error) {
      console.error(`[sellToken] Fatal Error for token ${token.baseInfo.baseAddress}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
