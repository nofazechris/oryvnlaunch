"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import { Contour } from "./Contour";
import { Ring } from "./Ring";
import { Nav } from "./Nav";
import { PRODUCT_CARDS } from "./HeroArt";

interface HeroProps {
  brand: string;
  w: number;
  contourDensity: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onGetStarted: () => void;
  ctaLabel: string;
}

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

export function Hero({ brand, w, contourDensity, menuOpen, onToggleMenu, onGetStarted, ctaLabel }: HeroProps) {
  const mobile = w < 760;
  const showRing = w >= 1100;
  const showSideCopy = w >= 1100;
  const W = w >= 1200 ? 380 : w >= 900 ? 320 : 280;
  const H = Math.round(W * 1.36);
  const rots = [-9, 0, 10];
  const tops = [110, 0, 130];
  const zs = [1, 2, 3];
  const degs = [160, 170, 150];

  const stageStyle: CSSProperties = { position: "absolute", inset: 0 };
  // Tall enough that the side cards (offset down by up to 130px) show their artwork in full.
  const stageH = H + 150;

  const cards = PRODUCT_CARDS.map((c, i) => {
    const off = [-0.9, 0, 0.9][i]!;
    const rot = rots[i]!;
    const posStyle: CSSProperties = { position: "absolute", width: W, height: H, left: `calc(50% - ${W / 2}px + ${Math.round(off * W)}px)`, top: tops[i], zIndex: zs[i] };
    return {
      c,
      rot,
      dur: 4200 + i * 900,
      posStyle,
      bg: `linear-gradient(${degs[i]}deg, ${c.g[1]} 0%, ${c.g[0]} 55%, ${c.mid} 100%)`,
      titleSize: W > 300 ? 30 : 26,
    };
  });

  return (
    <section
      data-screen-label="01 Hero"
      style={{ position: "relative", overflow: "hidden", borderBottomLeftRadius: "clamp(28px,4vw,56px)", borderBottomRightRadius: "clamp(28px,4vw,56px)", background: "#000" }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <Contour density={contourDensity} seed={7} opacity={0.16} />
      </div>

      <Nav brand={brand} showNavLinks={w >= 980} showBurger={w < 980} menuOpen={w < 980 && menuOpen} onToggleMenu={onToggleMenu} onGetStarted={onGetStarted} ctaLabel={ctaLabel} />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1440, margin: "0 auto", padding: "clamp(40px,6vw,72px) clamp(18px,5vw,72px) 0" }}>
        {showRing && (
          <div style={{ position: "absolute", left: "clamp(18px,5vw,72px)", top: 4, width: 132, height: 132 }}>
            <Ring brand={brand} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, color: "#d8d8d8", background: "rgba(255,255,255,0.03)", maxWidth: "100%" }}>
            <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%", background: "#73D9E8" }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>The next generation of token launches, powered by AI.</span>
          </span>

          <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(50px,8.2vw,116px)", lineHeight: 0.98, letterSpacing: "-0.045em", textWrap: "balance" }}>
            Launch Tokens.
            <br />
            Think Smarter.
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 6 }}>
            <Link href="/login" className="lp-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 26px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 15, whiteSpace: "nowrap" }}>
              Get started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
            <a href="#how" className="lp-cta-ghost" style={{ display: "inline-flex", alignItems: "center", height: 52, padding: "0 26px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", fontWeight: 500, fontSize: 15, whiteSpace: "nowrap" }}>
              See how it works
            </a>
          </div>
        </div>

        {mobile && (
          // On a phone all three cards sit in one column, so nothing has to be swiped. They rise in one after another
          // and then drift very slightly, out of step with each other.
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36, paddingBottom: 36 }}>
            {PRODUCT_CARDS.map((c, i) => (
              <div key={c.key} className="oc-rise" style={{ "--oc-delay": `${i * 140}ms` } as CSSProperties}>
                <div
                  className="oc-bob"
                  style={{ "--oc-dur": `${3600 + i * 700}ms`, position: "relative", display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderRadius: 24, overflow: "hidden", background: `linear-gradient(${degs[i]}deg, ${c.g[1]} 0%, ${c.g[0]} 55%, ${c.mid} 100%)`, color: c.ink, boxShadow: "0 18px 44px rgba(0,0,0,0.5),inset 0 0 0 1px rgba(255,255,255,0.35)" } as CSSProperties}
                >
                  <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.55)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>{c.kicker.slice(0, 2)}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, textAlign: "left" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.7 }}>{c.kicker.slice(5)}</span>
                    <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{c.title}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.78, lineHeight: 1.35 }}>{c.sub}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!mobile && (
        <div style={{ position: "relative", marginTop: "clamp(36px,5vw,64px)", height: stageH }}>
          {showSideCopy && (
            <p style={{ position: "absolute", right: 0, top: 0, width: 270, margin: 0, fontSize: 14, lineHeight: 1.6, color: "#A1A1A1", textWrap: "pretty" }}>
              Create, launch and discover tokens on Starknet. Everything you need to launch faster and understand exactly what you&apos;re buying.
            </p>
          )}

          <div style={stageStyle}>
            {cards.map(({ c, rot, dur, posStyle, bg, titleSize }) => (
              <div
                key={c.key}
                className="oc-float"
                style={{ ...posStyle, "--oc-rot": `${rot}deg`, "--oc-dur": `${dur}ms`, transform: `rotate(${rot}deg)` } as CSSProperties}
              >
                <div
                  onMouseMove={tilt}
                  onMouseLeave={untilt}
                  style={{ position: "relative", width: "100%", height: "100%", borderRadius: 30, overflow: "hidden", background: bg, color: c.ink, boxShadow: "0 30px 80px rgba(0,0,0,0.55),inset 0 0 0 1px rgba(255,255,255,0.35)", transition: "transform .25s ease", transformStyle: "preserve-3d" }}
                >
                  <div style={{ position: "relative", padding: "26px 26px 0", display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.kicker}</span>
                    <span style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 4 }}>{c.title}</span>
                    <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.78, lineHeight: 1.4 }}>{c.sub}</span>
                  </div>
                  <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "46%", borderRadius: 22, background: "rgba(255,255,255,0.28)", overflow: "hidden", color: c.ink }}>
                    {c.art}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
