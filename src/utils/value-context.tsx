import { createContext } from "react";
import { TokenData } from "./types";

interface ValueContextType {
    isMonitoring: boolean;
    setIsMonitoring: React.Dispatch<React.SetStateAction<boolean>>;
    tokenDataStore: TokenData[];
    setTokenDataStore: React.Dispatch<React.SetStateAction<TokenData[]>>;
    confirmedTokensStore: TokenData[];
    setConfirmedTokensStore: React.Dispatch<React.SetStateAction<TokenData[]>>;
    sellConfirmedTokensStore: TokenData[];
    setSellConfirmedTokensStore: React.Dispatch<React.SetStateAction<TokenData[]>>;
    isInitialized: boolean;
    setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ValueContext = createContext<ValueContextType>({
    isMonitoring: false,
    setIsMonitoring: () => {},
    tokenDataStore: [],
    setTokenDataStore: () => {},
    confirmedTokensStore: [],
    setConfirmedTokensStore: () => {},
    sellConfirmedTokensStore: [],
    setSellConfirmedTokensStore: () => {},
    isInitialized: false,
    setIsInitialized: () => {},
});