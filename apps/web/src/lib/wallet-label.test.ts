import { describe, expect, it } from "vitest";
import { walletLabel, walletNote } from "./wallet-label";

describe("wallet names on screen", () => {
  it("calls Argent's wallet Ready X on a phone, where its app has that name", () => {
    expect(walletLabel("Argent X", true)).toBe("Ready X");
  });
  it("keeps the extension's own name on a computer", () => {
    expect(walletLabel("Argent X", false)).toBe("Argent X");
  });
  it("leaves other wallets, and unknown names, as they are", () => {
    expect(walletLabel("Braavos", true)).toBe("Braavos");
    expect(walletLabel("Something", false)).toBe("Something");
  });
  it("says what kind of wallet it is", () => {
    expect(walletNote("Argent X", false)).toBe("Browser extension");
    expect(walletNote("Argent X", true)).toBe("Wallet app");
  });
});
