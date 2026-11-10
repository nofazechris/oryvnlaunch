import type { ReactNode } from "react";
import { AppNav } from "./AppNav";

export function AppShell({ active = "", hideAi = false, children }: { active?: string; hideAi?: boolean; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <AppNav active={active} hideAi={hideAi} />
      </div>
      {children}
    </div>
  );
}
