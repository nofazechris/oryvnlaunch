import { DashboardShell } from "@/components/dash/DashboardShell";
import { Intelligence } from "@/components/intelligence/Intelligence";

export const metadata = {
  title: "Intelligence | oryvnlaunch",
  description: "AI token research: contract, tokenomics, holders and activity from indexed on-chain data.",
};

export default function IntelligencePage() {
  return (
    <DashboardShell>
      <Intelligence />
    </DashboardShell>
  );
}
