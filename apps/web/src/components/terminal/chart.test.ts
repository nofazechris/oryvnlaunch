import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TerminalChart, type Candle } from "./TerminalChart";

const candle = (o: number, c: number, t = 0): Candle => ({ o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1, t });
const draw = (candles: Candle[], type: "candle" | "line" = "line", height = 340) =>
  renderToStaticMarkup(createElement(TerminalChart, { candles, type, hover: null, setHover: () => undefined, height, intervalSeconds: 60 }));

describe("TerminalChart", () => {
  it("says so when there are no trades, instead of drawing nothing", () => {
    expect(draw([])).toContain("No trades yet");
  });

  it("draws a price that has not moved in the middle of the chart, not stuck against the top", () => {
    const html = draw([candle(1, 1, 60), candle(1, 1, 120), candle(1, 1, 180)]);
    // height 340: the plot runs from y=10 for 248px, so the middle is 134 and the price tag (20px tall) starts at 124
    expect(html).toContain('y="124"');
    // and the price path itself runs along that middle line
    expect(html).toContain('points="6.5,134.0 19.4,134.0 32.4,134.0"');
  });

  it("gives a young token a few candles at the left with room to grow, not stretched across the width", () => {
    const html = draw([candle(1, 1.1, 60), candle(1.1, 1.2, 120)], "candle");
    const xs = [...html.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="[\d.]+" height="[\d.]+"[^>]*rx="1.5"/g)].map((m) => Number(m[1]));
    // plot width is at least 100 and the chart reserves 48 slots, so two candles sit in the leftmost part
    expect(Math.max(...xs)).toBeLessThan(160);
  });

  it("draws a rising price path as a line with a marker at the latest price", () => {
    const html = draw([candle(1, 1.1, 60), candle(1.1, 1.3, 120), candle(1.3, 1.6, 180)]);
    expect(html).toContain("<polyline");
    expect(html).toContain("<circle");
    expect(html).toContain("#55D69A"); // rising is green
  });

  it("draws a falling price path in red", () => {
    expect(draw([candle(2, 1.8, 60), candle(1.8, 1.2, 120)])).toContain("#FF6868");
  });

  it("does not draw two time labels on top of each other when the candles are close together", () => {
    const html = draw([candle(1, 1.1, 60), candle(1.1, 1.2, 120), candle(1.2, 1.3, 180)]);
    const labels = [...html.matchAll(/<text x="([\d.]+)" y="336"/g)].map((m) => Number(m[1]));
    expect(labels.length).toBe(1);
  });

  it("labels the start, middle and end when there is room", () => {
    const many = Array.from({ length: 40 }, (_, i) => candle(1 + i / 100, 1 + (i + 1) / 100, 60 * (i + 1)));
    const labels = [...draw(many).matchAll(/<text x="([\d.]+)" y="336"/g)];
    expect(labels.length).toBe(3);
  });

  it("does not choke on a single candle", () => {
    expect(draw([candle(1, 1.2, 60)], "candle")).toContain("<svg");
  });
});
