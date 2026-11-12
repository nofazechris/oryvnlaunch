// Reading Cairo-serialised data out of an event's `keys` and `data` arrays.
//
// Starknet events carry a flat list of felts. Our decoders read them in the same order the
// contract declared them, so the reader is deliberately strict: running out of felts, or
// leaving felts unread, is an error. A silent misread would put a wrong amount in the database.

const U128 = (1n << 128n) - 1n;

/** Canonical address form: 0x + 64 lowercase hex digits. */
export function normalizeAddress(value: string | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n || n >= 1n << 252n) throw new Error(`not a Starknet address: ${value}`);
  return "0x" + n.toString(16).padStart(64, "0");
}

export class FeltReader {
  private index = 0;

  constructor(
    private readonly felts: readonly string[],
    private readonly label = "event",
  ) {}

  /** One felt as a bigint. */
  felt(): bigint {
    const raw = this.felts[this.index];
    if (raw === undefined) throw new Error(`${this.label}: ran out of felts at position ${this.index}`);
    this.index += 1;
    return BigInt(raw);
  }

  address(): string {
    return normalizeAddress(this.felt());
  }

  bool(): boolean {
    const v = this.felt();
    if (v !== 0n && v !== 1n) throw new Error(`${this.label}: expected a bool, got ${v}`);
    return v === 1n;
  }

  /** A small unsigned integer (u8, u16, u32, u64) that fits a JS number. */
  smallInt(max = Number.MAX_SAFE_INTEGER): number {
    const v = this.felt();
    if (v > BigInt(max)) throw new Error(`${this.label}: ${v} is larger than ${max}`);
    return Number(v);
  }

  /** u64 and larger values that must stay exact. */
  u64(): bigint {
    const v = this.felt();
    if (v >= 1n << 64n) throw new Error(`${this.label}: ${v} does not fit a u64`);
    return v;
  }

  /** A u256 is two felts: low 128 bits, then high 128 bits. */
  u256(): bigint {
    const low = this.felt();
    const high = this.felt();
    if (low > U128 || high > U128) throw new Error(`${this.label}: malformed u256`);
    return low + (high << 128n);
  }

  /**
   * A Cairo ByteArray: a count of full 31-byte words, the words, then a partial last word and
   * its length in bytes. Decoded as UTF-8.
   */
  byteArray(): string {
    const fullWords = this.smallInt(10_000);
    const bytes: number[] = [];
    for (let i = 0; i < fullWords; i += 1) {
      pushBytes(bytes, this.felt(), 31);
    }
    const pending = this.felt();
    const pendingLength = this.smallInt(30);
    pushBytes(bytes, pending, pendingLength);
    return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes));
  }

  /** Throws if any felts were left unread. */
  finish(): void {
    if (this.index !== this.felts.length) {
      throw new Error(`${this.label}: ${this.felts.length - this.index} felts left unread`);
    }
  }
}

function pushBytes(out: number[], word: bigint, length: number): void {
  if (length === 0) return;
  const hex = word.toString(16).padStart(length * 2, "0");
  if (hex.length > length * 2) throw new Error("byte array word is longer than its declared length");
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
}
