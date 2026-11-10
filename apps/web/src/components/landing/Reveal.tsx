"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

type RevealTag = "div" | "a" | "h2";

interface RevealProps {
  as?: RevealTag;
  index?: number;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  href?: string;
}

const ANIM = {
  initial: { opacity: 0, y: 36, scale: 0.98, filter: "blur(6px)" },
  whileInView: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.12, margin: "0px 0px -6% 0px" },
} as const;

/**
 * Scroll-reveal wrapper matching the design's reveal(): fade + rise + unblur, once,
 * staggered by index. Disabled under prefers-reduced-motion.
 */
export function Reveal({ as = "div", index = 0, children, style, className, href }: RevealProps) {
  const reduce = useReducedMotion();
  const transition = { duration: 0.9, delay: Math.min(index, 6) * 0.09, ease: [0.2, 0.8, 0.2, 1] as const };

  if (reduce) {
    if (as === "a") return <a href={href} style={style} className={className}>{children}</a>;
    if (as === "h2") return <h2 style={style} className={className}>{children}</h2>;
    return <div style={style} className={className}>{children}</div>;
  }

  if (as === "a") {
    return (
      <motion.a href={href} style={style} className={className} {...ANIM} transition={transition}>
        {children}
      </motion.a>
    );
  }
  if (as === "h2") {
    return (
      <motion.h2 style={style} className={className} {...ANIM} transition={transition}>
        {children}
      </motion.h2>
    );
  }
  return (
    <motion.div style={style} className={className} {...ANIM} transition={transition}>
      {children}
    </motion.div>
  );
}
