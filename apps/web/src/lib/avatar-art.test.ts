import { describe, expect, it } from "vitest";
import { PALETTE_NAMES, STYLES, artFor, avatarSvg, cleanGlyph, cleanTicker, seedOf, validateArt, variantsFor } from "./avatar-art";

/** Every opening tag has its closing tag, in order: a cheap well-formedness check with no XML parser around. */
function balanced(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<\/?([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    const [whole, name, selfClose] = m;
    if (selfClose || whole!.startsWith("<?")) continue;
    if (whole!.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0;
}

describe("avatarSvg", () => {
  it("draws every style in every palette as a well-formed 512 by 512 picture", () => {
    for (const style of STYLES) {
      for (const palette of PALETTE_NAMES) {
        const svg = avatarSvg({ style, palette }, "TIK");
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain('viewBox="0 0 512 512"');
        expect(balanced(svg), `${style}/${palette}`).toBe(true);
      }
    }
  });

  it("is the same picture every time for the same inputs, and different across styles", () => {
    const a = avatarSvg({ style: "shapes", palette: "ocean" }, "TIK");
    expect(avatarSvg({ style: "shapes", palette: "ocean" }, "TIK")).toBe(a);
    expect(avatarSvg({ style: "orb", palette: "ocean" }, "TIK")).not.toBe(a);
    expect(avatarSvg({ style: "shapes", palette: "ocean" }, "OTHER")).not.toBe(a);
  });

  it("can carry no script, link or event handler, whatever it is given", () => {
    const evil = '<script>alert(1)</script>"onload="x';
    for (const style of STYLES) {
      const svg = avatarSvg({ style, palette: "mint", glyph: '<img src=x onerror=alert(1)>' }, evil);
      expect(svg.toLowerCase()).not.toMatch(/<script|onload=|onerror=|javascript:|<img|<a /);
    }
  });

  it("uses the ticker's letters on the badge and its first letter on the orb", () => {
    expect(avatarSvg({ style: "badge", palette: "sunset" }, "moon")).toContain(">MOON</text>");
    expect(avatarSvg({ style: "orb", palette: "sunset" }, "moon")).toContain(">M</text>");
  });

  it("draws the chosen emoji on the mascot, and a default when the glyph is not an emoji", () => {
    expect(avatarSvg({ style: "mascot", palette: "violet", glyph: "🐱" }, "CAT")).toContain(">🐱</text>");
    expect(avatarSvg({ style: "mascot", palette: "violet", glyph: "not an emoji" }, "CAT")).not.toContain("not an emoji");
  });

  it("copes with an empty ticker", () => {
    expect(avatarSvg({ style: "badge", palette: "mono" }, "")).toContain(">TKN</text>");
  });
});

describe("cleanTicker and seedOf", () => {
  it("keeps only up to six letters and digits, upper case", () => {
    expect(cleanTicker("moon-1!x?yz")).toBe("MOON1X");
  });
  it("gives the same number for the same text", () => {
    expect(seedOf("abc")).toBe(seedOf("abc"));
    expect(seedOf("abc")).not.toBe(seedOf("abd"));
  });
});

describe("cleanGlyph", () => {
  it("accepts emoji, including ones with a variation selector or joiners", () => {
    expect(cleanGlyph("🐱")).toBe("🐱");
    expect(cleanGlyph("🛰️")).toBe("🛰️");
    const technologist = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
    expect(cleanGlyph(technologist)).toBe(technologist);
  });
  it("refuses anything that is not an emoji", () => {
    for (const bad of ["", "abc", "1", "<b>", "🐱 hi", "x🐱", "🐱".repeat(10), null, 5, undefined]) expect(cleanGlyph(bad), String(bad)).toBe("");
  });
});

describe("artFor and validateArt", () => {
  it("suggests a cat mascot for a cat idea, and the same thing every time", () => {
    const a = artFor("A sleepy cat mascot for night-owl traders");
    expect(a).toMatchObject({ style: "mascot", glyph: "🐱" });
    expect(artFor("A sleepy cat mascot for night-owl traders")).toEqual(a);
  });

  it("keeps a valid suggestion and its reason", () => {
    expect(validateArt({ style: "RINGS", palette: "Ocean", glyph: "🌊", why: "Calm blue suits a water theme." }, "x")).toEqual({ style: "rings", palette: "ocean", glyph: "🌊", why: "Calm blue suits a water theme." });
  });

  it("replaces anything unknown with a safe choice instead of passing it on", () => {
    const v = validateArt({ style: "<script>", palette: "neon-rainbow", glyph: "evil", why: "ok" }, "plain idea");
    expect(STYLES).toContain(v.style);
    expect(PALETTE_NAMES).toContain(v.palette);
    expect(v.glyph).not.toBe("evil");
    expect(validateArt(null, "plain idea")).toMatchObject({ why: "" });
    expect(validateArt("nonsense", "plain idea").style).toBeTruthy();
  });

  it("cleans and shortens the reason", () => {
    const tab = String.fromCharCode(9);
    const why = validateArt({ why: `line${tab}one   ${"x".repeat(300)}` }, "i").why;
    expect(why.length).toBeLessThanOrEqual(90);
    expect(why.startsWith("line one")).toBe(true);
  });
});

describe("variantsFor", () => {
  it("offers six different pictures", () => {
    const v = variantsFor("TIK");
    expect(v).toHaveLength(6);
    expect(new Set(v.map((x) => x.key)).size).toBe(6);
    expect(v.some((x) => x.ai)).toBe(false);
  });

  it("puts the AI's pick first and marks only that one", () => {
    const pick = { style: "rings" as const, palette: "aurora" as const, glyph: "🚀", why: "Orbits suit it." };
    const v = variantsFor("TIK", pick);
    expect(v[0]).toMatchObject({ label: "AI pick", ai: true, spec: { style: "rings", palette: "aurora" } });
    expect(v.filter((x) => x.ai)).toHaveLength(1);
    expect(new Set(v.map((x) => x.key)).size).toBe(v.length);
    expect(v).toHaveLength(6);
  });

  it("gives the same set for the same ticker", () => {
    expect(variantsFor("MOON").map((x) => x.key)).toEqual(variantsFor("MOON").map((x) => x.key));
  });
});
