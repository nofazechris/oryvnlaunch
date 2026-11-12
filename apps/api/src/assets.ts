// What the indexer cannot know from events: the symbol and decimals of the quote assets. An
// amount is meaningless to a client without its decimals, so the API attaches them.
//
// Addresses are checked against Starknet's and Circle's documentation:
//   STRK (same on mainnet and Sepolia): https://docs.starknet.io/learn/cheatsheets/chain-info
//   USDC (native, Circle):               https://developers.circle.com/stablecoins/usdc-contract-addresses
// The older bridged USDC.e is deliberately absent: it is not a supported quote asset.

import { normalizeAddress } from "@launchpad/chain";

export interface AssetInfo {
  symbol: string;
  decimals: number;
}

const KNOWN: [string, AssetInfo][] = [
  ["0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", { symbol: "STRK", decimals: 18 }],
  ["0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb", { symbol: "USDC", decimals: 6 }], // mainnet
  ["0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343", { symbol: "USDC", decimals: 6 }], // Sepolia
];

const byAddress = new Map(KNOWN.map(([address, info]) => [normalizeAddress(address), info]));

export interface QuoteAsset {
  address: string;
  /** Null when the asset is not one we recognise. */
  symbol: string | null;
  decimals: number | null;
}

export function describeQuoteAsset(address: string): QuoteAsset {
  const info = byAddress.get(normalizeAddress(address));
  return { address: normalizeAddress(address), symbol: info?.symbol ?? null, decimals: info?.decimals ?? null };
}
