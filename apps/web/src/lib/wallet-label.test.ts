import { describe, expect, it } from "vitest";
import { walletLabel, walletNote } from "./wallet-label";

describe("wallet names on screen", () => {
  it("shows Argent's wallet under its new name, Ready", () => {
    expect(walletLabel("Argent X")).toBe("Ready Wallet");
  });
  it("leaves other wallets, and unknown names, as they are", () => {
    expect(walletLabel("Braavos")).toBe("Braavos");
    expect(walletLabel("Something")).toBe("Something");
  });
  it("says what kind of wallet it is, and mentions the old name once", () => {
    expect(walletNote("Argent X", false)).toBe("Browser extension · formerly Argent X");
    expect(walletNote("Argent X", true)).toBe("Wallet app · formerly Argent X");
    expect(walletNote("Braavos", true)).toBe("Wallet app");
  });
});
