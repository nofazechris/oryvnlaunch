import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURVE_EVENT_KEYS,
  SELECTORS,
  decodeCurveEvent,
  decodeFactoryEvent,
  eventSelector,
  type CurveEvent,
  type FactoryEvent,
  type RawEvent,
} from "./events.js";

// Real events captured from a devnet that ran: deploy the factory, launch a token (Standard
// preset, 2% creator allocation), buy 50 STRK, sell it all back, buy the rest of the curve so
// it graduates, then sell half of that after graduation. See scripts/capture-fixtures.mjs.
interface Fixture {
  factory: string;
  factoryEvents: RawEvent[];
  curveEvents: Record<string, RawEvent[]>;
  timestamps: Record<string, number>;
}
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/devnet-events.json", import.meta.url), "utf8"),
) as Fixture;

const [curveAddress] = Object.keys(fixture.curveEvents) as [string];
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const E18 = 10n ** 18n;

function decodeFactory(): FactoryEvent[] {
  return fixture.factoryEvents.flatMap((raw, i) => decodeFactoryEvent(raw, i) ?? []);
}
function decodeCurve(): CurveEvent[] {
  return (fixture.curveEvents[curveAddress] ?? []).flatMap((raw, i) => decodeCurveEvent(raw, i) ?? []);
}

describe("selectors", () => {
  it("matches the well-known selector of the ERC-20 Transfer event", () => {
    expect(eventSelector("Transfer")).toBe(0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9n);
  });

  it("matches the selectors the contracts really emitted", () => {
    const seen = new Set(
      [...fixture.factoryEvents, ...(fixture.curveEvents[curveAddress] ?? [])].map((e) => BigInt(e.keys[0] ?? "0x0")),
    );
    for (const name of ["LaunchCreated", "QuoteTokenSet", "TokensBought", "TokensSold", "Graduated"] as const) {
      expect(seen.has(SELECTORS[name]), `${name} was not emitted by the contracts`).toBe(true);
    }
  });

  it("exposes the curve selectors as hex for RPC filters", () => {
    expect(CURVE_EVENT_KEYS).toHaveLength(3);
    for (const key of CURVE_EVENT_KEYS) expect(key).toMatch(/^0x[0-9a-f]+$/);
  });
});

describe("factory events from a real node", () => {
  it("skips events we do not index (ownership), without throwing", () => {
    const decoded = fixture.factoryEvents.map((raw, i) => decodeFactoryEvent(raw, i));
    expect(decoded.filter((e) => e === null)).toHaveLength(1);
  });

  it("decodes the quote asset that was enabled at deployment", () => {
    const quote = decodeFactory().find((e) => e.type === "QuoteTokenSet");
    expect(quote).toMatchObject({
      type: "QuoteTokenSet",
      factory: fixture.factory,
      quoteToken: STRK,
      enabled: true,
      deployFee: 10n * E18,
      graduationRaise: 1_000n * E18,
    });
  });

  it("decodes a launch, including its strings, address keys and u256 amounts", () => {
    const launch = decodeFactory().find((e) => e.type === "LaunchCreated");
    expect(launch).toMatchObject({
      type: "LaunchCreated",
      factory: fixture.factory,
      curve: curveAddress,
      quoteToken: STRK,
      launchId: 0n,
      name: "Smoke Test",
      symbol: "SMOKE",
      metadataUri: "ipfs://smoke",
      preset: 1,
      creatorBps: 200,
      graduationRaise: 1_000n * E18,
      deployFee: 10n * E18,
    });
    expect(launch?.type === "LaunchCreated" && launch.token).toMatch(/^0x[0-9a-f]{64}$/);
    expect(launch?.type === "LaunchCreated" && launch.creator).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("curve events from a real node", () => {
  it("decodes the whole scenario in order", () => {
    expect(decodeCurve().map((e) => e.type)).toEqual([
      "TokensBought",
      "TokensSold",
      "TokensBought",
      "Graduated",
      "TokensSold",
    ]);
  });

  it("decodes the first buy: 50 STRK in, reserves after the trade", () => {
    const buy = decodeCurve()[0];
    expect(buy).toMatchObject({
      type: "TokensBought",
      curve: curveAddress,
      quoteIn: 50n * E18,
      tokensOut: 109_090_909_090_909_090_909_090_909n,
      quoteReserve: 550n * E18,
      tokenReserve: 1_090_909_090_909_090_909_090_909_091n,
    });
  });

  it("decodes the sell that returns exactly what was paid", () => {
    const sell = decodeCurve()[1];
    expect(sell).toMatchObject({
      type: "TokensSold",
      tokensIn: 109_090_909_090_909_090_909_090_909n,
      quoteOut: 50n * E18,
      quoteReserve: 500n * E18,
    });
  });

  it("decodes the graduating buy and the Graduated event that follows it", () => {
    const [, , buy, graduated] = decodeCurve();
    expect(buy).toMatchObject({ type: "TokensBought", quoteIn: 1_000n * E18, tokensOut: 800_000_000n * E18 });
    expect(graduated).toMatchObject({
      type: "Graduated",
      quoteRaised: 1_000n * E18,
      tokensSold: 800_000_000n * E18,
    });
    // Both come from the same transaction and block.
    expect(buy?.transactionHash).toBe(graduated?.transactionHash);
    expect(buy?.blockNumber).toBe(graduated?.blockNumber);
  });

  it("decodes a sell after graduation", () => {
    expect(decodeCurve()[4]).toMatchObject({ type: "TokensSold", quoteOut: 750n * E18 });
  });
});

describe("refusing bad data", () => {
  const buy = (fixture.curveEvents[curveAddress] ?? [])[0] as RawEvent;

  it("ignores an event with a selector we do not know", () => {
    expect(decodeCurveEvent({ ...buy, keys: ["0x1234", ...buy.keys.slice(1)] }, 0)).toBeNull();
    expect(decodeFactoryEvent({ ...buy, keys: ["0x1234"] }, 0)).toBeNull();
  });

  it("throws when an event has an extra felt instead of ignoring it", () => {
    expect(() => decodeCurveEvent({ ...buy, data: [...buy.data, "0x1"] }, 0)).toThrow(/left unread/);
  });

  it("throws when an event is missing felts", () => {
    expect(() => decodeCurveEvent({ ...buy, data: buy.data.slice(0, 5) }, 0)).toThrow(/ran out/);
  });

  it("throws when the key count is wrong", () => {
    expect(() => decodeCurveEvent({ ...buy, keys: [buy.keys[0] as string] }, 0)).toThrow(/ran out/);
  });
});
