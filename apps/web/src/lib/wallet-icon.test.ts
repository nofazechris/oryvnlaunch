import { afterEach, describe, expect, it, vi } from "vitest";
import { walletIcon } from "./wallet-store";

const install = (key: string, wallet: unknown) => vi.stubGlobal("window", { [key]: wallet });
const request = async () => undefined;
afterEach(() => vi.unstubAllGlobals());

describe("walletIcon", () => {
  it("uses the logo the extension supplies for itself", () => {
    install("starknet_argentX", { request, icon: "data:image/svg+xml;base64,PHN2Zy8+" });
    expect(walletIcon("Argent X")).toBe("data:image/svg+xml;base64,PHN2Zy8+");
  });

  it("takes the dark version when an extension offers light and dark", () => {
    install("starknet_braavos", { request, icon: { light: "data:image/png;base64,AAA", dark: "data:image/png;base64,BBB" } });
    expect(walletIcon("Braavos")).toBe("data:image/png;base64,BBB");
  });

  it("allows an https image and nothing else", () => {
    install("starknet_argentX", { request, icon: "https://cdn.example/logo.png" });
    expect(walletIcon("Argent X")).toBe("https://cdn.example/logo.png");
    for (const bad of ["javascript:alert(1)", "http://cdn.example/logo.png", "data:text/html;base64,PHNjcmlwdD4=", "//cdn.example/x.png", 42, null]) {
      install("starknet_argentX", { request, icon: bad });
      expect(walletIcon("Argent X"), String(bad)).toBeNull();
    }
  });

  it("is null when the extension is not installed, or is the other wallet", () => {
    vi.stubGlobal("window", {});
    expect(walletIcon("Argent X")).toBeNull();
    install("starknet_braavos", { request, icon: "data:image/png;base64,AAA" });
    expect(walletIcon("Argent X")).toBeNull();
  });
});
