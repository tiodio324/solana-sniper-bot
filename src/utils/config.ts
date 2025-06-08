import { Connection, PublicKey } from '@solana/web3.js';

// Default RPC endpoint and WebSocket endpoint (using the environment variables)
const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT;
const RPC_WEBSOCKET_ENDPOINT = import.meta.env.VITE_RPC_WEBSOCKET_ENDPOINT;

// Establish the Solana connection
export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

// The PublicKey for rayFee (trusted constant)
export const rayFee = new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5');
