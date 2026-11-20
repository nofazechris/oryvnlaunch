import { describe, expect, it } from "vitest";
import { onboardingSteps, type StepInput } from "./onboarding";

const base: StepInput = { connected: false, restoring: false, launched: null, traded: null };
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

  it("ticks the trade step once the wallet has traded", () => {
    expect(by({ connected: true, traded: true }).trade).toMatchObject({ done: true, href: "/portfolio" });
    expect(by({ connected: true, traded: false }).trade).toMatchObject({ done: false, href: "/explore" });
    expect(by({ connected: true, traded: null }).trade!.hint).toContain("Checking");
  });
});
