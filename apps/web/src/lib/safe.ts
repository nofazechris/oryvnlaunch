// Rules for treating outside data as untrusted before it reaches the page.
//
// Names, tickers, links and hashes all ultimately come from strangers: a token's creator wrote the name, a
// wallet answered with a transaction hash, the API relayed a link. React already escapes text, so none of it
// can inject markup. These helpers cover what escaping does not: a link that runs script, a hash that
// rewrites an address, and invisible characters that make one name look like another.

import { EXPLORER_URL } from "./config";

const HEX_ID = /^0x[0-9a-fA-F]{1,64}$/;

/** A Starknet address, transaction hash or class hash: 0x and 1 to 64 hex digits, nothing else. */
export const isHexId = (value: unknown): value is string => typeof value === "string" && HEX_ID.test(value);

/** A link to a transaction on the block explorer, or null if there is no explorer or the hash is not a hash. */
export function explorerTx(hash: unknown): string | null {
  return EXPLORER_URL && isHexId(hash) ? `${EXPLORER_URL}/tx/${hash}` : null;
}

/** A link to a contract or account on the block explorer, or null. */
export function explorerContract(address: unknown): string | null {
  return EXPLORER_URL && isHexId(address) ? `${EXPLORER_URL}/contract/${address}` : null;
}

/** The link if it is plain http(s) and nothing else (never `javascript:`, `data:` and the like), otherwise null. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Code points that show nothing or change how text reads: control characters, zero-width and joiner characters,
// the bidirectional overrides and isolates, the soft hyphen, variation selectors, the byte-order mark and the
// invisible fillers. Listed as numbers so nothing here is itself invisible.
const INVISIBLE: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5],
  [0x180b, 0x180f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f], [0x3164, 0x3164], [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffc],
];
const isInvisible = (c: number) => INVISIBLE.some(([a, b]) => c >= a && c <= b);

/** Text from the chain made safe to show: hidden and direction-changing characters removed, runs of whitespace (and line breaks) turned into one space, length capped. */
export function cleanText(value: unknown, max = 100): string {
  if (typeof value !== "string") return "";
  let out = "";
  let pendingSpace = false;
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    const lineBreak = c === 9 || c === 10 || c === 13;
    if (lineBreak || (!isInvisible(c) && /\s/.test(ch))) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (isInvisible(c)) continue;
    if (pendingSpace) out += " ";
    pendingSpace = false;
    out += ch;
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}
