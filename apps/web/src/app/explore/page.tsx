import { DashboardShell } from "@/components/dash/DashboardShell";
import { Explore } from "@/components/explore/Explore";

export const metadata = {
  title: "Explore tokens — oryvnlaunch",
  description: "Discover new launches, trending tokens and emerging communities on Starknet.",
};

export default function ExplorePage() {
  return (
    <DashboardShell>
      <Explore />
    </DashboardShell>
  );
}
