import { describe, expect, it } from "vitest";
import { onboardingSteps, type StepInput } from "./onboarding";

const base: StepInput = { connected: false, restoring: false, launched: null, funded: null, traded: null };
const by = (i: Partial<StepInput>) => Object.fromEntries(onboardingSteps({ ...base, ...i }).map((s) => [s.key, s]));
const mine = [{ name: "Ticker", href: "/token?t=0x1" }];

describe("onboarding steps", () => {
  it("always counts the account as done", () => {
    expect(by({}).account!.done).toBe(true);
  });

  it("ticks the launch step by itself once the wallet has a launch, and links to the token", () => {
    const s = by({ connected: true, launched: mine, traded: false });
    expect(s.launch).toMatchObject({ done: true, label: "Launched Ticker", href: "/token?t=0x1" });
  });

  it("counts several launches", () => {
    const s = by({ connected: true, launched: [...mine, { name: "Other", href: "/token?t=0x2" }] });
    expect(s.launch).toMatchObject({ done: true, label: "2 tokens launched" });
  });

  it("leaves the launch step open when the wallet has launched nothing", () => {
    expect(by({ connected: true, launched: [] }).launch).toMatchObject({ done: false, href: "/launch" });
  });

  it("does not claim a launch is missing while it is still checking", () => {
    const s = by({ connected: true, launched: null });
    expect(s.launch!.done).toBe(false);
    expect(s.launch!.hint).toContain("Checking");
  });

  it("cannot tell what was launched without a wallet, and says how to get it tracked", () => {
    const s = by({ connected: false, launched: mine });
    expect(s.launch!.done).toBe(false);
    expect(s.launch!.hint).toContain("Connect your wallet");
  });

  it("shows a remembered wallet as reconnecting, not as missing", () => {
    const s = by({ restoring: true });
    expect(s.wallet).toMatchObject({ done: false, label: "Reconnecting your wallet…" });
    expect(s.wallet!.connect).toBeUndefined();
  });

  it("offers to connect only when nothing is connected or being restored", () => {
    expect(by({}).wallet).toMatchObject({ done: false, connect: true });
    expect(by({ connected: true }).wallet).toMatchObject({ done: true });
  });

  it("sends someone with no test STRK to the official faucet, in a new tab", () => {
    const s = by({ connected: true, funded: false });
    expect(s.funds).toMatchObject({ done: false, href: "https://faucet.starknet.io", external: true, label: "Get free test STRK" });
  });

  it("ticks the test STRK step by itself once the wallet holds some", () => {
    expect(by({ connected: true, funded: true }).funds).toMatchObject({ done: true, label: "Test STRK in your wallet" });
  });

  it("does not claim the wallet is empty while the balance is still being read", () => {
    const s = by({ connected: true, funded: null });
    expect(s.funds!.done).toBe(false);
    expect(s.funds!.hint).toContain("Checking");
    expect(s.funds!.href).toBeUndefined();
  });

  it("asks for a wallet before pointing at the faucet, since the faucet needs an address", () => {
    const s = by({ connected: false });
    expect(s.funds).toMatchObject({ done: false });
    expect(s.funds!.href).toBeUndefined();
    expect(s.funds!.hint).toContain("Connect your wallet");
  });

  it("puts the steps in the order a newcomer does them", () => {
    expect(onboardingSteps(base).map((x) => x.key)).toEqual(["account", "wallet", "funds", "launch", "trade"]);
  });

  it("ticks the trade step once the wallet has traded", () => {
    expect(by({ connected: true, traded: true }).trade).toMatchObject({ done: true, href: "/portfolio" });
    expect(by({ connected: true, traded: false }).trade).toMatchObject({ done: false, href: "/explore" });
    expect(by({ connected: true, traded: null }).trade!.hint).toContain("Checking");
  });
});
