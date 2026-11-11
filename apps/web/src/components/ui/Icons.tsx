import type { CSSProperties, ReactNode } from "react";

/**
 * Small, consistent icon set (24px grid, 1.8 stroke, round caps) built from simple
 * primitives. IconTile wraps an icon in a gradient tile for use as an illustration.
 */
const PATHS: Record<string, ReactNode> = {
  sparkles: (
    <>
      <path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z" />
      <path d="M18.5 14.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c3 2.4 4.5 5.9 4.5 9.5v3h-9v-3c0-3.6 1.5-7.1 4.5-9.5z" />
      <circle cx="12" cy="9.5" r="1.7" />
      <path d="M7.5 12.5L4.5 16v3l3-1.6M16.5 12.5l3 3.5v3l-3-1.6M10 18.5h4l-2 3z" />
    </>
  ),
  curve: (
    <>
      <path d="M3 3v18h18" />
      <path d="M6.5 17c4 0 6-2 8-6s3-6 5-7" />
      <circle cx="19.5" cy="4" r="1.3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4.8-3 8.2-7 9.5-4-1.3-7-4.7-7-9.5V6z" />
      <path d="M8.8 12l2.2 2.2 4.2-4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M14 9l2 2" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5 7 4-14 2.5 7H21" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </>
  ),
  bolt: <path d="M13 2L4.5 14H11l-1 8 8.5-12H12z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 100 18c1.7 0 2.2-1.1 1.6-2.2-.6-1.2.2-2.6 1.6-2.6H17a4 4 0 004-4c0-5-4-9.2-9-9.2z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="7.8" r="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.2 14.2c2.9.2 4.8 2.3 4.8 5.3" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="0.9" />
      <circle cx="15" cy="10" r="0.9" />
      <path d="M8.2 14.2c1 1.9 2.4 2.8 3.8 2.8s2.8-.9 3.8-2.8" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 12.5l9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.3l2.6 2.6 5-5.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chat: <path d="M4 5.5h16V16H9.5L4 20.5z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  flask: (
    <>
      <path d="M9.5 3h5M10.5 3v6L5 19a1.6 1.6 0 001.4 2.4h11.2A1.6 1.6 0 0019 19l-5.5-10V3" />
      <path d="M7.7 15h8.6" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color = "currentColor", stroke = 1.8, style }: { name: IconName; size?: number; color?: string; stroke?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** Gradient tile illustration: soft glow, glossy highlight and a crisp white icon. */
export function IconTile({ name, from, to, size = 52, iconSize, radius }: { name: IconName; from: string; to: string; size?: number; iconSize?: number; radius?: number }) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius ?? size * 0.3,
        display: "grid",
        placeItems: "center",
        background: `linear-gradient(145deg, ${from}, ${to})`,
        boxShadow: `0 10px 30px ${to}44, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -8px 16px rgba(0,0,0,0.12)`,
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <span style={{ position: "absolute", left: "-20%", top: "-30%", width: "90%", height: "70%", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0))" }} />
      <Icon name={name} size={iconSize ?? size * 0.48} stroke={1.9} style={{ position: "relative", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }} />
    </span>
  );
}
