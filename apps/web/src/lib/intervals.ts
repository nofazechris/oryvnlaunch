import type { CandleInterval } from "./api";

/** Seconds in one candle of each time frame. */
export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** The widest time frame that still gives a token of this age at least ~20 candles to draw. */
export function autoInterval(ageMinutes: number): CandleInterval {
  const frames: [CandleInterval, number][] = [["1d", 1440], ["4h", 240], ["1h", 60], ["15m", 15], ["5m", 5]];
  for (const [name, minutes] of frames) if (ageMinutes / minutes >= 20) return name;
  return "1m";
}
