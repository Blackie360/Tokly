"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { setTenant, withTenant } from "@/lib/db/tenant";
import {
  budgets,
  member,
  organization,
  projectApiKeys,
  projects,
  session,
} from "@/lib/db/schema";
import { generateProjectKey } from "@/lib/security/api-keys";
import { requireSession, requireWorkspace } from "@/lib/session";
import { slugify } from "@/lib/slug";

const workspaceSchema = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  projectName: z.string().trim().min(2).max(80),
});

const projectSchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  environment: z.enum(["live", "test"]),
});

const projectKeySchema = z.object({
  orgSlug: z.string().min(1),
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  environment: z.enum(["live", "test"]),
});

const budgetSchema = z
  .object({
    orgSlug: z.string().min(1),
    name: z.string().trim().min(2).max(80),
    scope: z.enum(["organization", "project"]),
    projectId: z.string().uuid().optional(),
    monthlyLimitUsd: z.coerce.number().positive().max(10_000_000),
    alertEmail: z.email(),
  })
  .refine((value) => value.scope !== "project" || value.projectId, {
    path: ["projectId"],
    message: "A project is required for a project budget.",
  });

function encodeOneTimeKey(input: { rawKey: string; prefix: string; projectName: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export async function createWorkspaceAction(formData: FormData) {
  const current = await requireSession();
  const parsed = workspaceSchema.safeParse({
    workspaceName: formData.get("workspaceName"),
    projectName: formData.get("projectName"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid");

  const organizationId = randomUUID();
  const organizationSlug = `${slugify(parsed.data.workspaceName)}-${organizationId.slice(0, 6)}`;
  const projectId = randomUUID();
  const projectSlug = slugify(parsed.data.projectName) || "first-project";
  const key = generateProjectKey("live");

  await getDb().transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: parsed.data.workspaceName,
      slug: organizationSlug,
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId: current.user.id,
      role: "owner",
    });
    await tx
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.id, current.session.id));
    await setTenant(tx, organizationId);
    await tx.insert(projects).values({
      id: projectId,
      organizationId,
      name: parsed.data.projectName,
      slug: projectSlug,
    });
    await tx.insert(projectApiKeys).values({
      organizationId,
      projectId,
      name: "Primary live key",
      environment: "live",
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
  });

  const cookieStore = await cookies();
  cookieStore.set(
    "tokly_new_key",
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName: parsed.data.projectName }),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" },
  );
  redirect(`/workspace/${organizationSlug}/projects?created=1`);
}

export async function createProjectAction(formData: FormData) {
  const parsed = projectSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    name: formData.get("name"),
    environment: formData.get("environment"),
  });
  if (!parsed.success) return;
  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;

  const projectId = randomUUID();
  const key = generateProjectKey(parsed.data.environment);
  await withTenant(current.workspace.id, async (tx) => {
    await tx.insert(projects).values({
      id: projectId,
      organizationId: current.workspace.id,
      name: parsed.data.name,
      slug: `${slugify(parsed.data.name)}-${projectId.slice(0, 5)}`,
    });
    await tx.insert(projectApiKeys).values({
      organizationId: current.workspace.id,
      projectId,
      name: `Primary ${parsed.data.environment} key`,
      environment: parsed.data.environment,
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
  });

  (await cookies()).set(
    "tokly_new_key",
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName: parsed.data.name }),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" },
  );
  redirect(`/workspace/${parsed.data.orgSlug}/projects?created=1`);
}

export async function revokeProjectKeyAction(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const keyId = String(formData.get("keyId") ?? "");
  const current = await requireWorkspace(orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role) || !z.string().uuid().safeParse(keyId).success) return;
  await getDb()
    .update(projectApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(projectApiKeys.id, keyId), eq(projectApiKeys.organizationId, current.workspace.id)));
  revalidatePath(`/workspace/${orgSlug}/projects`);
}

export async function createProjectKeyAction(formData: FormData) {
  const parsed = projectKeySchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    environment: formData.get("environment"),
  });
  if (!parsed.success) return;
  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;

  const key = generateProjectKey(parsed.data.environment);
  let projectName: string | undefined;
  await withTenant(current.workspace.id, async (tx) => {
    const project = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, current.workspace.id)))
      .limit(1);
    if (!project[0]) return;
    projectName = project[0].name;
    await tx.insert(projectApiKeys).values({
      organizationId: current.workspace.id,
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      environment: parsed.data.environment,
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
  });
  if (!projectName) return;

  (await cookies()).set(
    "tokly_new_key",
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName }),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" },
  );
  redirect(`/workspace/${parsed.data.orgSlug}/projects?created=1`);
}

export async function consumeKeyRevealAction() {
  (await cookies()).delete("tokly_new_key");
}

export async function createBudgetAction(formData: FormData) {
  const projectIdValue = String(formData.get("projectId") ?? "");
  const parsed = budgetSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    name: formData.get("name"),
    scope: formData.get("scope"),
    projectId: projectIdValue || undefined,
    monthlyLimitUsd: formData.get("monthlyLimitUsd"),
    alertEmail: formData.get("alertEmail"),
  });
  if (!parsed.success) return;
  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;
  await withTenant(current.workspace.id, async (tx) => {
    if (parsed.data.scope === "project") {
      const project = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, parsed.data.projectId!),
            eq(projects.organizationId, current.workspace.id),
          ),
        )
        .limit(1);
      if (!project[0]) return;
    }
    await tx.insert(budgets).values({
      organizationId: current.workspace.id,
      projectId: parsed.data.scope === "project" ? parsed.data.projectId : null,
      name: parsed.data.name,
      scope: parsed.data.scope,
      monthlyLimitUsd: parsed.data.monthlyLimitUsd.toFixed(2),
      alertEmail: parsed.data.alertEmail,
    });
  });
  revalidatePath(`/workspace/${parsed.data.orgSlug}/budgets`);
}

export async function inviteMemberAction(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const email = z.email().safeParse(formData.get("email"));
  const role = z.enum(["admin", "member"]).safeParse(formData.get("role"));
  if (!email.success || !role.success) return;
  const current = await requireWorkspace(orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;
  await auth.api.createInvitation({
    body: { email: email.data, role: role.data, organizationId: current.workspace.id },
    headers: await headers(),
  });
  revalidatePath(`/workspace/${orgSlug}/members`);
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export async function acceptInvitationAction(formData: FormData) {
  const invitationId = z.string().min(1).safeParse(formData.get("invitationId"));
  if (!invitationId.success) redirect("/sign-in?error=invalid-invitation");

  const accepted = await auth.api.acceptInvitation({
    body: { invitationId: invitationId.data },
    headers: await headers(),
  });
  const org = await getDb()
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, accepted.invitation.organizationId))
    .limit(1);
  redirect(org[0] ? `/workspace/${org[0].slug}/overview` : "/onboarding");
}
