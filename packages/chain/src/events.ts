// Decoders for the events our contracts emit. The layouts mirror contracts/src/factory.cairo
// and contracts/src/curve.cairo exactly. If an event there changes, change it here and in the
// fixtures, or the indexer will refuse the event instead of storing a wrong value.
//
// Layout rule: `#[key]` fields come after the selector in `keys`; everything else is in
// `data`, in declaration order.

import { keccak_256 } from "@noble/hashes/sha3.js";
import { FeltReader, normalizeAddress } from "./felt.js";

/** One event as returned by `starknet_getEvents`. */
export interface RawEvent {
  from_address: string;
  keys: string[];
  data: string[];
  block_number: number;
  block_hash: string;
  transaction_hash: string;
}

/** starknet_keccak: the low 250 bits of keccak256 of the event's name. */
export function eventSelector(name: string): bigint {
  const digest = keccak_256(new TextEncoder().encode(name));
  let value = 0n;
  for (const byte of digest) value = (value << 8n) | BigInt(byte);
  return value & ((1n << 250n) - 1n);
}

export const SELECTORS = {
  LaunchCreated: eventSelector("LaunchCreated"),
  QuoteTokenSet: eventSelector("QuoteTokenSet"),
  TokensBought: eventSelector("TokensBought"),
  TokensSold: eventSelector("TokensSold"),
  Graduated: eventSelector("Graduated"),
} as const;

/** Selectors of the events a curve emits, as 0x-hex, for use in an RPC filter. */
export const CURVE_EVENT_KEYS: string[] = [SELECTORS.TokensBought, SELECTORS.TokensSold, SELECTORS.Graduated].map(
  (s) => "0x" + s.toString(16),
);

export interface EventPosition {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  /** Position among this contract's events in the same block. With the block and the contract
   * address it identifies an event, the same way every time the block is read. */
  indexInBlock: number;
}

export interface LaunchCreated extends EventPosition {
  type: "LaunchCreated";
  factory: string;
  creator: string;
  token: string;
  curve: string;
  quoteToken: string;
  launchId: bigint;
  name: string;
  symbol: string;
  metadataUri: string;
  preset: number;
  creatorBps: number;
  graduationRaise: bigint;
  deployFee: bigint;
}

export interface QuoteTokenSet extends EventPosition {
  type: "QuoteTokenSet";
  factory: string;
  quoteToken: string;
  enabled: boolean;
  deployFee: bigint;
  graduationRaise: bigint;
}

export interface TokensBought extends EventPosition {
  type: "TokensBought";
  curve: string;
  buyer: string;
  quoteIn: bigint;
  tokensOut: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
}

export interface TokensSold extends EventPosition {
  type: "TokensSold";
  curve: string;
  seller: string;
  tokensIn: bigint;
  quoteOut: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
}

export interface Graduated extends EventPosition {
  type: "Graduated";
  curve: string;
  quoteRaised: bigint;
  tokensSold: bigint;
}

export type FactoryEvent = LaunchCreated | QuoteTokenSet;
export type CurveEvent = TokensBought | TokensSold | Graduated;

function position(raw: RawEvent, indexInBlock: number): EventPosition {
  return {
    blockNumber: raw.block_number,
    blockHash: raw.block_hash,
    transactionHash: raw.transaction_hash,
    indexInBlock,
  };
}

/** Reader for the event's keys, past the selector. */
function keyReader(raw: RawEvent, name: string): FeltReader {
  return new FeltReader(raw.keys.slice(1), `${name} keys`);
}

/**
 * Decode an event emitted by the factory. Returns null for events we do not index, such as
 * the ownership events that come from the access-control component.
 */
export function decodeFactoryEvent(raw: RawEvent, indexInBlock: number): FactoryEvent | null {
  const selector = BigInt(raw.keys[0] ?? "0x0");
  const factory = normalizeAddress(raw.from_address);

  if (selector === SELECTORS.LaunchCreated) {
    const keys = keyReader(raw, "LaunchCreated");
    const creator = keys.address();
    const token = keys.address();
    keys.finish();
    const d = new FeltReader(raw.data, "LaunchCreated");
    const event: LaunchCreated = {
      ...position(raw, indexInBlock),
      type: "LaunchCreated",
      factory,
      creator,
      token,
      curve: d.address(),
      quoteToken: d.address(),
      launchId: d.u64(),
      name: d.byteArray(),
      symbol: d.byteArray(),
      metadataUri: d.byteArray(),
      preset: d.smallInt(2),
      creatorBps: d.smallInt(10_000),
      graduationRaise: d.u256(),
      deployFee: d.u256(),
    };
    d.finish();
    return event;
  }

  if (selector === SELECTORS.QuoteTokenSet) {
    const keys = keyReader(raw, "QuoteTokenSet");
    const quoteToken = keys.address();
    keys.finish();
    const d = new FeltReader(raw.data, "QuoteTokenSet");
    const event: QuoteTokenSet = {
      ...position(raw, indexInBlock),
      type: "QuoteTokenSet",
      factory,
      quoteToken,
      enabled: d.bool(),
      deployFee: d.u256(),
      graduationRaise: d.u256(),
    };
    d.finish();
    return event;
  }

  return null;
}

/**
 * Decode an event emitted by a bonding curve. Returns null for events we do not index, such as
 * the reentrancy guard's.
 */
export function decodeCurveEvent(raw: RawEvent, indexInBlock: number): CurveEvent | null {
  const selector = BigInt(raw.keys[0] ?? "0x0");
  const curve = normalizeAddress(raw.from_address);

  if (selector === SELECTORS.TokensBought) {
    const keys = keyReader(raw, "TokensBought");
    const buyer = keys.address();
    keys.finish();
    const d = new FeltReader(raw.data, "TokensBought");
    const event: TokensBought = {
      ...position(raw, indexInBlock),
      type: "TokensBought",
      curve,
      buyer,
      quoteIn: d.u256(),
      tokensOut: d.u256(),
      quoteReserve: d.u256(),
      tokenReserve: d.u256(),
    };
    d.finish();
    return event;
  }

  if (selector === SELECTORS.TokensSold) {
    const keys = keyReader(raw, "TokensSold");
    const seller = keys.address();
    keys.finish();
    const d = new FeltReader(raw.data, "TokensSold");
    const event: TokensSold = {
      ...position(raw, indexInBlock),
      type: "TokensSold",
      curve,
      seller,
      tokensIn: d.u256(),
      quoteOut: d.u256(),
      quoteReserve: d.u256(),
      tokenReserve: d.u256(),
    };
    d.finish();
    return event;
  }

  if (selector === SELECTORS.Graduated) {
    new FeltReader(raw.keys.slice(1), "Graduated keys").finish();
    const d = new FeltReader(raw.data, "Graduated");
    const event: Graduated = {
      ...position(raw, indexInBlock),
      type: "Graduated",
      curve,
      quoteRaised: d.u256(),
      tokensSold: d.u256(),
    };
    d.finish();
    return event;
  }

  return null;
}
