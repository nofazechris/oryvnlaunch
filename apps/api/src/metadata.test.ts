import { describe, expect, it } from "vitest";
import { parseMetadata } from "./metadata.js";

const uri = (doc: unknown) => "data:application/json;base64," + Buffer.from(JSON.stringify(doc)).toString("base64");
const HASH = "a".repeat(64);

describe("parseMetadata", () => {
  it("reads what the launch page writes", () => {
    const m = parseMetadata(uri({ v: 1, description: "A cat.", links: { web: "https://cat.example", x: "@cat", tg: "t.me/catchat", dc: "discord.gg/cats" }, image: `sha256:${HASH}` }));
    expect(m).toEqual({
      description: "A cat.",
      links: { web: "https://cat.example", x: "https://x.com/cat", tg: "https://t.me/catchat", dc: "https://discord.gg/cats" },
      imageHash: HASH,
    });
  });

  it("returns null for anything it does not read: other schemes, empty, garbage", () => {
    expect(parseMetadata("")).toBeNull();
    expect(parseMetadata("ipfs://bafy")).toBeNull();
    expect(parseMetadata("https://evil.example/meta.json")).toBeNull();
    expect(parseMetadata("data:application/json;base64,@@@")).toBeNull();
    expect(parseMetadata("data:application/json;base64," + Buffer.from("not json").toString("base64"))).toBeNull();
    expect(parseMetadata("data:text/html;base64," + Buffer.from("<script>").toString("base64"))).toBeNull();
  });

  it("refuses a document of the wrong shape or version, or an over-long description", () => {
    expect(parseMetadata(uri({ v: 2, description: "x" }))).toBeNull();
    expect(parseMetadata(uri({ description: "x" }))).toBeNull();
    expect(parseMetadata(uri({ v: 1, description: "x".repeat(281) }))).toBeNull();
    expect(parseMetadata(uri({ v: 1, image: "sha256:xyz" }))).toBeNull();
    expect(parseMetadata(uri({ v: 1, image: "https://evil.example/a.png" }))).toBeNull();
    expect(parseMetadata(uri([1, 2, 3]))).toBeNull();
  });

  it("refuses an oversized document without decoding it", () => {
    expect(parseMetadata("data:application/json;base64," + "A".repeat(10_000))).toBeNull();
  });

  it("drops a link that is not safe to put in an href, and keeps the rest", () => {
    const m = parseMetadata(
      uri({ v: 1, links: { web: "javascript:alert(1)", x: "@ok_handle", tg: 'https://t.me/evil" onclick="x', dc: "ftp://discord.gg/x", sneaky: "https://evil.example" } }),
    );
    expect(m?.links).toEqual({ x: "https://x.com/ok_handle" });
  });

  it("allows a document with only a description", () => {
    expect(parseMetadata(uri({ v: 1, description: "  hi  " }))).toEqual({ description: "hi", links: {}, imageHash: null });
  });
});
