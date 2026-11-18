import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURVE_EVENT_KEYS,
  SELECTORS,
  TOKEN_EVENT_KEYS,
  decodeCurveEvent,
  decodeFactoryEvent,
  decodeTokenEvent,
  eventSelector,
  type CurveEvent,
  type FactoryEvent,
  type RawEvent,
} from "./events.js";
import { normalizeAddress } from "./felt.js";

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
    for (const name of ["LaunchCreated", "QuoteTokenSet", "FeeAssetSet", "TokensBought", "TokensSold", "Graduated"] as const) {
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
      tradeFeeBps: 100,
      creatorFeeShareBps: 5_000,
      feeToken: STRK,
    });
    expect(launch?.type === "LaunchCreated" && launch.token).toMatch(/^0x[0-9a-f]{64}$/);
    expect(launch?.type === "LaunchCreated" && launch.creator).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("deploy-fee assets from a real node", () => {
  it("decodes the fee asset that was enabled at deployment", () => {
    const fee = decodeFactory().find((e) => e.type === "FeeAssetSet");
    expect(fee).toMatchObject({ type: "FeeAssetSet", factory: fixture.factory, feeToken: STRK, enabled: true, deployFee: 10n * E18 });
  });

  it("decodes a USDC fee asset (6 decimals) being repriced, from the layout the contract emits", () => {
    const USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";
    const base = fixture.factoryEvents.find((e) => BigInt(e.keys[0] ?? "0") === SELECTORS.FeeAssetSet)!;
    const raw: RawEvent = { ...base, keys: [base.keys[0]!, USDC], data: ["0x1", "0x1e8480", "0x0"] };
    expect(decodeFactoryEvent(raw, 0)).toMatchObject({ type: "FeeAssetSet", feeToken: USDC, enabled: true, deployFee: 2_000_000n });
    const off: RawEvent = { ...raw, data: ["0x0", "0x1e8480", "0x0"] };
    expect(decodeFactoryEvent(off, 0)).toMatchObject({ enabled: false });
  });

  it("refuses a malformed FeeAssetSet instead of guessing", () => {
    const base = fixture.factoryEvents.find((e) => BigInt(e.keys[0] ?? "0") === SELECTORS.FeeAssetSet)!;
    expect(() => decodeFactoryEvent({ ...base, data: ["0x1"] }, 0)).toThrow();
    expect(() => decodeFactoryEvent({ ...base, keys: [base.keys[0]!] }, 0)).toThrow();
  });

  it("a LaunchCreated from the old contract (no fee asset) is refused, so an old factory is never half-read", () => {
    const base = fixture.factoryEvents.find((e) => BigInt(e.keys[0] ?? "0") === SELECTORS.LaunchCreated)!;
    expect(() => decodeFactoryEvent({ ...base, data: base.data.slice(0, -1) }, 0)).toThrow();
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
      "TokensBought",
    ]);
  });

  it("skips the fee-claim events, which we do not index, without throwing", () => {
    const raw = fixture.curveEvents[curveAddress] ?? [];
    const decoded = raw.map((e, i) => decodeCurveEvent(e, i));
    // 5 trades + Graduated are decoded; the two FeesClaimed events at the end are skipped.
    expect(decoded.filter((e) => e !== null)).toHaveLength(6);
    expect(decoded.filter((e) => e === null)).toHaveLength(2);
    expect(decoded.slice(-2)).toEqual([null, null]);
  });

  it("decodes the first buy: 50 STRK in, reserves after the trade", () => {
    const buy = decodeCurve()[0];
    expect(buy).toMatchObject({
      type: "TokensBought",
      curve: curveAddress,
      quoteIn: 50n * E18,
      fee: E18 / 2n, // 1% of the 50 that went into the curve
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
      fee: E18 / 2n,
      quoteReserve: 500n * E18,
    });
  });

  it("decodes the graduating buy and the Graduated event that follows it", () => {
    const [, , buy, graduated] = decodeCurve();
    expect(buy).toMatchObject({ type: "TokensBought", quoteIn: 1_000n * E18, fee: 10n * E18, tokensOut: 800_000_000n * E18 });
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
    expect(decodeCurve()[4]).toMatchObject({ type: "TokensSold", quoteOut: 750n * E18, fee: (15n * E18) / 2n });
  });

  it("decodes a buy after graduation: 20 STRK budget = 19.80198... into the curve plus its fee", () => {
    expect(decodeCurve()[5]).toMatchObject({
      type: "TokensBought",
      quoteIn: 19_801_980_198_019_801_980n,
      fee: 198_019_801_980_198_020n,
    });
    // the buyer paid exactly the budget
    const buy = decodeCurve()[5];
    expect(buy?.type === "TokensBought" && buy.quoteIn + buy.fee).toBe(20n * E18);
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

// Real Transfer events captured from the same devnet, with every holder's balance as the token
// contract itself reports it. See scripts/capture-token-fixtures.mjs.
interface TokenFixture {
  tokens: Record<string, { curve: string; creator: string; factory: string; events: RawEvent[]; balances: Record<string, string> }>;
}
const tokenFixture = JSON.parse(
  readFileSync(new URL("../fixtures/devnet-token-events.json", import.meta.url), "utf8"),
) as TokenFixture;
const ZERO = "0x" + "0".repeat(64);

describe("token transfers from a real node", () => {
  it("decodes every captured Transfer and skips Approval", () => {
    let transfers = 0;
    let skipped = 0;
    for (const t of Object.values(tokenFixture.tokens)) {
      for (const raw of t.events) {
        const decoded = decodeTokenEvent(raw, 0);
        if (decoded) transfers += 1;
        else skipped += 1;
      }
    }
    expect(transfers).toBeGreaterThan(5);
    // the capture filtered on the Transfer selector, so nothing was skipped
    expect(skipped).toBe(0);
    expect(decodeTokenEvent({ ...Object.values(tokenFixture.tokens)[0]!.events[0]!, keys: ["0x134692b230b9e1ffa39098904722134159652b09c5bc41d88d6698779d228ff", "0x1", "0x2"] }, 0)).toBeNull();
  });

  it("adding up the transfers gives exactly the balances the token contract reports", () => {
    for (const [token, t] of Object.entries(tokenFixture.tokens)) {
      const sums = new Map<string, bigint>();
      for (const raw of t.events) {
        const e = decodeTokenEvent(raw, 0)!;
        expect(e.token).toBe(normalizeAddress(token));
        sums.set(e.from, (sums.get(e.from) ?? 0n) - e.value);
        sums.set(e.to, (sums.get(e.to) ?? 0n) + e.value);
      }
      // the zero address is the mint source: its "balance" is minus the total supply, not a real holder
      const real = [...sums].filter(([a, v]) => a !== ZERO && v !== 0n);
      for (const [address, value] of real) expect(value.toString(), `${token} ${address}`).toBe(t.balances[address]);
      for (const [address, expected] of Object.entries(t.balances)) {
        if (address === ZERO || expected === "0") continue;
        expect(sums.get(address)?.toString(), `${token} ${address}`).toBe(expected);
      }
      const minted = -(sums.get(ZERO) ?? 0n);
      expect(minted).toBe(1_000_000_000n * E18);
    }
  });

  it("refuses a malformed Transfer instead of guessing", () => {
    const good = Object.values(tokenFixture.tokens)[0]!.events[0]!;
    expect(() => decodeTokenEvent({ ...good, data: [good.data[0]!] }, 0)).toThrow();
    expect(() => decodeTokenEvent({ ...good, keys: [good.keys[0]!, good.keys[1]!] }, 0)).toThrow();
  });

  it("exposes the Transfer selector as hex for RPC filters", () => {
    expect(TOKEN_EVENT_KEYS).toEqual(["0x" + SELECTORS.Transfer.toString(16)]);
  });
});
