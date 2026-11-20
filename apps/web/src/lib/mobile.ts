// Helping people on phones, who cannot install a wallet extension and usually arrive with no test tokens.
//
// A normal phone browser has no wallet. What works is to open this site INSIDE a wallet app's own built-in browser,
// which does give the page a wallet. So when there is no wallet and this is a phone, say that, instead of telling
// someone to "install the extension".

/** The official Starknet faucet. It sends free test STRK to an address on Starknet Sepolia. */
export const FAUCET_URL = "https://faucet.starknet.io";

/** True for phones and tablets. iPads ask for the desktop site, so touch plus a Mac user agent counts too. */
export function looksLikePhone(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export type WalletPath =
  /** At least one wallet is on the page (an extension, or a wallet app's own browser): offer the list. */
  | "choose"
  /** A phone with no wallet on the page: tell them to open this site inside their wallet app. */
  | "open-in-wallet-app"
  /** A computer with no wallet: install the extension. */
  | "install-extension";

export function walletPath(input: { phone: boolean; installed: string[] }): WalletPath {
  if (input.installed.length > 0) return "choose";
  return input.phone ? "open-in-wallet-app" : "install-extension";
}

/** The address to paste into a wallet app's browser: this site's own address, without a trailing slash or path. */
export function siteAddress(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/** How much test STRK counts as "enough to get started": 1 STRK, in its smallest unit. */
export const STARTER_STRK = 10n ** 18n;
