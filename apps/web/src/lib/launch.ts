// Launch Studio constants and validation.

export interface LaunchTemplate {
  key: string;
  label: string;
  blurb: string;
  g: [string, string];
  ink: string;
}

/** The kinds of token a creator can start from. A kind is a starting point for the AI helper, not a contract setting. */
export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  { key: "meme", label: "Meme coin", blurb: "A community meme with a mascot and a bonding-curve launch.", g: ["#FF9865", "#FFD2A8"], ink: "#3A1404" },
  { key: "community", label: "Community token", blurb: "A shared token for a group, project or crew.", g: ["#73D9E8", "#B7F0F5"], ink: "#062A30" },
  { key: "art", label: "Art / collectible", blurb: "A token around an artist, a drop or a collectible.", g: ["#F38FC4", "#FFD9EC"], ink: "#3A0A24" },
  { key: "utility", label: "Utility token", blurb: "A token that powers access, rewards or a product.", g: ["#B69AFF", "#E6DCFF"], ink: "#1E1240" },
];

export interface CurvePreset {
  id: 0 | 1 | 2;
  name: string;
  desc: string;
  /** Roughly how many times the price multiplies between the first buy and graduation. */
  multiple: number;
}

/** The three curves the factory offers. The number is the on-chain preset id. */
export const PRESETS: CurvePreset[] = [
  { id: 1, name: "Standard", desc: "A balanced curve. The price rises steadily as the supply is bought.", multiple: 9 },
  { id: 0, name: "Gentle", desc: "A flatter curve with less price swing and more room for early buyers.", multiple: 4 },
  { id: 2, name: "Steep", desc: "A faster climb. The price moves more on every trade.", multiple: 25 },
];

/** Total supply of every token. Fixed in the factory. */
export const TOTAL_SUPPLY = 1_000_000_000;
/** Share of the supply sold on the curve, in percent. The rest is reserved or goes to the creator. */
export const CURVE_PERCENT = 80;
export const MAX_CREATOR_PERCENT = 5;
export const TRADE_FEE_NOTE = "1% per trade, split between the platform and the creator";

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

export function urlOk(v: string, re: RegExp): boolean {
  return !v || re.test(v.trim());
}
