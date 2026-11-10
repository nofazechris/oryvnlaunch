import { DashboardShell } from "@/components/dash/DashboardShell";
import { Overview } from "@/components/dash/Overview";

export const metadata = { title: "Overview — oryvnlaunch" };

export default function OverviewPage() {
  return (
    <DashboardShell>
      <Overview />
    </DashboardShell>
  );
}
