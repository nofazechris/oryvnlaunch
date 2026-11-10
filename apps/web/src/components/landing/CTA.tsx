"use client";

import Link from "next/link";
import { Reveal } from "./Reveal";
import { Contour } from "./Contour";

export function CTA() {
  return (
    <section
      data-screen-label="07 Final CTA"
      style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0" }}
    >
      <Reveal
        style={{
          position: "relative",
          borderRadius: "clamp(28px,3vw,44px)",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.09)",
          overflow: "hidden",
          padding: "clamp(56px,8vw,120px) clamp(24px,5vw,72px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 28,
        }}
      >
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Contour density={40} seed={3} opacity={0.14} />
        </div>
        <h2
          style={{
            position: "relative",
            margin: 0,
            fontWeight: 400,
            fontSize: "clamp(44px,7vw,100px)",
            letterSpacing: "-0.045em",
            lineHeight: 0.98,
            textWrap: "balance",
          }}
        >
          Your next idea
          <br />
          starts here.
        </h2>
        <Link
          href="/login"
          className="lp-ctabtn"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            height: 56,
            padding: "0 30px",
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 16,
            color: "#1a0d05",
            background: "linear-gradient(90deg,#FF9865,#FFE3CF)",
          }}
        >
          Get started
        </Link>
      </Reveal>
    </section>
  );
}
