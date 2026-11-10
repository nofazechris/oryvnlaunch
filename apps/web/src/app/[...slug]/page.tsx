import { DashboardShell } from "@/components/dash/DashboardShell";
import { ComingSoon } from "@/components/app/ComingSoon";

// Catch-all for app routes not yet built (Dashboard, Settings, …). Explicit routes take
// precedence; this renders a "coming soon" inside the dashboard shell so navigation never
// dead-ends. It sits behind the shell's auth guard like the rest of the app.
export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const name = slug?.[0] ?? "page";
  return (
    <DashboardShell>
      <ComingSoon name={name} />
    </DashboardShell>
  );
}
