import type { Metadata } from "next";
import { signOutAction } from "@/app/actions";
import { PageHeader } from "@/components/dashboard/overview";
import styles from "@/components/dashboard/dashboard.module.css";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  return <>
    <PageHeader eyebrow="Policy surface / 06" title="Workspace settings" description="The monitoring boundary is intentionally narrower than your AI application." />
    <div className={styles.twoColumn}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Privacy contract</h2><span>Enforced by schema</span></div><div className={styles.panelBody}><h3>Collected</h3><p className="muted">Token counts, model/provider identifiers, request status, latency, cost, and allowlisted operational dimensions.</p><h3>Never collected</h3><p className="muted">Prompts, completions, tool payloads, files, provider API keys, or arbitrary metadata objects.</p><h3>Retention</h3><p className="muted">Usage events are immutable. Define a scheduled retention policy appropriate to your organization before production deployment.</p></div></section>
      <aside className={styles.panel}><div className={styles.panelHead}><h2>Current operator</h2><span>{current.workspace.role}</span></div><div className={styles.panelBody}><p><strong>{current.user.name}</strong><br/><span className="muted">{current.user.email}</span></p><p className="mono muted">workspace/{orgSlug}</p><form action={signOutAction}><button className="button secondary" type="submit">Sign out</button></form></div></aside>
    </div>
  </>;
}
