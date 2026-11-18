// Building the calls a wallet signs to launch a token.
//
// Nothing here talks to a wallet or the chain: these are pure functions that turn what the creator typed
// into the exact calldata the factory expects, so they are easy to test. Sending is in wallet-store.ts.

export interface WalletCall {
  contract_address: string;
  entry_point: string;
  /** Felts as 0x-hex or decimal strings. */
  calldata: string[];
}

const encoder = new TextEncoder();
const MASK_128 = (1n << 128n) - 1n;

const hex = (bytes: Uint8Array): string => "0x" + (bytes.length ? [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") : "0");

/**
 * A Cairo `ByteArray` as calldata: [number of full 31-byte words, each full word, the leftover word,
 * the leftover's length in bytes].
 */
export function encodeByteArray(text: string): string[] {
  const bytes = encoder.encode(text);
  const full = Math.floor(bytes.length / 31);
  const out: string[] = [String(full)];
  for (let i = 0; i < full; i++) out.push(hex(bytes.slice(i * 31, (i + 1) * 31)));
  const rest = bytes.slice(full * 31);
  out.push(hex(rest), String(rest.length));
  return out;
}

/** A `u256` as two felts: low 128 bits, then high 128 bits. */
export function encodeU256(value: bigint): string[] {
  if (value < 0n || value >= 1n << 256n) throw new Error("Amount is out of range");
  return ["0x" + (value & MASK_128).toString(16), "0x" + (value >> 128n).toString(16)];
}

/** A short text of the launch, kept on-chain in `metadata_uri` until a metadata service exists. */
export function metadataUri(meta: { description: string; links?: Record<string, string>; /** `sha256:<hex>` from an image upload. */ image?: string }): string {
  const json = JSON.stringify({ v: 1, description: meta.description, links: meta.links ?? {}, ...(meta.image ? { image: meta.image } : {}) });
  const bytes = encoder.encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "data:application/json;base64," + btoa(binary);
}

export type PresetId = 0 | 1 | 2;

export interface LaunchInput {
  factory: string;
  name: string;
  symbol: string;
  metadataUri: string;
  /** The asset the deploy fee is paid in (STRK or USDC). The token itself always trades in STRK. */
  feeToken: string;
  preset: PresetId;
  /** Creator allocation in basis points, 0 to 500. */
  creatorBps: number;
  /** The deploy fee in the fee asset's smallest unit. The factory pulls it with transferFrom. */
  deployFee: bigint;
}

/** Approve the factory to take the deploy fee, then create the launch. Both go in one transaction. */
export function launchCalls(input: LaunchInput): WalletCall[] {
  if (input.creatorBps < 0 || input.creatorBps > 500 || !Number.isInteger(input.creatorBps)) throw new Error("Creator allocation must be between 0% and 5%");
  const calls: WalletCall[] = [];
  if (input.deployFee > 0n) {
    calls.push({ contract_address: input.feeToken, entry_point: "approve", calldata: [input.factory, ...encodeU256(input.deployFee)] });
  }
  calls.push({
    contract_address: input.factory,
    entry_point: "create_launch_paying_in",
    calldata: [
      ...encodeByteArray(input.name),
      ...encodeByteArray(input.symbol),
      ...encodeByteArray(input.metadataUri),
      input.feeToken,
      String(input.preset),
      String(input.creatorBps),
    ],
  });
  return calls;
}
