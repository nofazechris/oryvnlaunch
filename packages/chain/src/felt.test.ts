import { describe, expect, it } from "vitest";
import { FeltReader, normalizeAddress } from "./felt.js";

const hex = (s: string) => "0x" + Buffer.from(s, "utf8").toString("hex");

describe("normalizeAddress", () => {
  it("pads to 64 hex digits and lowercases", () => {
    expect(normalizeAddress("0xABC")).toBe("0x" + "0".repeat(61) + "abc");
  });
  it("gives the same result for padded and unpadded forms", () => {
    expect(normalizeAddress("0x00000000000000000000000000000000000000000000000000000000000000ab")).toBe(
      normalizeAddress("0xab"),
    );
  });
  it("rejects values that cannot be a Starknet address", () => {
    expect(() => normalizeAddress(1n << 252n)).toThrow();
  });
});

describe("FeltReader", () => {
  it("reads a u256 as low then high", () => {
    const r = new FeltReader(["0x5", "0x1"]);
    expect(r.u256()).toBe(5n + (1n << 128n));
  });

  it("rejects a u256 half that is larger than 128 bits", () => {
    expect(() => new FeltReader([("0x" + "f".repeat(33)), "0x0"]).u256()).toThrow(/malformed/);
  });

  it("rejects a bool that is neither 0 nor 1", () => {
    expect(() => new FeltReader(["0x2"]).bool()).toThrow(/bool/);
  });

  it("errors when it runs out of felts instead of inventing values", () => {
    expect(() => new FeltReader(["0x1"]).u256()).toThrow(/ran out/);
  });

  it("errors when felts are left over", () => {
    const r = new FeltReader(["0x1", "0x2"]);
    r.felt();
    expect(() => r.finish()).toThrow(/left unread/);
  });

  describe("byteArray", () => {
    it("decodes an empty string", () => {
      expect(new FeltReader(["0x0", "0x0", "0x0"]).byteArray()).toBe("");
    });

    it("decodes a short string held entirely in the pending word", () => {
      expect(new FeltReader(["0x0", hex("Cairo"), "0x5"]).byteArray()).toBe("Cairo");
    });

    it("decodes a string that spans one full 31-byte word plus a remainder", () => {
      const text = "a".repeat(31) + "tail";
      const r = new FeltReader(["0x1", hex("a".repeat(31)), hex("tail"), "0x4"]);
      expect(r.byteArray()).toBe(text);
      r.finish();
    });

    it("decodes a string that is exactly 31 bytes", () => {
      const text = "b".repeat(31);
      expect(new FeltReader(["0x1", hex(text), "0x0", "0x0"]).byteArray()).toBe(text);
    });

    it("decodes multi-byte UTF-8", () => {
      expect(new FeltReader(["0x0", hex("Café ☕"), "0x9"]).byteArray()).toBe("Café ☕");
    });

    it("keeps leading zero bytes of a word", () => {
      // A pending word whose first byte is 0x00 must keep its declared length.
      expect(new FeltReader(["0x0", "0x41", "0x3"]).byteArray()).toBe("\u0000\u0000A");
    });

    it("refuses an absurd length instead of looping", () => {
      expect(() => new FeltReader(["0xffffffff", "0x0", "0x0"]).byteArray()).toThrow();
    });
  });
});
