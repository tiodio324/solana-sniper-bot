import { useState, ReactNode } from "react";
import { TokenData } from "./types";
import { ValueContext } from "./value-context";

interface ValueContextProviderProps {
    children: ReactNode;
}

export default function ValueContextProvider({ children }: ValueContextProviderProps) {
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [tokenDataStore, setTokenDataStore] = useState<TokenData[]>([]);
    const [confirmedTokensStore, setConfirmedTokensStore] = useState<TokenData[]>([]);
    const [sellConfirmedTokensStore, setSellConfirmedTokensStore] = useState<TokenData[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    // Wrap state update functions to prevent overriding with empty array when data is already present
    const safeSetTokenDataStore = (value: React.SetStateAction<TokenData[]>) => {
        setTokenDataStore((prev) => {
            // If prev has data and value would be empty, keep prev
            if (prev.length > 0 && (Array.isArray(value) && value.length === 0 || typeof value === 'function' && value(prev).length === 0)) {
                return prev;
            }
            return typeof value === 'function' ? value(prev) : value;
        });
    };

    const value = {
        isMonitoring,
        setIsMonitoring,
        tokenDataStore,
        setTokenDataStore: safeSetTokenDataStore,
        confirmedTokensStore,
        setConfirmedTokensStore,
        sellConfirmedTokensStore,
        setSellConfirmedTokensStore,
        isInitialized,
        setIsInitialized
    };

    return <ValueContext.Provider value={value}>{children}</ValueContext.Provider>;
} 