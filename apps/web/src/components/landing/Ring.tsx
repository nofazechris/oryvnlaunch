interface RingProps {
  brand: string;
}

/** Rotating circular text badge from the design's ring(). */
export function Ring({ brand }: RingProps) {
  const txt = `${brand} · launch on starknet · think smarter · `;
  return (
    <svg viewBox="0 0 132 132" width={132} height={132} className="oc-spin" aria-hidden="true">
      <defs>
        <path id="oc-ring" d="M66,66 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
      </defs>
      <circle cx={66} cy={66} r={30} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <text fill="#fff" fontSize={11} letterSpacing={1.6} fontFamily="var(--font-geist-sans), sans-serif">
        <textPath href="#oc-ring">{txt}</textPath>
      </text>
    </svg>
  );
}
