// What a wallet is called on screen. The code still identifies the Argent wallet as "Argent X" (that is the key its
// extension injects under, and what is remembered between visits), but Argent has been renamed Ready, so people
// should read "Ready Wallet".

const LABELS: Record<string, string> = { "Argent X": "Ready Wallet" };

export function walletLabel(name: string): string {
  return LABELS[name] ?? name;
}

/** The small line under a wallet's name in the connect list. */
export function walletNote(name: string, phone: boolean): string {
  const kind = phone ? "Wallet app" : "Browser extension";
  return name === "Argent X" ? `${kind} · formerly Argent X` : kind;
}
