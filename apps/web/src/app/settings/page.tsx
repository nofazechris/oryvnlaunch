import { DashboardShell } from "@/components/dash/DashboardShell";
import { Settings } from "@/components/dash/Settings";

export const metadata = { title: "Settings | oryvnlaunch" };

export default function SettingsPage() {
  return (
    <DashboardShell>
      <Settings />
    </DashboardShell>
  );
}
