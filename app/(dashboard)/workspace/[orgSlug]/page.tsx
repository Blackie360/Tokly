import { redirect } from "next/navigation";

export default async function WorkspaceIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/workspace/${orgSlug}/overview`);
}
