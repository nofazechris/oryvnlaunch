import { describe, expect, it } from "vitest";
import { FAUCET_URL, looksLikePhone, siteAddress, walletAppLinks, walletPath } from "./mobile";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("looksLikePhone", () => {
  it("recognises phones", () => {
    expect(looksLikePhone(IPHONE, 5)).toBe(true);
    expect(looksLikePhone(ANDROID, 5)).toBe(true);
  });
  it("recognises an iPad that asks for the desktop site (a Mac that has a touch screen)", () => {
    expect(looksLikePhone(MAC, 5)).toBe(true);
  });
  it("leaves computers alone, including a Mac with no touch screen", () => {
    expect(looksLikePhone(DESKTOP, 0)).toBe(false);
    expect(looksLikePhone(MAC, 0)).toBe(false);
    expect(looksLikePhone(DESKTOP, 10)).toBe(false); // a touch-screen laptop is still a laptop with extensions
  });
});

describe("walletPath", () => {
  it("offers the list whenever a wallet is on the page, even on a phone (a wallet app's own browser)", () => {
    expect(walletPath({ phone: true, installed: ["Braavos"] })).toBe("choose");
    expect(walletPath({ phone: false, installed: ["Argent X", "Braavos"] })).toBe("choose");
  });
  it("tells a phone with no wallet to open the site inside a wallet app", () => {
    expect(walletPath({ phone: true, installed: [] })).toBe("open-in-wallet-app");
  });
  it("tells a computer with no wallet to install the extension", () => {
    expect(walletPath({ phone: false, installed: [] })).toBe("install-extension");
  });
});

describe("walletAppLinks", () => {
  it("links the App Store pages on an iPhone", () => {
    const links = walletAppLinks(IPHONE);
    expect(links.map((l) => l.name)).toEqual(["Ready X", "Braavos"]);
    expect(links.every((l) => l.href.startsWith("https://apps.apple.com/"))).toBe(true);
  });
  it("links the Play Store pages on Android", () => {
    const links = walletAppLinks(ANDROID);
    expect(links[0]!.href).toBe("https://play.google.com/store/apps/details?id=com.ready.wallet");
    expect(links[1]!.href).toBe("https://play.google.com/store/apps/details?id=app.braavos.wallet");
  });
  it("never points at Ready: Community Finance, a different app from the same company", () => {
    for (const ua of [IPHONE, ANDROID]) {
      const all = walletAppLinks(ua).map((l) => l.href).join(" ");
      expect(all).not.toContain("id1358741926");
      expect(all).not.toContain("im.argent.contractwalletclient");
    }
  });
});

describe("siteAddress and the faucet", () => {
  it("gives the site's own address with nothing after the host", () => {
    expect(siteAddress("https://oryvnlaunchpad.site")).toBe("https://oryvnlaunchpad.site");
    expect(siteAddress("https://oryvnlaunchpad.site/")).toBe("https://oryvnlaunchpad.site");
  });
  it("points at the official Starknet faucet over https", () => {
    expect(FAUCET_URL).toBe("https://faucet.starknet.io");
  });
});
