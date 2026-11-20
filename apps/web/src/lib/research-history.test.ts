import { describe, expect, it } from "vitest";
import { MAX_RUNS, loadRuns, newRunId, saveRuns, withoutRun, type SavedRun } from "./research-history";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};
const run = (id: string, extra: Partial<SavedRun> = {}): SavedRun => ({ id, q: `question ${id}`, addr: "0x1", time: "12:00", report: null, data: null, follow: [], ...extra });

describe("research history", () => {
  it("saves and loads runs in order", () => {
    const s = memory();
    saveRuns([run("a"), run("b")], s);
    expect(loadRuns(s).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("starts empty when nothing is saved, or when storage is unavailable", () => {
    expect(loadRuns(memory())).toEqual([]);
    expect(loadRuns(null)).toEqual([]);
    expect(() => saveRuns([run("a")], null)).not.toThrow();
  });

  it("deletes one run and leaves the others", () => {
    expect(withoutRun([run("a"), run("b"), run("c")], "b").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("removes the entry entirely when the last run is deleted", () => {
    const s = memory();
    saveRuns([run("a")], s);
    saveRuns([], s);
    expect(s.raw.size).toBe(0);
    expect(loadRuns(s)).toEqual([]);
  });

  it("keeps only the most recent runs", () => {
    const s = memory();
    saveRuns(Array.from({ length: MAX_RUNS + 5 }, (_, i) => run(String(i))), s);
    const ids = loadRuns(s).map((r) => r.id);
    expect(ids).toHaveLength(MAX_RUNS);
    expect(ids[ids.length - 1]).toBe(String(MAX_RUNS + 4));
  });

  it("does not keep one enormous run", () => {
    const s = memory();
    saveRuns([run("small"), run("huge", { data: "x".repeat(100_000) })], s);
    expect(loadRuns(s).map((r) => r.id)).toEqual(["small"]);
  });

  it("ignores damaged storage and entries that are not runs", () => {
    const bad = memory();
    bad.setItem("oryvn.research.v1", "{not json");
    expect(loadRuns(bad)).toEqual([]);
    const mixed = memory();
    mixed.setItem("oryvn.research.v1", JSON.stringify([run("ok"), { id: 5 }, null, "text"]));
    expect(loadRuns(mixed).map((r) => r.id)).toEqual(["ok"]);
  });

  it("drops a reply that was still 'Thinking' when the page closed", () => {
    const s = memory();
    saveRuns([run("a", { follow: [{ q: "one", a: "An answer." }, { q: "two", a: "Thinking…" }, { q: "three", a: "" }] })], s);
    expect(loadRuns(s)[0]!.follow).toEqual([{ q: "one", a: "An answer." }]);
  });

  it("makes ids that differ", () => {
    expect(new Set(Array.from({ length: 50 }, newRunId)).size).toBe(50);
  });
});
