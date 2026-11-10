"use client";

import { useEffect, useState } from "react";

/**
 * Viewport width that is SSR-safe. Renders `initial` (1440, matching the design's
 * server default) on the server and first client paint, then updates on mount and
 * resize — so markup matches during hydration and the responsive layout settles after.
 */
export function useViewportWidth(initial = 1440): number {
  const [w, setW] = useState(initial);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

/** True only after the component has mounted on the client. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Respects the user's reduced-motion preference. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
