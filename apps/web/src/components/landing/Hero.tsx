"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import { TOKENS, fmtK, fmtP } from "@/lib/oryvn-data";
import { Contour } from "./Contour";
import { Ring } from "./Ring";
import { Nav } from "./Nav";
import { ImageSlot } from "./ImageSlot";

interface HeroProps {
  brand: string;
  w: number;
  contourDensity: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpenWallet: () => void;
  onSearch: () => void;
  walletLabel: string;
}

const AVATARS = [
  "linear-gradient(135deg,#F38FC4,#FF9865)",
  "linear-gradient(135deg,#73D9E8,#568BFF)",
  "linear-gradient(135deg,#C7EA83,#55D69A)",
  "linear-gradient(135deg,#B69AFF,#F38FC4)",
];

function tilt(e: MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-10px) scale(1.02)`;
}
function untilt(e: MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = "";
}

export function Hero({
  brand,
  w,
  contourDensity,
  menuOpen,
  onToggleMenu,
  onOpenWallet,
  onSearch,
  walletLabel,
}: HeroProps) {
  const mobile = w < 760;
  const showRing = w >= 1100;
  const showSideCopy = w >= 1100;
  const W = w >= 1200 ? 380 : w >= 900 ? 320 : 280;
  const H = Math.round(W * 1.36);
  const rots = [-9, 0, 10];
  const tops = [110, 0, 130];
  const zs = [1, 2, 3];
  const grad3 = [TOKENS[0]!.g[0], "#FF5E3A", "#F38FC4"];
  const degs = [160, 170, 150];

  const stageStyle: CSSProperties = mobile
    ? {
        display: "flex",
        gap: 16,
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        padding: "10px 18px 30px",
        margin: "0 -18px",
      }
    : { position: "absolute", inset: 0 };

  const stageH = mobile ? H + 40 : Math.round(H * 0.92);

  const cards = [0, 1, 2].map((i) => {
    const t = TOKENS[i]!;
    const off = [-0.9, 0, 0.9][i]!;
    const rot = mobile ? 0 : rots[i]!;
    const dur = 4200 + i * 900;
    const sub =
      i === 0 ? `${t.bond}% bonded` : i === 1 ? `${fmtK(t.holders)} holders` : `${t.chg > 0 ? "+" : ""}${t.chg}% 24h`;
    const posStyle: CSSProperties = mobile
      ? { position: "relative", flex: `0 0 ${W}px`, height: H, scrollSnapAlign: "center", zIndex: i }
      : {
          position: "absolute",
          width: W,
          height: H,
          left: `calc(50% - ${W / 2}px + ${Math.round(off * W)}px)`,
          top: tops[i],
          zIndex: zs[i],
        };
    return {
      i,
      t,
      sub,
      rot,
      dur,
      posStyle,
      bg: `linear-gradient(${degs[i]}deg, ${t.g[1]} 0%, ${t.g[0]} 55%, ${grad3[i]} 100%)`,
      avatarCount: 3 + (i === 1 ? 1 : 0),
      glyphSize: Math.round(W * 0.42),
      titleSize: W > 300 ? 30 : 26,
    };
  });

  return (
    <section
      data-screen-label="01 Hero"
      style={{
        position: "relative",
        overflow: "hidden",
        borderBottomLeftRadius: "clamp(28px,4vw,56px)",
        borderBottomRightRadius: "clamp(28px,4vw,56px)",
        background: "#000",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <Contour density={contourDensity} seed={7} opacity={0.16} />
      </div>

      <Nav
        brand={brand}
        showNavLinks={w >= 980}
        showBurger={w < 980}
        menuOpen={w < 980 && menuOpen}
        onToggleMenu={onToggleMenu}
        onSearch={onSearch}
        onOpenWallet={onOpenWallet}
        walletLabel={walletLabel}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1440,
          margin: "0 auto",
          padding: "clamp(40px,6vw,72px) clamp(18px,5vw,72px) 0",
        }}
      >
        {showRing && (
          <div style={{ position: "absolute", left: "clamp(18px,5vw,72px)", top: 4, width: 132, height: 132 }}>
            <Ring brand={brand} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: 13,
              color: "#d8d8d8",
              background: "rgba(255,255,255,0.03)",
              maxWidth: "100%",
            }}
          >
            <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%", background: "#73D9E8" }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              The next generation of token launches, powered by AI.
            </span>
          </span>

          <h1
            style={{
              margin: 0,
              fontWeight: 400,
              fontSize: "clamp(50px,8.2vw,116px)",
              lineHeight: 0.98,
              letterSpacing: "-0.045em",
              textWrap: "balance",
            }}
          >
            Launch Tokens.
            <br />
            Think Smarter.
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 6 }}>
            <Link
              href="/launch"
              className="lp-cta-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                height: 52,
                padding: "0 26px",
                borderRadius: 999,
                background: "#fff",
                color: "#050505",
                fontWeight: 600,
                fontSize: 15,
                whiteSpace: "nowrap",
              }}
            >
              Launch a Token
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link
              href="/explore"
              className="lp-cta-ghost"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 52,
                padding: "0 26px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                fontWeight: 500,
                fontSize: 15,
                whiteSpace: "nowrap",
              }}
            >
              Explore Tokens
            </Link>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: "clamp(36px,5vw,64px)", height: stageH }}>
          {showSideCopy && (
            <p
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 270,
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#A1A1A1",
                textWrap: "pretty",
              }}
            >
              The cards above are examples — this is how a launch looks. Create, launch and discover tokens on
              Starknet, with everything you need to launch faster and understand what you&apos;re buying.
            </p>
          )}

          <div style={stageStyle}>
            {cards.map((c) => (
              <div
                key={c.i}
                className="oc-float"
                style={
                  {
                    ...c.posStyle,
                    "--oc-rot": `${c.rot}deg`,
                    "--oc-dur": `${c.dur}ms`,
                    transform: `rotate(${c.rot}deg)`,
                  } as CSSProperties
                }
              >
                <div
                  onMouseMove={tilt}
                  onMouseLeave={untilt}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderRadius: 30,
                    overflow: "hidden",
                    background: c.bg,
                    color: c.t.ink,
                    boxShadow: "0 30px 80px rgba(0,0,0,0.55),inset 0 0 0 1px rgba(255,255,255,0.35)",
                    transition: "transform .25s ease",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <span style={{ position: "absolute", left: 16, top: 16, zIndex: 3, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.55)", color: c.t.ink, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Example
                  </span>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", display: "grid", placeItems: "center" }}>
                    <span style={{ fontSize: c.glyphSize, fontWeight: 700, letterSpacing: "-0.06em", opacity: 0.18, lineHeight: 1 }}>
                      {c.t.sym}
                    </span>
                  </div>
                  <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "58%", color: c.t.ink }}>
                    <ImageSlot radius={22} placeholder="Drop 3D character art" />
                  </div>
                  <div style={{ position: "relative", padding: "26px 26px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: c.titleSize, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{c.t.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.78 }}>${c.t.sym} · {c.sub}</span>
                    </div>
                    <div style={{ display: "flex", flexShrink: 0 }}>
                      {Array.from({ length: c.avatarCount }).map((_, ai) => (
                        <span
                          key={ai}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            marginLeft: -9,
                            border: "2px solid rgba(255,255,255,0.85)",
                            background: AVATARS[ai],
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ position: "relative", padding: "14px 26px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 14, opacity: 0.7 }}>Price</span>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 16, fontWeight: 600 }}>{fmtP(c.t.price)} STRK</span>
                  </div>
                  <div style={{ position: "relative", margin: "12px 26px 0", height: 5, borderRadius: 99, background: "rgba(0,0,0,0.12)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${c.t.bond}%`, borderRadius: 99, background: c.t.ink }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
