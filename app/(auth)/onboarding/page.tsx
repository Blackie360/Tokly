import type { Metadata } from "next";
import { createWorkspaceAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { requireSession } from "@/lib/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Create workspace" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const current = await requireSession();
  const query = await searchParams;
  return (
    <main id="main-content" className={styles.shell}>
      <section className={styles.context}>
        <Logo />
        <div><div className="eyebrow">Workspace calibration</div><h1>Start with one signal.</h1></div>
        <p className="mono">Create a workspace and first project. Your write key is shown once, then only its SHA-256 digest remains.</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <div className="coordinate">TM-SETUP / 002</div>
          <h2>Welcome, {current.user.name.split(" ")[0]}</h2>
          <p>Define the team and the first application you want to meter.</p>
          <form action={createWorkspaceAction} className="form-grid">
            <div className="field"><label htmlFor="workspaceName">Workspace name</label><input id="workspaceName" name="workspaceName" placeholder="Acme AI" minLength={2} maxLength={80} required /></div>
            <div className="field"><label htmlFor="projectName">First project</label><input id="projectName" name="projectName" placeholder="Production assistant" minLength={2} maxLength={80} required /></div>
            {query.error ? <p className="error-copy">Check both names and try again.</p> : null}
            <button className="button" type="submit">Create workspace →</button>
          </form>
        </div>
      </section>
    </main>
  );
}
