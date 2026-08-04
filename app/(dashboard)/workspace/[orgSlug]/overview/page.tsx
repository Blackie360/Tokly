import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard/overview";
import { getDashboardData } from "@/lib/dashboard/queries";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  const data = await getDashboardData(current.workspace.id, { days: 30 });
  return <DashboardOverview data={data} usageHref={`/workspace/${orgSlug}/usage`} />;
}
