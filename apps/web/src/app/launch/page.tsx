import { DashboardShell } from "@/components/dash/DashboardShell";
import { LaunchStudio } from "@/components/launch/LaunchStudio";

export const metadata = {
  title: "Launch a token — oryvnlaunch",
  description: "Create and launch a token on Starknet with AI assistance and a bonding curve.",
};

export default function LaunchPage() {
  return (
    <DashboardShell>
      <LaunchStudio />
    </DashboardShell>
  );
}
