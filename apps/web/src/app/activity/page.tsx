import { DashboardShell } from "@/components/dash/DashboardShell";
import { Activity } from "@/components/activity/Activity";

export const metadata = {
  title: "Activity — oryvnlaunch",
  description: "Every launch, buy and sell on the platform, as it lands on Starknet.",
};

export default function ActivityPage() {
  return (
    <DashboardShell>
      <Activity />
    </DashboardShell>
  );
}
