import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard/overview";
import { getDashboardData, hasUsageEvents } from "@/lib/dashboard/queries";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  const [data, hasUsage] = await Promise.all([
    getDashboardData(current.workspace.id, { days: 30 }),
    hasUsageEvents(current.workspace.id),
  ]);
  return <DashboardOverview data={data} hasUsage={hasUsage} projectsHref={`/workspace/${orgSlug}/projects`} usageHref={`/workspace/${orgSlug}/usage`} />;
}
