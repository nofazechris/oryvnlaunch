// The "Get set up" checklist on the Overview. Each step is worked out from what is really true (the wallet, the
// launches the API shows for it, the trades it has made), so it ticks itself and never needs to be told.

import { FAUCET_URL } from "./mobile";

export interface StepInput {
  /** A wallet is connected right now. */
  connected: boolean;
  /** A remembered wallet is being picked up again. */
  restoring: boolean;
  /** Tokens launched by the connected wallet. Null while that is still being fetched, or with no wallet. */
  launched: { name: string; href: string }[] | null;
  /** Whether the connected wallet holds some test STRK. Null while that is being read, or with no wallet. */
  funded: boolean | null;
  /** Whether the connected wallet has bought or sold. Null while unknown, or with no wallet. */
  traded: boolean | null;
}

export interface Step {
  key: "account" | "wallet" | "funds" | "launch" | "trade";
  label: string;
  hint: string;
  done: boolean;
  /** Where the step leads when clicked, if anywhere. */
  href?: string;
  /** The link leaves this site, so it opens in a new tab. */
  external?: boolean;
  /** Clicking should open the wallet connection instead of navigating. */
  connect?: boolean;
}

export function onboardingSteps(i: StepInput): Step[] {
  const wallet: Step = i.connected
    ? { key: "wallet", label: "Wallet connected", hint: "Ready to launch and trade", done: true }
    : i.restoring
      ? { key: "wallet", label: "Reconnecting your wallet…", hint: "Picking up where you left off", done: false }
      : { key: "wallet", label: "Connect your wallet", hint: "Needed to launch and trade", done: false, connect: true };

  let funds: Step;
  if (!i.connected) funds = { key: "funds", label: "Get free test STRK", hint: "Connect your wallet first. Test tokens are free and worth nothing", done: false };
  else if (i.funded) funds = { key: "funds", label: "Test STRK in your wallet", hint: "You have what you need to launch and trade", done: true };
  else if (i.funded === null) funds = { key: "funds", label: "Get free test STRK", hint: "Checking your balance…", done: false };
  else funds = { key: "funds", label: "Get free test STRK", hint: "Free, worth nothing, and needed to launch and trade", done: false, href: FAUCET_URL, external: true };

  let launch: Step;
  if (!i.connected) {
    launch = { key: "launch", label: "Launch your first token", hint: i.restoring ? "Checking your wallet…" : "Connect your wallet and your launches are tracked here", done: false, href: "/launch" };
  } else if (i.launched && i.launched.length > 0) {
    const n = i.launched.length;
    launch = { key: "launch", label: n === 1 ? `Launched ${i.launched[0]!.name}` : `${n} tokens launched`, hint: "Open it to see trades and claim your fees", done: true, href: i.launched[0]!.href };
  } else if (i.launched === null) {
    launch = { key: "launch", label: "Launch your first token", hint: "Checking your launches…", done: false, href: "/launch" };
  } else {
    launch = { key: "launch", label: "Launch your first token", hint: "Takes a few minutes with AI", done: false, href: "/launch" };
  }

  let trade: Step;
  if (!i.connected) trade = { key: "trade", label: "Make your first trade", hint: "Connect your wallet first", done: false, href: "/explore" };
  else if (i.traded) trade = { key: "trade", label: "Made a trade", hint: "Your positions are in Portfolio", done: true, href: "/portfolio" };
  else if (i.traded === null) trade = { key: "trade", label: "Make your first trade", hint: "Checking your activity…", done: false, href: "/explore" };
  else trade = { key: "trade", label: "Make your first trade", hint: "Buy a token on its curve", done: false, href: "/explore" };

  return [{ key: "account", label: "Account created", hint: "You're signed in", done: true }, wallet, funds, launch, trade];
}
