// Noticing that someone closed the wallet without approving.
//
// A wallet opens its own window to ask for a signature. If the person closes it, many wallets never tell us:
// the request just hangs, and the page spins forever. What we can see is the browser window: our page loses
// focus when the wallet's window opens, and gets it back when that window closes. If focus comes back and the
// request is still unanswered a moment later, the window was almost certainly closed without approving.
//
// This only ever suggests. The request is still alive, so the caller shows a "did you close it?" prompt with a
// way out; it never treats the request as failed on its own.

export interface FocusTarget {
  addEventListener(type: "blur" | "focus", listener: () => void): void;
  removeEventListener(type: "blur" | "focus", listener: () => void): void;
}

export interface AbandonDetector {
  /** Start watching for one request. */
  start(): void;
  /** Stop watching (the request finished, or the person gave up). */
  stop(): void;
}

/**
 * @param onAbandon called once, when focus came back to the page and the request is still waiting after `graceMs`
 * @param graceMs   how long to wait after focus returns: an approved request answers within this time
 */
export function createAbandonDetector(win: FocusTarget, onAbandon: () => void, graceMs = 2_500): AbandonDetector {
  let watching = false;
  let blurred = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onBlur = () => {
    blurred = true;
    clearTimeout(timer);
  };
  const onFocus = () => {
    if (!blurred) return; // we never lost focus, so no wallet window came and went
    blurred = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (watching) {
        watching = false;
        cleanup();
        onAbandon();
      }
    }, graceMs);
  };
  const cleanup = () => {
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("focus", onFocus);
    clearTimeout(timer);
  };

  return {
    start() {
      if (watching) return;
      watching = true;
      blurred = false;
      win.addEventListener("blur", onBlur);
      win.addEventListener("focus", onFocus);
    },
    stop() {
      watching = false;
      cleanup();
    },
  };
}
