import { describe, expect, it } from "vitest";
import { encodeByteArray, encodeU256, launchCalls, metadataUri } from "./launch-tx";

describe("encodeByteArray", () => {
  it("encodes an empty string as no full words, an empty pending word and length 0", () => {
    expect(encodeByteArray("")).toEqual(["0", "0x0", "0"]);
  });

  it("puts a short string in the pending word", () => {
    // "Hi" = 0x4869
    expect(encodeByteArray("Hi")).toEqual(["0", "0x4869", "2"]);
  });

  it("splits at exactly 31 bytes: one full word and an empty pending word", () => {
    const text = "a".repeat(31);
    expect(encodeByteArray(text)).toEqual(["1", "0x" + "61".repeat(31), "0x0", "0"]);
  });

  it("keeps the leftover after a full word", () => {
    const out = encodeByteArray("a".repeat(31) + "bc");
    expect(out).toEqual(["1", "0x" + "61".repeat(31), "0x6263", "2"]);
  });

  it("counts bytes, not characters", () => {
    // "é" is two bytes in UTF-8 (0xc3a9)
    expect(encodeByteArray("é")).toEqual(["0", "0xc3a9", "2"]);
  });
});

describe("encodeU256", () => {
  it("splits into low and high 128-bit halves", () => {
    expect(encodeU256(5n)).toEqual(["0x5", "0x0"]);
    expect(encodeU256(1n << 128n)).toEqual(["0x0", "0x1"]);
    expect(encodeU256((1n << 256n) - 1n)).toEqual(["0x" + "f".repeat(32), "0x" + "f".repeat(32)]);
  });

  it("refuses values that do not fit", () => {
    expect(() => encodeU256(-1n)).toThrow();
    expect(() => encodeU256(1n << 256n)).toThrow();
  });
});

describe("launchCalls", () => {
  const base = {
    factory: "0xfac",
    name: "Cairo",
    symbol: "CAIRO",
    metadataUri: "",
    feeToken: "0x57",
    preset: 1 as const,
    creatorBps: 200,
    deployFee: 10n * 10n ** 18n,
  };

  it("approves the factory for the fee, then creates the launch, in that order", () => {
    const calls = launchCalls(base);
    expect(calls.map((c) => [c.contract_address, c.entry_point])).toEqual([
      ["0x57", "approve"],
      ["0xfac", "create_launch_paying_in"],
    ]);
    expect(calls[0]!.calldata).toEqual(["0xfac", "0x8ac7230489e80000", "0x0"]);
  });

  it("lays out create_launch calldata in the contract's argument order", () => {
    const create = launchCalls(base)[1]!;
    expect(create.calldata).toEqual([
      ...encodeByteArray("Cairo"),
      ...encodeByteArray("CAIRO"),
      ...encodeByteArray(""),
      "0x57",
      "1",
      "200",
    ]);
  });

  it("skips the approve call when the deploy fee is zero", () => {
    expect(launchCalls({ ...base, deployFee: 0n }).map((c) => c.entry_point)).toEqual(["create_launch_paying_in"]);
  });

  it("rejects a creator allocation above 5% or a fractional one", () => {
    expect(() => launchCalls({ ...base, creatorBps: 501 })).toThrow();
    expect(() => launchCalls({ ...base, creatorBps: -1 })).toThrow();
    expect(() => launchCalls({ ...base, creatorBps: 1.5 })).toThrow();
    expect(() => launchCalls({ ...base, creatorBps: 500 })).not.toThrow();
  });
});

describe("metadataUri", () => {
  it("includes the image reference only when there is one", () => {
    const decode = (uri: string) => JSON.parse(Buffer.from(uri.split(",")[1]!, "base64").toString("utf8"));
    expect(decode(metadataUri({ description: "d" }))).toEqual({ v: 1, description: "d", links: {} });
    expect(decode(metadataUri({ description: "d", image: "sha256:" + "a".repeat(64) })).image).toBe("sha256:" + "a".repeat(64));
  });

  it("round-trips through base64 JSON, including non-ASCII text", () => {
    const uri = metadataUri({ description: "café ☕", links: { x: "@oryvn" } });
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
    const json = Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");
    expect(JSON.parse(json)).toEqual({ v: 1, description: "café ☕", links: { x: "@oryvn" } });
  });
});
