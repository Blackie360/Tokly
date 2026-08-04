import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createProjectAction, createProjectKeyAction, revokeProjectKeyAction } from "@/app/actions";
import { PageHeader } from "@/components/dashboard/overview";
import { OneTimeKeyReveal } from "@/components/one-time-key-reveal";
import styles from "@/components/dashboard/dashboard.module.css";
import { getDb } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { projectApiKeys, projects } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Projects & keys" };

function decodeKey(value: string | undefined) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { rawKey: string; prefix: string; projectName: string }; } catch { return null; }
}

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const current = await requireWorkspace(orgSlug);
  const projectRows = await withTenant(current.workspace.id, (tx) => tx.select().from(projects).where(eq(projects.organizationId, current.workspace.id)).orderBy(projects.name));
  const keyRows = await getDb().select().from(projectApiKeys).where(eq(projectApiKeys.organizationId, current.workspace.id)).orderBy(desc(projectApiKeys.createdAt));
  const oneTimeKey = query.created ? decodeKey((await cookies()).get("tokly_new_key")?.value) : null;
  const canManage = /(owner|admin)/.test(current.workspace.role);
  const projectNames = new Map(projectRows.map((project) => [project.id, project.name]));
  const curl = `curl -X POST ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1/events \\
  -H "Authorization: Bearer YOUR_PROJECT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"events":[{"id":"evt_001","timestamp":"${new Date().toISOString()}","provider":"openai","model":"gpt-5.5","operation":"generation","usage":{"inputTokens":1200,"outputTokens":240},"dimensions":{"environment":"production","feature":"assistant"}}]}'`;
  return <>
    <PageHeader eyebrow="Instrumentation / 04" title="Projects & write keys" description="Keys authorize usage ingestion only. They never grant access to an AI provider." />
    {oneTimeKey ? <OneTimeKeyReveal value={oneTimeKey} /> : null}
    <div className={styles.twoColumn}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Active projects and keys</h2><span>{projectRows.length} projects</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Project</th><th>Key</th><th>Environment</th><th>Last used</th><th>Status</th><th></th></tr></thead><tbody>{keyRows.map((key) => <tr key={key.id}><td>{projectNames.get(key.projectId) ?? "Unknown"}</td><td className="mono">{key.keyPrefix}••••</td><td>{key.environment}</td><td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt.toISOString()) : "Never"}</td><td><span className={`${styles.status} ${key.revokedAt ? styles.error : ""}`}>{key.revokedAt ? "revoked" : "active"}</span></td><td>{canManage && !key.revokedAt ? <form action={revokeProjectKeyAction}><input type="hidden" name="orgSlug" value={orgSlug}/><input type="hidden" name="keyId" value={key.id}/><button className="button danger" type="submit">Revoke</button></form> : null}</td></tr>)}</tbody></table></div></section>
      <aside className={styles.panel}><div className={styles.panelHead}><h2>Create project</h2><span>Key shown once</span></div><div className={styles.panelBody}>{canManage ? <form action={createProjectAction} className="form-grid"><input type="hidden" name="orgSlug" value={orgSlug}/><div className="field"><label htmlFor="project-name">Project name</label><input id="project-name" name="name" placeholder="Support copilot" required/></div><div className="field"><label htmlFor="key-env">Key environment</label><select id="key-env" name="environment"><option value="live">Live</option><option value="test">Test</option></select></div><button className="button" type="submit">Create project →</button></form> : <p className="muted">Only owners and admins can create projects.</p>}</div></aside>
    </div>
    {canManage ? <section className={`${styles.panel} ${styles.section}`}><div className={styles.panelHead}><h2>Rotate or add a write key</h2><span>Overlap before revoke</span></div><div className={styles.panelBody}><form action={createProjectKeyAction} className="form-grid"><input type="hidden" name="orgSlug" value={orgSlug}/><div className="field"><label htmlFor="rotate-project">Project</label><select id="rotate-project" name="projectId" required><option value="">Select project</option>{projectRows.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div className="field"><label htmlFor="key-name">Key name</label><input id="key-name" name="name" placeholder="August rotation" minLength={2} maxLength={80} required/></div><div className="field"><label htmlFor="rotate-env">Environment</label><select id="rotate-env" name="environment"><option value="live">Live</option><option value="test">Test</option></select></div><button className="button" type="submit">Create overlapping key →</button></form></div></section> : null}
    <section className={`${styles.panel} ${styles.section}`}><div className={styles.panelHead}><h2>Send a test event</h2><span>REST / curl</span></div><div className={styles.panelBody}><pre className={styles.codeBlock}><code>{curl}</code></pre><p className="muted">The endpoint rejects fields outside the documented schema, including prompts, completions, and arbitrary metadata.</p></div></section>
  </>;
}
