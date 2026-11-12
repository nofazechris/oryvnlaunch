interface RingProps {
  brand: string;
}

// The ring path is a circle of radius 50, so its circumference is ~314.16 SVG units.
// textLength fits the text to the circle exactly; without it the text is longer than the
// circle and the end overlaps the start ("smarteroryvnlaunch").
const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Rotating circular text badge from the design's ring(). */
export function Ring({ brand }: RingProps) {
  const txt = `${brand} · launch on starknet · think smarter · `;
  return (
    <svg viewBox="0 0 132 132" width={132} height={132} className="oc-spin" aria-hidden="true">
      <defs>
        <path id="oc-ring" d={`M66,66 m-${RADIUS},0 a${RADIUS},${RADIUS} 0 1,1 ${RADIUS * 2},0 a${RADIUS},${RADIUS} 0 1,1 -${RADIUS * 2},0`} />
      </defs>
      <circle cx={66} cy={66} r={30} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <text fill="#fff" fontSize={10.5} letterSpacing={0.4} fontFamily="var(--font-geist-sans), sans-serif">
        <textPath href="#oc-ring" textLength={CIRCUMFERENCE - 2} lengthAdjust="spacing">{txt}</textPath>
      </text>
    </svg>
  );
}
