import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { approveMachineAuthorizationAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { getDb } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { machineDeviceAuthorizations, member, organization, projects } from "@/lib/db/schema";
import { hashProjectKey } from "@/lib/security/api-keys";
import { getCurrentSession } from "@/lib/session";
import authStyles from "@/app/(auth)/auth.module.css";
import styles from "./machine.module.css";

export const metadata: Metadata = { title: "Connect developer machine" };

type Search = { code?: string; approved?: string; error?: string };

export default async function ConnectMachinePage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const code = query.code?.trim().toUpperCase();
  const validCode = code && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code) ? code : null;
  const authorization = validCode ? (await getDb().select().from(machineDeviceAuthorizations).where(and(
    eq(machineDeviceAuthorizations.userCodeHash, hashProjectKey(validCode)),
    gt(machineDeviceAuthorizations.expiresAt, new Date()),
    isNull(machineDeviceAuthorizations.consumedAt),
  )).limit(1))[0] : null;

  if (authorization && !authorization.approvedAt) {
    const current = await getCurrentSession();
    const returnTo = `/connect/machine?code=${encodeURIComponent(validCode!)}`;
    if (!current) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);

    const workspaceRows = await getDb().select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, current.user.id)))
      .where(eq(member.userId, current.user.id));
    if (!workspaceRows.length) redirect(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`);

    const choices = (await Promise.all(workspaceRows.map(async (workspace) => ({
      workspace,
      projects: await withTenant(workspace.id, (tx) => tx.select({ id: projects.id, name: projects.name }).from(projects)
        .where(eq(projects.organizationId, workspace.id)).orderBy(projects.name)),
    })))).flatMap(({ workspace, projects: appRows }) => appRows.map((project) => ({ workspace, project })));

    return <ConnectShell>
      <div className="coordinate">TERMINAL AUTHORIZATION</div>
      <h2>Connect {authorization.deviceName}</h2>
      <p>Confirm that the code below matches your terminal, then choose the app this machine should report to.</p>
      <div className={styles.code} aria-label={`Device code ${validCode}`}>{validCode}</div>
      <dl className={styles.details}>
        <div><dt>Platform</dt><dd>{authorization.platform}</dd></div>
        <div><dt>AI tools</dt><dd>{authorization.selectedTools.join(", ") || "None selected"}</dd></div>
      </dl>
      {query.error ? <p className="error-copy" role="alert">This authorization could not be completed. Start <span className="mono">tokly init</span> again.</p> : null}
      {choices.length ? <form action={approveMachineAuthorizationAction} className="form-grid">
        <input type="hidden" name="code" value={validCode!} />
        <div className="field">
          <label htmlFor="target">Tokly app</label>
          <select id="target" name="target" required>
            {choices.map(({ workspace, project }) => <option key={project.id} value={`${workspace.slug}:${project.id}`}>{workspace.name} / {project.name}</option>)}
          </select>
        </div>
        <SubmitButton pendingLabel="Authorizing…">Authorize terminal →</SubmitButton>
      </form> : <p className="error-copy">Create an app before connecting this machine.</p>}
      <p className={styles.privacy}>Tokly receives operational usage metadata only. Your prompts, responses, files, and provider credentials stay on your machine.</p>
    </ConnectShell>;
  }

  if (authorization?.approvedAt || (validCode && query.approved === "1")) {
    return <ConnectShell>
      <div className="coordinate">AUTHORIZATION COMPLETE</div>
      <h2>Terminal connected</h2>
      <p>Return to your terminal. The setup wizard will continue automatically, and you can close this tab.</p>
      <div className={styles.success} aria-hidden="true">✓</div>
    </ConnectShell>;
  }

  return <ConnectShell>
    <div className="coordinate">TERMINAL AUTHORIZATION</div>
    <h2>{query.error || validCode ? "Authorization expired" : "Machine connector release pending"}</h2>
    <p>{query.error || validCode ? "This link is invalid, expired, or already used. Start a new authorization after the CLI package is released." : "The optional tokly-cli connector is being prepared for its first npm release. Use the server-side SDK for exact application telemetry today."}</p>
    <Link className="button" href="/">Use the SDK →</Link>
  </ConnectShell>;
}

function ConnectShell({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className={authStyles.shell}>
    <section className={authStyles.context}>
      <Logo />
      <div><div className="eyebrow">Tokly machine setup</div><h1>Connect once. Measure locally.</h1></div>
      <p className="mono">Browser sign-in approves the terminal without copying an app key.</p>
    </section>
    <section className={authStyles.formPanel}><div className={authStyles.formCard}>{children}</div></section>
  </main>;
}
