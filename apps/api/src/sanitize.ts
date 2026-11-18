// Text a launch's creator wrote (name, ticker, description) is shown to everyone, so it is cleaned on the way out.
// React already escapes markup; this removes what escaping cannot: invisible and direction-flipping characters
// that let one name pass for another ("USDC" with a hidden right-to-left override, a ticker padded with
// zero-width spaces), and control characters that break lines and logs.

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
export function cleanText(value: string, max: number): string {
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

/** The metadata URI is only ever read by us, never shown as text, and ours are tiny: anything long is dropped. */
export const MAX_METADATA_URI_CHARS = 6_000;
