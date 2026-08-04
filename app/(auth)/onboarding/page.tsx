import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { createWorkspaceAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { getDefaultWorkspaceSlug, requireSession } from "@/lib/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Create workspace" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const current = await requireSession();
  const query = await searchParams;
  const existingWorkspace = await getDefaultWorkspaceSlug(current.user.id, current.session.activeOrganizationId);
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo as Route : undefined;
  if (existingWorkspace) redirect(returnTo ?? `/workspace/${existingWorkspace}/overview`);
  return (
    <main id="main-content" className={styles.shell}>
      <section className={styles.context}>
        <Logo />
        <div><div className="eyebrow">Two-minute setup</div><h1>One app. One key. Clear costs.</h1></div>
        <p className="mono">A workspace holds your team and the AI apps you want to track.</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <div className="coordinate">STEP 1 OF 2</div>
          <h2>Set up your workspace</h2>
          <p>Welcome, {current.user.name.split(" ")[0]}. Name your team and the first app you want to track.</p>
          <form action={createWorkspaceAction} className="form-grid">
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <div className="field"><label htmlFor="workspaceName">Team or company name</label><input id="workspaceName" name="workspaceName" placeholder="Acme…" autoComplete="organization" minLength={2} maxLength={80} aria-describedby="workspace-help" required /><small className="field-help" id="workspace-help">This becomes the shared workspace for your team.</small></div>
            <div className="field"><label htmlFor="projectName">App name</label><input id="projectName" name="projectName" placeholder="Customer support assistant…" autoComplete="off" minLength={2} maxLength={80} aria-describedby="project-help" required /><small className="field-help" id="project-help">You can add more apps later.</small></div>
            {query.error ? <p className="error-copy" role="alert">Check both names and try again.</p> : null}
            <SubmitButton pendingLabel="Creating workspace…">Create workspace & key →</SubmitButton>
          </form>
        </div>
      </section>
    </main>
  );
}
