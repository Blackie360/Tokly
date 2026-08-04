import { AppShell } from "@/components/app-shell";
import { requireWorkspace } from "@/lib/session";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  return <AppShell workspaceName={current.workspace.name} workspaceSlug={orgSlug} userName={current.user.name} role={current.workspace.role}>{children}</AppShell>;
}
