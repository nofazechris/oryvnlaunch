// Launch Studio constants, validation and curve helpers (ported from Launch.dc.html).
import { TOKENS } from "./oryvn-data";

/** Card palettes: [primary, light, ink]. */
export const PAL: [string, string, string][] = [
  ["#73D9E8", "#B7F0F5", "#062A30"],
  ["#FF9865", "#FFD2A8", "#3A1404"],
  ["#568BFF", "#F38FC4", "#140A2E"],
  ["#C7EA83", "#EAF7C9", "#1C2A06"],
  ["#B69AFF", "#E6DCFF", "#1E1240"],
  ["#F38FC4", "#FFD9EC", "#3A0A24"],
  ["#FF7777", "#FFC2B0", "#3A0A0A"],
];

export interface CurveTemplate {
  name: string;
  desc: string;
  k: number;
  start: number;
}

export const TEMPLATES: CurveTemplate[] = [
  { name: "Standard", desc: "Quadratic. Price rises steadily as supply is bought.", k: 2, start: 0.000028 },
  { name: "Gentle", desc: "Flatter early curve. More room for early buyers.", k: 1.5, start: 0.000035 },
  { name: "Steep", desc: "Faster price rise. Graduates on fewer trades.", k: 3, start: 0.000019 },
];

export const SUPPLIES = [1e8, 1e9, 1e10];

export const GRAD_LABEL = "69,000 STRK";
export const DEPLOY_FEE = 10;

export interface SocialDef {
  key: "web" | "x" | "tg" | "dc";
  label: string;
  ph: string;
  re: RegExp;
  msg: string;
}

export const SOCIALS: SocialDef[] = [
  { key: "web", label: "Website", ph: "https://", re: /^https?:\/\/[^\s.]+\.[^\s]+$/, msg: "Use a full URL starting with https://" },
  { key: "x", label: "X", ph: "@handle", re: /^@?[A-Za-z0-9_]{1,15}$/, msg: "1–15 letters, numbers or _" },
  { key: "tg", label: "Telegram", ph: "t.me/…", re: /^(https?:\/\/)?t\.me\/[A-Za-z0-9_]{4,}$/, msg: "Use a t.me/ link" },
  { key: "dc", label: "Discord", ph: "discord.gg/…", re: /^(https?:\/\/)?discord\.(gg|com\/invite)\/[A-Za-z0-9-]+$/, msg: "Use a discord.gg/ invite" },
];

export function fmtS(n: number): string {
  return n >= 1e9 ? n / 1e9 + "B" : n / 1e6 + "M";
}

export function urlOk(v: string, re: RegExp): boolean {
  return !v || re.test(v.trim());
}

export function tickerExists(tick: string): boolean {
  return TOKENS.some((t) => t.sym === tick);
}

/** Quadratic-family curve path for the template thumbnails. viewBox 0 0 160 56. */
export function curvePath(k: number): string {
  let d = "";
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    d += (i ? " L" : "M") + (u * 160).toFixed(1) + "," + (54 - Math.pow(u, k) * 50).toFixed(1);
  }
  return d;
}
