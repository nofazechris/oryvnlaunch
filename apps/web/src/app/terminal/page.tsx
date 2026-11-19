import { DashboardShell } from "@/components/dash/DashboardShell";
import { TerminalView } from "@/components/terminal/TerminalView";

export const metadata = {
  title: "Terminal | oryvnlaunch",
  description: "Live chart, bonding progress and trades for every token on the curve.",
};

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <DashboardShell>
      <TerminalView address={t ?? null} />
    </DashboardShell>
  );
}
