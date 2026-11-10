import { DashboardShell } from "@/components/dash/DashboardShell";
import { TerminalView } from "@/components/terminal/TerminalView";

export const metadata = {
  title: "Terminal — oryvnlaunch",
  description: "Trade tokens on their bonding curve: live chart, order form and token AI.",
};

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <DashboardShell>
      <TerminalView symbol={t ?? "BUN"} />
    </DashboardShell>
  );
}
