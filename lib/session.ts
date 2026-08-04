import "server-only";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  return current;
}

export async function getDefaultWorkspaceSlug(userId: string, activeOrganizationId?: string | null) {
  if (activeOrganizationId) {
    const active = await getDb()
      .select({ slug: organization.slug })
      .from(organization)
      .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
      .where(eq(organization.id, activeOrganizationId))
      .limit(1);
    if (active[0]) return active[0].slug;
  }

  const first = await getDb()
    .select({ slug: organization.slug })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt)
    .limit(1);
  return first[0]?.slug ?? null;
}

export async function requireWorkspace(slug: string) {
  const current = await requireSession();
  const rows = await getDb()
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(organization)
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, current.user.id)),
    )
    .where(eq(organization.slug, slug))
    .limit(1);

  const workspace = rows[0];
  if (!workspace) redirect("/onboarding");
  return { ...current, workspace };
}
