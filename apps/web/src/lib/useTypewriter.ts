"use client";

import { useEffect, useState } from "react";

/**
 * Reveals `text` one character at a time after `start` ms. When `enabled` is false
 * (reduced motion, or not yet in view) the full text is returned immediately.
 */
export function useTypewriter(text: string, start: number, speed: number, enabled: boolean) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setN(text.length);
      return;
    }
    setN(0);
    let iv: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      iv = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), speed);
    }, start);
    return () => {
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
  }, [text, start, speed, enabled]);
  return text.slice(0, n);
}
