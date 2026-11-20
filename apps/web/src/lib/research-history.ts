// Research the person has done, kept in this browser so it is still there after a refresh, and so it can be
// deleted. Nothing here leaves the device. It holds only what the AI page already showed.

export interface SavedRun {
  id: string;
  q: string;
  addr: string;
  time: string;
  report: unknown | null;
  data: unknown | null;
  follow: { q: string; a: string }[];
}

const KEY = "oryvn.research.v1";
/** The most research kept. Older ones fall off the end. */
export const MAX_RUNS = 20;
/** A single run bigger than this is not kept, so storage can never fill up from one huge answer. */
const MAX_RUN_CHARS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStore = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const isRun = (v: unknown): v is SavedRun => {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.q === "string" && typeof r.addr === "string" && typeof r.time === "string" && Array.isArray(r.follow);
};

/** Saved research, oldest first. Anything damaged or unexpected is ignored rather than trusted. */
export function loadRuns(store: Store | null = browserStore()): SavedRun[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRun)
      .map((r) => ({ ...r, follow: r.follow.filter((f) => f && typeof f.q === "string" && typeof f.a === "string" && f.a.trim() !== "" && f.a !== "Thinking…") }))
      .slice(-MAX_RUNS);
  } catch {
    return [];
  }
}

/** Keep these runs (most recent MAX_RUNS), dropping any single one that is unreasonably large. */
export function saveRuns(runs: SavedRun[], store: Store | null = browserStore()): void {
  if (!store) return;
  const keep = runs
    .filter((r) => {
      try {
        return JSON.stringify(r).length <= MAX_RUN_CHARS;
      } catch {
        return false;
      }
    })
    .slice(-MAX_RUNS);
  try {
    if (keep.length === 0) store.removeItem(KEY);
    else store.setItem(KEY, JSON.stringify(keep));
  } catch {
    /* storage full or blocked: the research still works for this visit */
  }
}

export const withoutRun = <T extends { id: string }>(runs: T[], id: string): T[] => runs.filter((r) => r.id !== id);

export const newRunId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
