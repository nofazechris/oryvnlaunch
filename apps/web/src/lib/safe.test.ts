import { describe, expect, it, vi } from "vitest";
import { cleanText, isHexId, safeUrl } from "./safe";

describe("isHexId", () => {
  it("accepts addresses and hashes and nothing else", () => {
    expect(isHexId("0x" + "ab".repeat(32))).toBe(true);
    expect(isHexId("0x1")).toBe(true);
    for (const bad of ["", "0x", "0xzz", "1234", "0x" + "a".repeat(65), "0x12 34", "0x12/../x", "javascript:alert(1)", "0x12?x=1", 5, null, undefined, {}]) {
      expect(isHexId(bad), String(bad)).toBe(false);
    }
  });
});

describe("explorer links", () => {
  it("are built only from real hashes, so a wallet cannot steer a link somewhere else", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "sepolia");
    const { explorerTx, explorerContract } = await import("./safe");
    expect(explorerTx("0xabc")).toBe("https://sepolia.voyager.online/tx/0xabc");
    expect(explorerContract("0xabc")).toBe("https://sepolia.voyager.online/contract/0xabc");
    expect(explorerTx("0xabc/../../evil")).toBeNull();
    expect(explorerTx("https://evil.example")).toBeNull();
    expect(explorerContract(undefined)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("do not exist on a network with no explorer", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "devnet");
    const { explorerTx } = await import("./safe");
    expect(explorerTx("0xabc")).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("safeUrl", () => {
  it("allows http and https links", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
  });
  it("refuses everything that could run script or leave the web", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd", "ftp://x.com", "//evil.example", "not a url", "", null, 42]) {
      expect(safeUrl(bad), String(bad)).toBeNull();
    }
    expect(safeUrl("https://example.com/" + "a".repeat(400))).toBeNull();
  });
});

describe("cleanText", () => {
  it("removes characters that flip text direction or hide inside a name", () => {
    expect(cleanText("USDC‮tide")).toBe("USDCtide"); // right-to-left override
    expect(cleanText("S​T‍R‎K")).toBe("STRK"); // zero-width space, joiner, mark
    expect(cleanText("⁦abc⁩")).toBe("abc"); // isolates
    expect(cleanText("a\u0000b\u0007c\u009Dd")).toBe("abcd"); // control characters
    expect(cleanText("﻿hello")).toBe("hello"); // byte-order mark
  });

  it("keeps ordinary text, including other languages and emoji", () => {
    expect(cleanText("Cairo Builders")).toBe("Cairo Builders");
    expect(cleanText("猫の通貨")).toBe("猫の通貨");
    expect(cleanText("Moon 🚀")).toBe("Moon 🚀");
  });

  it("collapses whitespace, trims and caps the length", () => {
    expect(cleanText("  a \n\t b   c  ")).toBe("a b c");
    expect(cleanText("x".repeat(500), 50)).toHaveLength(50);
  });

  it("returns an empty string for anything that is not text", () => {
    for (const bad of [null, undefined, 5, {}, []]) expect(cleanText(bad)).toBe("");
  });
});
