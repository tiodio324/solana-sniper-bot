// Define types for token data
export interface TokenData {
    lpSignature: string;
    creator: string;
    baseInfo: {
        baseAddress: string;
    };
    confirmed: boolean;
    confirmedAt?: string;
    sellConfirmed: boolean;
    sellConfirmedAt?: string;
    tokenLabel: string;
    logoURI?: string;
    priceInfo?: {
        initialPrice: number;
        currentPrice: number;
        priceChangePercent: number;
        lastUpdated: string;
        lastPrice: number;
        lastPricePercent: number;
    };
}

export type HistoryFilterType = 'all' | 'inTrade' | 'sold';
