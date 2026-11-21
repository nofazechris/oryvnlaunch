// What a wallet is called on screen. Internally the Argent wallet is "Argent X" (the key its extension injects
// under, and what is remembered between visits). On a phone, its app is called "Ready X", so that is what a phone
// user reads. On a computer it keeps the name of the extension people have installed.

import { looksLikePhone } from "./mobile";

function onPhone(): boolean {
  return typeof navigator !== "undefined" && looksLikePhone(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function walletLabel(name: string, phone: boolean = onPhone()): string {
  return phone && name === "Argent X" ? "Ready X" : name;
}

/** The small line under a wallet's name in the connect list. */
export function walletNote(name: string, phone: boolean): string {
  return phone ? "Wallet app" : "Browser extension";
}
