import { DashboardShell } from "@/components/dash/DashboardShell";
import { Portfolio } from "@/components/portfolio/Portfolio";

export const metadata = {
  title: "Portfolio | oryvnlaunch",
  description: "Your Starknet token positions, holdings, P/L and recent activity.",
};

export default function PortfolioPage() {
  return (
    <DashboardShell>
      <Portfolio />
    </DashboardShell>
  );
}
