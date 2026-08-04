"use server";

import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { setTenant, withTenant } from "@/lib/db/tenant";
import {
  alertDeliveries,
  budgets,
  hourlyUsage,
  agentActivityEvents,
  machineConnections,
  machineDeviceAuthorizations,
  machinePairingCodes,
  member,
  notifications,
  organization,
  projectApiKeys,
  projects,
  rateLimitBuckets,
  session,
  usageEvents,
} from "@/lib/db/schema";
import { generateProjectKey, hashProjectKey } from "@/lib/security/api-keys";
import type { FormState } from "@/lib/form-state";
import { requireSession, requireWorkspace } from "@/lib/session";
import { slugify } from "@/lib/slug";

const workspaceSchema = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  projectName: z.string().trim().min(2).max(80),
  returnTo: z.string().optional(),
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

const projectDeleteSchema = z.object({
  orgSlug: z.string().min(1),
  projectId: z.string().uuid(),
});

const machineRevokeSchema = z.object({ orgSlug: z.string().min(1), connectionId: z.string().uuid() });
const machineApprovalSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  target: z.string().min(1).max(200),
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
    message: "An app is required for an app budget.",
  });

function encodeOneTimeKey(input: { rawKey: string; prefix: string; projectName: string; projectId: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeOneTimeKey(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { projectId?: string; prefix?: string };
  } catch {
    return null;
  }
}

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value as Route : undefined;
}

export async function createWorkspaceAction(formData: FormData) {
  const current = await requireSession();
  const parsed = workspaceSchema.safeParse({
    workspaceName: formData.get("workspaceName"),
    projectName: formData.get("projectName"),
    returnTo: formData.get("returnTo") || undefined,
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
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName: parsed.data.projectName, projectId }),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" },
  );
  redirect(safeReturnTo(parsed.data.returnTo) ?? `/workspace/${organizationSlug}/projects?created=1`);
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
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName: parsed.data.name, projectId }),
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

export async function approveMachineAuthorizationAction(formData: FormData) {
  const parsed = machineApprovalSchema.safeParse({ code: formData.get("code"), target: formData.get("target") });
  if (!parsed.success) redirect("/connect/machine?error=invalid");
  const separator = parsed.data.target.lastIndexOf(":");
  const orgSlug = parsed.data.target.slice(0, separator);
  const projectId = parsed.data.target.slice(separator + 1);
  if (!orgSlug || !z.string().uuid().safeParse(projectId).success) redirect(`/connect/machine?code=${encodeURIComponent(parsed.data.code)}&error=invalid`);

  const current = await requireWorkspace(orgSlug);
  const project = await withTenant(current.workspace.id, (tx) => tx.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, current.workspace.id))).limit(1));
  if (!project[0]) redirect(`/connect/machine?code=${encodeURIComponent(parsed.data.code)}&error=project`);

  const approved = await getDb().update(machineDeviceAuthorizations).set({
    organizationId: current.workspace.id,
    projectId,
    approvedBy: current.user.id,
    approvedAt: new Date(),
  }).where(and(
    eq(machineDeviceAuthorizations.userCodeHash, hashProjectKey(parsed.data.code)),
    gt(machineDeviceAuthorizations.expiresAt, new Date()),
    isNull(machineDeviceAuthorizations.approvedAt),
    isNull(machineDeviceAuthorizations.consumedAt),
  )).returning({ id: machineDeviceAuthorizations.id });
  if (!approved[0]) redirect(`/connect/machine?code=${encodeURIComponent(parsed.data.code)}&error=expired`);
  redirect(`/connect/machine?code=${encodeURIComponent(parsed.data.code)}&approved=1`);
}

export async function revokeMachineConnectionAction(formData: FormData) {
  const parsed = machineRevokeSchema.safeParse({ orgSlug: formData.get("orgSlug"), connectionId: formData.get("connectionId") });
  if (!parsed.success) return;
  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;
  await getDb().update(machineConnections).set({ revokedAt: new Date() }).where(and(eq(machineConnections.id, parsed.data.connectionId), eq(machineConnections.organizationId, current.workspace.id)));
  revalidatePath(`/workspace/${parsed.data.orgSlug}/projects`);
}

export async function deleteProjectAction(formData: FormData) {
  const parsed = projectDeleteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return;

  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return;

  let deleted = false;
  await withTenant(current.workspace.id, async (tx) => {
    const project = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, current.workspace.id)))
      .limit(1);
    if (!project[0]) return;

    const projectBudgets = await tx
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.organizationId, current.workspace.id), eq(budgets.projectId, parsed.data.projectId)));
    const budgetIds = projectBudgets.map((budget) => budget.id);

    if (budgetIds.length > 0) {
      const projectNotifications = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.organizationId, current.workspace.id), inArray(notifications.budgetId, budgetIds)));
      const notificationIds = projectNotifications.map((notification) => notification.id);
      if (notificationIds.length > 0) {
        await tx
          .delete(alertDeliveries)
          .where(and(eq(alertDeliveries.organizationId, current.workspace.id), inArray(alertDeliveries.notificationId, notificationIds)));
      }
      await tx
        .delete(notifications)
        .where(and(eq(notifications.organizationId, current.workspace.id), inArray(notifications.budgetId, budgetIds)));
      await tx
        .delete(budgets)
        .where(and(eq(budgets.organizationId, current.workspace.id), inArray(budgets.id, budgetIds)));
    }

    const projectKeys = await tx
      .select({ id: projectApiKeys.id })
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.organizationId, current.workspace.id), eq(projectApiKeys.projectId, parsed.data.projectId)));
    const keyIds = projectKeys.map((key) => key.id);
    if (keyIds.length > 0) {
      await tx.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.apiKeyId, keyIds));
    }

    const machineIds = (await tx.select({ id: machineConnections.id }).from(machineConnections).where(and(eq(machineConnections.organizationId, current.workspace.id), eq(machineConnections.projectId, parsed.data.projectId)))).map((machine) => machine.id);
    if (machineIds.length) await tx.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.apiKeyId, machineIds));
    await tx.delete(agentActivityEvents).where(and(eq(agentActivityEvents.organizationId, current.workspace.id), eq(agentActivityEvents.projectId, parsed.data.projectId)));
    await tx.delete(machineDeviceAuthorizations).where(and(eq(machineDeviceAuthorizations.organizationId, current.workspace.id), eq(machineDeviceAuthorizations.projectId, parsed.data.projectId)));
    await tx.delete(machinePairingCodes).where(and(eq(machinePairingCodes.organizationId, current.workspace.id), eq(machinePairingCodes.projectId, parsed.data.projectId)));
    await tx.delete(machineConnections).where(and(eq(machineConnections.organizationId, current.workspace.id), eq(machineConnections.projectId, parsed.data.projectId)));

    await tx.delete(hourlyUsage).where(and(eq(hourlyUsage.organizationId, current.workspace.id), eq(hourlyUsage.projectId, parsed.data.projectId)));
    await tx.delete(usageEvents).where(and(eq(usageEvents.organizationId, current.workspace.id), eq(usageEvents.projectId, parsed.data.projectId)));
    await tx.delete(projectApiKeys).where(and(eq(projectApiKeys.organizationId, current.workspace.id), eq(projectApiKeys.projectId, parsed.data.projectId)));
    await tx.delete(projects).where(and(eq(projects.organizationId, current.workspace.id), eq(projects.id, parsed.data.projectId)));
    deleted = true;
  });

  if (!deleted) return;
  const cookieStore = await cookies();
  const revealedKey = decodeOneTimeKey(cookieStore.get("tokly_new_key")?.value);
  if (revealedKey?.projectId === parsed.data.projectId) cookieStore.delete("tokly_new_key");
  revalidatePath(`/workspace/${parsed.data.orgSlug}/projects`);
  revalidatePath(`/workspace/${parsed.data.orgSlug}/overview`);
  revalidatePath(`/workspace/${parsed.data.orgSlug}/usage`);
  revalidatePath(`/workspace/${parsed.data.orgSlug}/budgets`);
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
    encodeOneTimeKey({ rawKey: key.rawKey, prefix: key.prefix, projectName, projectId: parsed.data.projectId }),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" },
  );
  redirect(`/workspace/${parsed.data.orgSlug}/projects?created=1`);
}

export async function verifyKeySetupAction(formData: FormData) {
  const orgSlug = z.string().min(1).safeParse(formData.get("orgSlug"));
  if (!orgSlug.success) redirect("/onboarding");
  const current = await requireWorkspace(orgSlug.data);
  const cookieStore = await cookies();
  const revealedKey = decodeOneTimeKey(cookieStore.get("tokly_new_key")?.value);
  if (!revealedKey?.projectId || !revealedKey.prefix) {
    redirect(`/workspace/${orgSlug.data}/projects`);
  }

  const keyStatus = await getDb()
    .select({ lastUsedAt: projectApiKeys.lastUsedAt })
    .from(projectApiKeys)
    .where(and(
      eq(projectApiKeys.organizationId, current.workspace.id),
      eq(projectApiKeys.projectId, revealedKey.projectId),
      eq(projectApiKeys.keyPrefix, revealedKey.prefix),
    ))
    .limit(1);

  if (!keyStatus[0]?.lastUsedAt) {
    redirect(`/workspace/${orgSlug.data}/projects?created=1&status=waiting`);
  }

  cookieStore.delete("tokly_new_key");
  redirect(`/workspace/${orgSlug.data}/overview`);
}

export async function createBudgetAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  const projectIdValue = String(formData.get("projectId") ?? "");
  const parsed = budgetSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    name: formData.get("name"),
    scope: formData.get("scope"),
    projectId: projectIdValue || undefined,
    monthlyLimitUsd: formData.get("monthlyLimitUsd"),
    alertEmail: formData.get("alertEmail"),
  });
  if (!parsed.success) return { status: "error", message: "Check the budget details and try again." };
  const current = await requireWorkspace(parsed.data.orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return { status: "error", message: "Only owners and admins can create budgets." };
  const created = await withTenant(current.workspace.id, async (tx) => {
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
      if (!project[0]) return false;
    }
    await tx.insert(budgets).values({
      organizationId: current.workspace.id,
      projectId: parsed.data.scope === "project" ? parsed.data.projectId : null,
      name: parsed.data.name,
      scope: parsed.data.scope,
      monthlyLimitUsd: parsed.data.monthlyLimitUsd.toFixed(2),
      alertEmail: parsed.data.alertEmail,
    });
    return true;
  });
  if (!created) return { status: "error", message: "Choose an app in this workspace and try again." };
  revalidatePath(`/workspace/${parsed.data.orgSlug}/budgets`);
  return { status: "success", message: "Budget created." };
}

export async function inviteMemberAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const email = z.email().safeParse(formData.get("email"));
  const role = z.enum(["admin", "member"]).safeParse(formData.get("role"));
  if (!email.success || !role.success) return { status: "error", message: "Enter a valid email and access level." };
  const current = await requireWorkspace(orgSlug);
  if (!/(owner|admin)/.test(current.workspace.role)) return { status: "error", message: "Only owners and admins can invite teammates." };
  try {
    await auth.api.createInvitation({
      body: { email: email.data, role: role.data, organizationId: current.workspace.id },
      headers: await headers(),
    });
  } catch {
    return { status: "error", message: "Invitation could not be sent. Check the address or pending invitations." };
  }
  revalidatePath(`/workspace/${orgSlug}/members`);
  return { status: "success", message: `Invitation sent to ${email.data}.` };
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
