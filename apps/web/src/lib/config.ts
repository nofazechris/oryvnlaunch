// Where the app gets its data and which network it is on. Set these in apps/web/.env.local (see
// apps/web/.env.example). The values below are for local development.

/** The read API (apps/api). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type NetworkName = "devnet" | "sepolia" | "mainnet";

const requested = process.env.NEXT_PUBLIC_NETWORK;
/** Which Starknet network the app talks to. Defaults to devnet, the local test chain. */
export const NETWORK: NetworkName = requested === "sepolia" || requested === "mainnet" ? requested : "devnet";

export const NETWORK_LABEL: Record<NetworkName, string> = {
  devnet: "Local devnet",
  sepolia: "Starknet Sepolia testnet",
  mainnet: "Starknet mainnet",
};

/** The deployed token factory. Launches are created by calling it. Set after running contracts/scripts/deploy.sh. */
export const FACTORY_ADDRESS: string | null = process.env.NEXT_PUBLIC_FACTORY_ADDRESS?.trim() || null;

/**
 * A Starknet JSON-RPC endpoint the browser can read from (balances, trade previews, transaction status).
 * It is public, so use a key-less or domain-restricted URL. Devnet defaults to the local node.
 */
export const RPC_URL: string | null = process.env.NEXT_PUBLIC_RPC_URL?.trim() || (NETWORK === "devnet" ? "http://127.0.0.1:5050/rpc" : null);

/** The chain ids the connected wallet may report for this network (text or hex). Empty on devnet: any chain. */
export const EXPECTED_CHAIN_IDS: string[] =
  NETWORK === "sepolia" ? ["SN_SEPOLIA", "0x534e5f5345504f4c4941"] : NETWORK === "mainnet" ? ["SN_MAIN", "0x534e5f4d41494e"] : [];

/** Block explorer for transaction and address links. Devnet has none. */
export const EXPLORER_URL: string | null =
  NETWORK === "sepolia" ? "https://sepolia.voyager.online" : NETWORK === "mainnet" ? "https://voyager.online" : null;
