import { ref, get, set } from "firebase/database";
import { TokenData } from "./types";
import { db } from "./firebase";

// Create a type for sanitized token data with only the changes we need
type SanitizedTokenData = Omit<TokenData, 'priceInfo'> & {
    priceInfo: NonNullable<TokenData['priceInfo']> | null;
};

function sanitizeTokenData(token: TokenData): SanitizedTokenData {
    return {
        ...token,
        confirmedAt: token.confirmedAt || "",
        sellConfirmedAt: token.sellConfirmedAt || "",
        logoURI: token.logoURI || "",
        priceInfo: token.priceInfo ? {
            initialPrice: token.priceInfo.initialPrice,
            currentPrice: token.priceInfo.currentPrice,
            priceChangePercent: token.priceInfo.priceChangePercent,
            lastUpdated: token.priceInfo.lastUpdated,
            lastPrice: token.priceInfo.lastPrice || 0,
            lastPricePercent: token.priceInfo.lastPricePercent || 0
        } : null
    };
}

// Function to restore original undefined values
function restoreTokenData(token: SanitizedTokenData): TokenData {
    if (!token) return token as unknown as TokenData;

    return {
        ...token,
        confirmedAt: token.confirmedAt === "" ? undefined : token.confirmedAt,
        sellConfirmedAt: token.sellConfirmedAt === "" ? undefined : token.sellConfirmedAt,
        logoURI: token.logoURI === "" ? undefined : token.logoURI,
        priceInfo: token.priceInfo === null ? undefined : token.priceInfo
    };
}

export async function setTokenHistoryToDB(tokens: TokenData[]) {
    try {
        const existingHistory = await getTokenHistoryFromDB();
        const existingHistoryMap = new Map<string, TokenData>();

        existingHistory.forEach(token => {
            if (token.baseInfo && token.baseInfo.baseAddress) {
                existingHistoryMap.set(token.baseInfo.baseAddress, token);
            }
        });

        const updatedHistory = [...existingHistory];
        tokens.forEach((token) => {
            if (!token.baseInfo || !token.baseInfo.baseAddress) return;

            const baseAddress = token.baseInfo.baseAddress;
            const existingToken = existingHistoryMap.get(baseAddress);

            if (existingToken) {
                const index = updatedHistory.findIndex(t => 
                    t.baseInfo && t.baseInfo.baseAddress === baseAddress
                );

                if (index >= 0) {
                    updatedHistory[index] = {
                        ...existingToken,
                        confirmed: token.confirmed || existingToken.confirmed,
                        confirmedAt: token.confirmedAt || existingToken.confirmedAt,
                        sellConfirmed: token.sellConfirmed || existingToken.sellConfirmed,
                        sellConfirmedAt: token.sellConfirmedAt || existingToken.sellConfirmedAt,
                        logoURI: token.logoURI || existingToken.logoURI,
                        priceInfo: token.priceInfo ? {
                            initialPrice: existingToken.priceInfo?.initialPrice || token.priceInfo.initialPrice,
                            currentPrice: token.priceInfo.currentPrice,
                            priceChangePercent: token.priceInfo.priceChangePercent,
                            lastUpdated: token.priceInfo.lastUpdated,
                            lastPrice: token.priceInfo.lastPrice || 0,
                            lastPricePercent: token.priceInfo.lastPricePercent || 0
                        } : existingToken.priceInfo
                    };
                }
            } else {
                if (token.priceInfo) {
                    token.priceInfo.lastPrice = token.priceInfo.lastPrice || 0;
                    token.priceInfo.lastPricePercent = token.priceInfo.lastPricePercent || 0;
                }
                updatedHistory.unshift(token);
                existingHistoryMap.set(baseAddress, token);
            }
        });

        const sanitizedTokens = updatedHistory.map(sanitizeTokenData);
        await set(ref(db, "tokens/tokenHistory"), sanitizedTokens);
    } catch (e) {
        throw new Error("Error saving tokenHistory to database: " + e);
    }
}

export async function setTokenDataStoreToDB(tokens: TokenData[]) {
    try {
        const sanitizedTokens = tokens.map(sanitizeTokenData);
        await set(ref(db, "tokens/tokenDataStore"), sanitizedTokens);
    } catch (e) {
        throw new Error("Error saving tokenDataStore to database: " + e);
    }
}

export async function setConfirmedTokensStoreToDB(tokens: TokenData[]) {
    try {
        const sanitizedTokens = tokens.map(sanitizeTokenData);
        await set(ref(db, "tokens/confirmedTokensStore"), sanitizedTokens);
    } catch (e) {
        throw new Error("Error saving confirmedTokensStore to database: " + e);
    }
}

export async function setSellConfirmedTokensStoreToDB(tokens: TokenData[]) {
    try {
        const sanitizedTokens = tokens.map(sanitizeTokenData);
        await set(ref(db, "tokens/sellConfirmedTokensStore"), sanitizedTokens);
    } catch (e) {
        throw new Error("Error saving sellConfirmedTokensStore to database: " + e);
    }
}

export async function getTokenHistoryFromDB() {
    try {
        const snapshot = await get(ref(db, "tokens/tokenHistory"));
        const data = snapshot.val() as SanitizedTokenData[] | Record<string, SanitizedTokenData> | null;
        if (!data) return [];
        const arrayData = Array.isArray(data) ? data : Object.values(data) as SanitizedTokenData[];
        return arrayData.map(restoreTokenData);
    } catch (e) {
        throw new Error("Error getting tokenHistory from database: " + e);
    }
}

export async function getTokenHistoryFromDBByAddress(baseAddress: string) {
    try {
        const allHistory = await getTokenHistoryFromDB();
        const tokenHistory = allHistory.filter(token => 
            token.baseInfo && token.baseInfo.baseAddress === baseAddress
        );
        return tokenHistory.length > 0 ? tokenHistory[0] : null;
    } catch (e) {
        throw new Error("Error getting token history by address from database: " + e);
    }
}

export async function getTokenDataStoreFromDB() {
    try {
        const snapshot = await get(ref(db, "tokens/tokenDataStore"));
        const data = snapshot.val() as SanitizedTokenData[] | Record<string, SanitizedTokenData> | null;
        if (!data) return [];
        const arrayData = Array.isArray(data) ? data : Object.values(data) as SanitizedTokenData[];
        return arrayData.map(restoreTokenData);
    } catch (e) {
        throw new Error("Error getting tokenDataStore from database: " + e);
    }
}

export async function getConfirmedTokensStoreFromDB() {
    try {
        const snapshot = await get(ref(db, "tokens/confirmedTokensStore"));
        const data = snapshot.val() as Record<string, SanitizedTokenData> | SanitizedTokenData[] | null;
        if (!data) return [];
        const tokens = Array.isArray(data) ? data : Object.values(data);
        return tokens.map(restoreTokenData);
    } catch (e) {
        throw new Error("Error getting confirmedTokensStore from database: " + e);
    }
}

export async function getSellConfirmedTokensStoreFromDB() {
    try {
        const snapshot = await get(ref(db, "tokens/sellConfirmedTokensStore"));
        const data = snapshot.val() as Record<string, SanitizedTokenData> | SanitizedTokenData[] | null;
        if (!data) return [];
        const tokens = Array.isArray(data) ? data : Object.values(data);
        return tokens.map(restoreTokenData);
    } catch (e) {
        throw new Error("Error getting sellConfirmedTokensStore from database: " + e);
    }
}

export async function removeTokenFromDB(id: string) {
    try {
        let updatedData;
        const snapshot = await get(ref(db, "tokens/tokenDataStore"));
        const data = snapshot.val() as SanitizedTokenData[] | Record<string, SanitizedTokenData> | null;

        if (!data) return;

        if (Array.isArray(data)) {
            updatedData = data.filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        } else {
            updatedData = Object.values(data).filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        }

        await set(ref(db, "tokens/tokenDataStore"), updatedData);
    } catch (e) {
        throw new Error("Error removing token from database: " + e);
    }
}

export async function removeConfirmedTokenFromDB(id: string) {
    try {
        let updatedData;
        const snapshot = await get(ref(db, "tokens/confirmedTokensStore"));
        const data = snapshot.val() as SanitizedTokenData[] | Record<string, SanitizedTokenData> | null;

        if (!data) return;

        if (Array.isArray(data)) {
            updatedData = data.filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        } else {
            updatedData = Object.values(data).filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        }

        await set(ref(db, "tokens/confirmedTokensStore"), updatedData);
    } catch (e) {
        throw new Error("Error removing confirmedToken from database: " + e);
    }
}

export async function removeSellConfirmedTokenFromDB(id: string) {
    try {
        let updatedData;
        const snapshot = await get(ref(db, "tokens/sellConfirmedTokensStore"));
        const data = snapshot.val() as SanitizedTokenData[] | Record<string, SanitizedTokenData> | null;

        if (!data) return;

        if (Array.isArray(data)) {
            updatedData = data.filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        } else {
            updatedData = Object.values(data).filter(token => 
                token.baseInfo?.baseAddress !== id
            );
        }

        await set(ref(db, "tokens/sellConfirmedTokensStore"), updatedData);
    } catch (e) {
        throw new Error("Error removing sellConfirmedToken from database: " + e);
    }
}
