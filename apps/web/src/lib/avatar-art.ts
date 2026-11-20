// Token pictures drawn on the spot, so a creator rarely needs to make or find an image at all.
//
// Everything here is plain SVG built from a ticker, a style and a palette: no image model, no key, no network.
// The AI's part is only to suggest which style and palette suit the idea. A picture is optional anyway: with none,
// the app already draws a unique avatar from the token's address.

export const STYLES = ["orb", "badge", "rings", "shapes", "mascot"] as const;
export type AvatarStyle = (typeof STYLES)[number];

export const PALETTES = {
  sunset: ["#FF9865", "#F38FC4", "#FFE3CF"],
  ocean: ["#568BFF", "#73D9E8", "#D6F6FF"],
  aurora: ["#55D69A", "#73D9E8", "#B69AFF"],
  ember: ["#FF5E3A", "#FF9865", "#FFD9A8"],
  mint: ["#C7EA83", "#55D69A", "#EFFFD6"],
  violet: ["#B69AFF", "#6C5CE7", "#E8DEFF"],
  candy: ["#F38FC4", "#B69AFF", "#FFE0F1"],
  mono: ["#2A2A2E", "#6B6B75", "#F2F2F2"],
} as const;
export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

export interface ArtSpec {
  style: AvatarStyle;
  palette: PaletteName;
  /** One emoji, used by the mascot style. */
  glyph?: string;
}

export interface ArtSuggestion extends ArtSpec {
  glyph: string;
  /** Why the AI chose it, a few words. Empty when it is not from the AI. */
  why: string;
}

const GLYPHS = ["🐱", "🚀", "🦊", "🐸", "🌙", "⚡", "🔥", "🌊", "🧠", "🛰️", "🍀", "👾"];
const KEYWORD_GLYPHS: [RegExp, string][] = [
  [/\b(cat|kitten|kitty|meow)\b/i, "🐱"],
  [/\b(fox)\b/i, "🦊"],
  [/\b(frog|toad)\b/i, "🐸"],
  [/\b(moon|night|owl|sleep)/i, "🌙"],
  [/\b(rocket|launch|space|star)/i, "🚀"],
  [/\b(fire|flame|burn|hot)\b/i, "🔥"],
  [/\b(ocean|sea|wave|water)/i, "🌊"],
  [/\b(brain|smart|mind|ai)\b/i, "🧠"],
  [/\b(lightning|fast|speed|bolt)/i, "⚡"],
  [/\b(clover|luck|lucky)/i, "🍀"],
];

/** A small stable number from text, so the same idea always gets the same picture ideas. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An emoji, optionally followed by more emoji, skin-tone modifiers, joiners and variation selectors.
// The joiner and selector are added by code (0x200D, 0xFE0F) so no invisible character sits in this file.
const GLYPH_RE = new RegExp(
  "^\\p{Extended_Pictographic}(?:[\\p{Extended_Pictographic}" + String.fromCharCode(0x200d, 0xfe0f) + "]|\\p{Emoji_Modifier})*$",
  "u",
);

/** Only a real emoji (or a short run of them) is accepted as a glyph. Anything else is dropped. */
export function cleanGlyph(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const g = raw.trim();
  if (!g || g.length > 12) return "";
  return GLYPH_RE.test(g) ? g : "";
}

/** A sensible picture to suggest for an idea when the AI has no opinion (or is offline). */
export function artFor(idea: string): ArtSuggestion {
  const seed = seedOf(idea.toLowerCase().trim() || "token");
  const glyph = KEYWORD_GLYPHS.find(([re]) => re.test(idea))?.[1] ?? GLYPHS[seed % GLYPHS.length]!;
  const mascotish = KEYWORD_GLYPHS.some(([re]) => re.test(idea));
  return { style: mascotish ? "mascot" : STYLES[seed % 4]!, palette: PALETTE_NAMES[(seed >>> 3) % PALETTE_NAMES.length]!, glyph, why: "" };
}

/** Trust nothing a model returns: keep only a known style and palette, a real emoji and a short reason. */
export function validateArt(raw: unknown, idea: string): ArtSuggestion {
  const base = artFor(idea);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const style = STYLES.find((s) => s === String(o.style ?? "").toLowerCase()) ?? base.style;
  const palette = PALETTE_NAMES.find((p) => p === String(o.palette ?? "").toLowerCase()) ?? base.palette;
  const why = Array.from(String(o.why ?? "")).map((c) => (c.codePointAt(0)! < 32 || c.codePointAt(0) === 127 ? " " : c)).join("").replace(/\s+/g, " ").trim().slice(0, 90);
  return { style, palette, glyph: cleanGlyph(o.glyph) || base.glyph, why };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The letters and digits of a ticker, at most six, upper case. */
export const cleanTicker = (ticker: string) => ticker.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** A 512 by 512 SVG picture. Built only from fixed shapes and escaped text, so it can carry no script. */
export function avatarSvg(spec: ArtSpec, tickerRaw: string): string {
  const [c1, c2, accent] = PALETTES[spec.palette];
  const ticker = cleanTicker(tickerRaw) || "TKN";
  const initial = ticker[0] ?? "T";
  const rand = rng(seedOf(`${ticker}:${spec.style}:${spec.palette}`));
  const defs =
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>` +
    `<radialGradient id="h" cx=".32" cy=".28" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  const text = (content: string, size: number, opacity = 0.95, weight = 700) =>
    `<text x="256" y="262" font-family='${FONT}' font-size="${size}" font-weight="${weight}" fill="#fff" fill-opacity="${opacity}" text-anchor="middle" dominant-baseline="central">${esc(content)}</text>`;
  let body = "";
  switch (spec.style) {
    case "orb":
      body = `<rect width="512" height="512" fill="#0b0b0b"/><circle cx="256" cy="256" r="196" fill="url(#g)"/><circle cx="256" cy="256" r="196" fill="url(#h)"/>${text(initial, 200)}`;
      break;
    case "badge": {
      const size = ticker.length <= 2 ? 240 : ticker.length === 3 ? 170 : ticker.length === 4 ? 132 : 104;
      body = `<rect width="512" height="512" fill="url(#g)"/><circle cx="430" cy="82" r="120" fill="${accent}" fill-opacity=".2"/><circle cx="70" cy="470" r="150" fill="#000" fill-opacity=".12"/>${text(ticker, size, 0.96, 800)}`;
      break;
    }
    case "rings":
      body =
        `<rect width="512" height="512" fill="#0b0b0b"/>` +
        [214, 164, 114].map((r, i) => `<circle cx="256" cy="256" r="${r}" fill="none" stroke="url(#g)" stroke-width="24" stroke-opacity="${(1 - i * 0.22).toFixed(2)}"/>`).join("") +
        `<circle cx="256" cy="256" r="46" fill="${accent}"/>`;
      break;
    case "shapes": {
      const shapes = Array.from({ length: 5 }, (_, i) => {
        const x = 60 + rand() * 392;
        const y = 60 + rand() * 392;
        const s = 90 + rand() * 120;
        const fill = i % 2 ? accent : "#fff";
        const op = (0.22 + rand() * 0.3).toFixed(2);
        return i % 3 === 0
          ? `<rect x="${(x - s / 2).toFixed(0)}" y="${(y - s / 2).toFixed(0)}" width="${s.toFixed(0)}" height="${s.toFixed(0)}" rx="${(s * 0.22).toFixed(0)}" fill="${fill}" fill-opacity="${op}" transform="rotate(${(rand() * 60 - 30).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`
          : `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(s / 2).toFixed(0)}" fill="${fill}" fill-opacity="${op}"/>`;
      }).join("");
      body = `<rect width="512" height="512" fill="url(#g)"/>${shapes}${text(initial, 190, 0.9)}`;
      break;
    }
    case "mascot": {
      const glyph = cleanGlyph(spec.glyph) || GLYPHS[seedOf(ticker) % GLYPHS.length]!;
      body = `<rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="256" r="176" fill="#fff" fill-opacity=".2"/><circle cx="256" cy="256" r="176" fill="url(#h)"/>${text(glyph, 230, 1, 400)}`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${defs}</defs>${body}</svg>`;
}

export interface Variant {
  key: string;
  spec: ArtSpec;
  label: string;
  /** This is the one the AI suggested. */
  ai?: boolean;
}

const LABELS: Record<AvatarStyle, string> = { orb: "Orb", badge: "Badge", rings: "Rings", shapes: "Shapes", mascot: "Mascot" };

/** Six picture ideas for a ticker: the AI's pick first (when there is one), then different styles and palettes. */
export function variantsFor(tickerRaw: string, ai?: ArtSuggestion | null, count = 6): Variant[] {
  const ticker = cleanTicker(tickerRaw) || "TKN";
  const seed = seedOf(ticker);
  const out: Variant[] = [];
  const seen = new Set<string>();
  const add = (spec: ArtSpec, isAi = false) => {
    const key = `${spec.style}:${spec.palette}:${spec.style === "mascot" ? spec.glyph ?? "" : ""}`;
    if (seen.has(key) || out.length >= count) return;
    seen.add(key);
    out.push({ key, spec, label: isAi ? "AI pick" : LABELS[spec.style], ai: isAi || undefined });
  };
  if (ai) add({ style: ai.style, palette: ai.palette, glyph: ai.glyph }, true);
  for (let i = 0; out.length < count && i < 60; i++) {
    add({ style: STYLES[(seed + i) % STYLES.length]!, palette: PALETTE_NAMES[(seed + i * 3 + (i >> 1)) % PALETTE_NAMES.length]!, glyph: ai?.glyph ?? GLYPHS[(seed + i) % GLYPHS.length]! });
  }
  return out;
}

/** Turn an SVG into a PNG in the browser, ready to upload like any picture the person chose. */
export async function svgToPng(svg: string, size = 512): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The picture could not be drawn."));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw pictures.");
  ctx.drawImage(img, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be saved."))), "image/png"));
}

/** Fit any picture (a data URL or object URL) into a square JPEG, cropping the edges, so it is small enough to upload. */
export async function imageToSquare(source: string, size = 512, quality = 0.88): Promise<Blob> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The picture could not be read."));
    img.src = source;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error("The picture is empty.");
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw pictures.");
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be saved."))), "image/jpeg", quality));
}
