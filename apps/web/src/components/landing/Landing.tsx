"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewportWidth } from "@/lib/hooks";
import { Hero } from "./Hero";
import { TopLaunches } from "./TopLaunches";
import { Templates } from "./Templates";
import { HowItWorks } from "./HowItWorks";
import { AISection } from "./AISection";
import { BentoFeatures } from "./BentoFeatures";
import { LiveActivity } from "./LiveActivity";
import { CTA } from "./CTA";
import { Footer } from "./Footer";

const BRAND = "oryvnlaunch";
const CONTOUR_DENSITY = 46;

/** Public marketing page. Only "Get started" leads into sign-in; everything else is on-page. */
export function Landing() {
  const w = useViewportWidth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", overflowX: "hidden" }}>
      <Hero
        brand={BRAND}
        w={w}
        contourDensity={CONTOUR_DENSITY}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onGetStarted={() => router.push("/login")}
        ctaLabel="Get started"
      />
      <TopLaunches />
      <Templates />
      <HowItWorks />
      <AISection />
      <BentoFeatures />
      <LiveActivity />
      <CTA />
      <Footer brand={BRAND} />
    </main>
  );
}
