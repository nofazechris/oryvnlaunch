import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // oryvnlaunch palette (from the design PRD)
        ink: "#050505",
        cyan: "#73D9E8",
        violet: "#B69AFF",
        pink: "#F38FC4",
        orange: "#FF9865",
        lime: "#C7EA83",
        green: "#55D69A",
        danger: "#FF6868",
        amber: "#F3B65F",
        muted: "#A1A1A1",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
