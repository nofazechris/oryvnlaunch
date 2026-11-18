import { useMemo } from "react";
import { contours } from "@/lib/art";

interface ContourProps {
  density: number;
  seed: number;
  opacity: number;
}

/**
 * Flowing contour-line background (ported from the design's contour()). A single
 * drifting layer; the .oc-drift animation is disabled under prefers-reduced-motion.
 */
export function Contour({ density, seed, opacity }: ContourProps) {
  const paths = useMemo(() => contours(1600, 900, density, seed), [density, seed]);
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    >
      <g className="oc-drift">
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={`rgba(255,255,255,${opacity})`} strokeWidth={1} />
        ))}
      </g>
    </svg>
  );
}
