import { DashboardShell } from "@/components/dash/DashboardShell";
import { TokenDetail } from "@/components/token/TokenDetail";

export const metadata = {
  title: "Token — oryvnlaunch",
  description: "Token detail: price, bonding progress, trades and launch facts.",
};

export default async function TokenPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <DashboardShell>
      <TokenDetail address={t ?? null} />
    </DashboardShell>
  );
}
