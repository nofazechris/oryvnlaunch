import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAbandonDetector, type FocusTarget } from "./abandon";
import { autoInterval, INTERVAL_SECONDS } from "./intervals";

/** A tiny stand-in for `window` that lets a test fire focus and blur. */
function fakeWindow() {
  const listeners: Record<string, Set<() => void>> = { blur: new Set(), focus: new Set() };
  const win: FocusTarget = {
    addEventListener: (t, l) => void listeners[t]!.add(l),
    removeEventListener: (t, l) => void listeners[t]!.delete(l),
  };
  return { win, fire: (t: "blur" | "focus") => listeners[t]!.forEach((l) => l()), count: () => listeners.blur!.size + listeners.focus!.size };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAbandonDetector", () => {
  it("suggests the wallet was closed when focus comes back and the request is still waiting", () => {
    const { win, fire } = fakeWindow();
    const onAbandon = vi.fn();
    createAbandonDetector(win, onAbandon, 2_500).start();
    fire("blur"); // the wallet window opened
    fire("focus"); // and was closed
    vi.advanceTimersByTime(2_499);
    expect(onAbandon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the wallet answers during the grace period (it was approved)", () => {
    const { win, fire } = fakeWindow();
    const onAbandon = vi.fn();
    const d = createAbandonDetector(win, onAbandon);
    d.start();
    fire("blur");
    fire("focus");
    vi.advanceTimersByTime(1_000);
    d.stop(); // the request resolved
    vi.advanceTimersByTime(10_000);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("does nothing if our window never lost focus (no wallet window came and went)", () => {
    const { win, fire } = fakeWindow();
    const onAbandon = vi.fn();
    createAbandonDetector(win, onAbandon).start();
    fire("focus");
    vi.advanceTimersByTime(10_000);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("does not fire if focus is lost again before the grace period ends (the wallet window is still open)", () => {
    const { win, fire } = fakeWindow();
    const onAbandon = vi.fn();
    createAbandonDetector(win, onAbandon, 2_500).start();
    fire("blur");
    fire("focus");
    vi.advanceTimersByTime(1_000);
    fire("blur"); // back to the wallet
    vi.advanceTimersByTime(10_000);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("fires only once, and cleans up its listeners", () => {
    const { win, fire, count } = fakeWindow();
    const onAbandon = vi.fn();
    createAbandonDetector(win, onAbandon).start();
    expect(count()).toBe(2);
    fire("blur");
    fire("focus");
    vi.advanceTimersByTime(3_000);
    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(count()).toBe(0);
  });

  it("stop() removes the listeners and silences it", () => {
    const { win, fire, count } = fakeWindow();
    const onAbandon = vi.fn();
    const d = createAbandonDetector(win, onAbandon);
    d.start();
    d.stop();
    expect(count()).toBe(0);
    fire("blur");
    fire("focus");
    vi.advanceTimersByTime(10_000);
    expect(onAbandon).not.toHaveBeenCalled();
  });
});

describe("autoInterval", () => {
  it("gives a young token fine candles and an old one coarse ones", () => {
    expect(autoInterval(3)).toBe("1m");
    expect(autoInterval(60)).toBe("1m"); // an hour old is under 20 five-minute candles
    expect(autoInterval(100)).toBe("5m");
    expect(autoInterval(400)).toBe("15m");
    expect(autoInterval(60 * 24)).toBe("1h");
    expect(autoInterval(60 * 24 * 4)).toBe("4h");
    expect(autoInterval(60 * 24 * 30)).toBe("1d");
  });

  it("always leaves at least ~20 candles to draw, except for tokens only minutes old", () => {
    for (const minutes of [100, 400, 1440, 5760, 43200]) {
      const frame = autoInterval(minutes);
      expect(minutes / (INTERVAL_SECONDS[frame] / 60)).toBeGreaterThanOrEqual(20);
    }
  });
});
