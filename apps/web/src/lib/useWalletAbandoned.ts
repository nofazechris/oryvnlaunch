"use client";

import { useEffect, useState } from "react";
import { createAbandonDetector } from "./abandon";

/**
 * True when `waiting` is on (we are waiting for the wallet to answer) and it looks like the wallet window was
 * closed without approving. Turns itself off again when `waiting` does. See abandon.ts.
 */
export function useWalletAbandoned(waiting: boolean): boolean {
  const [abandoned, setAbandoned] = useState(false);
  useEffect(() => {
    setAbandoned(false);
    if (!waiting) return;
    const detector = createAbandonDetector(window, () => setAbandoned(true));
    detector.start();
    return () => detector.stop();
  }, [waiting]);
  return abandoned;
}
