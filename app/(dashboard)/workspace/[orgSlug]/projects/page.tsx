import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { createProjectAction, createProjectKeyAction, deleteProjectAction, revokeMachineConnectionAction, revokeProjectKeyAction, verifyKeySetupAction } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/dashboard/overview";
import { IntegrationExamples } from "@/components/integration-examples";
import { OneTimeKeyReveal } from "@/components/one-time-key-reveal";
import { SubmitButton } from "@/components/submit-button";
import styles from "@/components/dashboard/dashboard.module.css";
import { getDb } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { machineConnections, projectApiKeys, projects } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";
import projectStyles from "./projects.module.css";

export const metadata: Metadata = { title: "Apps" };

type ProjectKey = typeof projectApiKeys.$inferSelect;

function decodeKey(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      rawKey: string;
      prefix: string;
      projectName: string;
      projectId?: string;
    };
  } catch {
    return null;
  }
}

function KeyRow({ item, orgSlug, canManage }: { item: ProjectKey; orgSlug: string; canManage: boolean }) {
  const revoked = Boolean(item.revokedAt);

  return (
    <li className={`${projectStyles.keyRow} ${revoked ? projectStyles.revokedKey : ""}`}>
      <div className={projectStyles.keyIdentity}>
        <strong>{item.name}</strong>
        <code>{item.keyPrefix}••••</code>
      </div>
      <span className={projectStyles.environment}>{item.environment === "live" ? "Live" : "Test"}</span>
      <div className={projectStyles.keyUsage}>
        <span>Last used</span>
        <strong>{item.lastUsedAt ? formatDateTime(item.lastUsedAt.toISOString()) : "Not used yet"}</strong>
      </div>
      <span className={`${styles.status} ${revoked ? styles.error : ""}`}>{revoked ? "Revoked" : "Active"}</span>
      {canManage && !revoked ? (
        <form className={projectStyles.revokeForm} action={revokeProjectKeyAction}>
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="keyId" value={item.id} />
          <ConfirmSubmitButton label="Revoke" ariaLabel={`Revoke ${item.name}`} confirmation={`Revoke ${item.name}? Apps using this key will stop sending data.`} />
        </form>
      ) : null}
    </li>
  );
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ created?: string; status?: string }>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const current = await requireWorkspace(orgSlug);
  const projectRows = await withTenant(current.workspace.id, (tx) =>
    tx.select().from(projects).where(eq(projects.organizationId, current.workspace.id)).orderBy(projects.name),
  );
  const keyRows = await getDb()
    .select()
    .from(projectApiKeys)
    .where(eq(projectApiKeys.organizationId, current.workspace.id))
    .orderBy(desc(projectApiKeys.createdAt));
  const machineRows = await getDb().select().from(machineConnections).where(eq(machineConnections.organizationId, current.workspace.id)).orderBy(desc(machineConnections.createdAt));
  const oneTimeKey = query.created ? decodeKey((await cookies()).get("tokly_new_key")?.value) : null;
  const oneTimeKeyUsed = oneTimeKey
    ? keyRows.some((key) => key.projectId === oneTimeKey.projectId && key.keyPrefix === oneTimeKey.prefix && key.lastUsedAt)
    : false;
  const hasUsedKey = keyRows.some((key) => key.lastUsedAt !== null);
  const canManage = /(owner|admin)/.test(current.workspace.role);
  const keysByProject = new Map<string, ProjectKey[]>();
  const machinesByProject = new Map<string, typeof machineRows>();

  for (const key of keyRows) {
    const projectKeys = keysByProject.get(key.projectId) ?? [];
    projectKeys.push(key);
    keysByProject.set(key.projectId, projectKeys);
  }
  for (const machine of machineRows) { const items = machinesByProject.get(machine.projectId) ?? []; items.push(machine); machinesByProject.set(machine.projectId, items); }

  const curl = `curl -X POST ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1/events \\
  -H "Authorization: Bearer ${oneTimeKey?.rawKey ?? "YOUR_APP_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"events":[{"id":"evt_001","timestamp":"${new Date().toISOString()}","provider":"openai","model":"gpt-5.5","operation":"generation","usage":{"inputTokens":1200,"outputTokens":240},"dimensions":{"environment":"production","feature":"assistant"}}]}'`;
  const sdkInstall = "npm install tokly-sdk";

  return (
    <>
      <PageHeader
        eyebrow={oneTimeKey ? "Setup · final step" : "Apps"}
        title={oneTimeKey ? `Connect ${oneTimeKey.projectName}` : "Apps"}
        description={oneTimeKey ? "Save the key, install the SDK, and instrument your first AI response." : "Create apps and manage their server-side SDK keys."}
      />

      {oneTimeKey ? (
        <section className={projectStyles.setupFlow} aria-labelledby="setup-heading">
          <h2 className="sr-only" id="setup-heading">Connect your app</h2>
          <OneTimeKeyReveal value={oneTimeKey} />
          <article className={projectStyles.setupStep}>
            <span className={projectStyles.stepNumber}>2</span>
            <div>
              <h3>Install the TypeScript SDK</h3>
              <p>Add Tokly to the server application that receives usage from your AI provider.</p>
              <pre className={styles.codeBlock}><code>{sdkInstall}</code></pre>
              <CopyButton value={sdkInstall} label="Copy install command" />
            </div>
          </article>
          <article className={projectStyles.setupStep}>
            <span className={projectStyles.stepNumber}>3</span>
            <div>
              <h3>Choose your provider</h3>
              <p>Keep the key in <span className="mono">TOKLY_API_KEY</span> on your server, then capture usage where the provider response is available.</p>
              <IntegrationExamples />
            </div>
          </article>
          <article className={projectStyles.setupStep}>
            <span className={projectStyles.stepNumber}>4</span>
            <div>
              <h3>See your first event</h3>
              <p>{oneTimeKeyUsed ? "Event received. Your dashboard is ready." : "Run one instrumented AI request, then check the connection."}</p>
              {query.status === "waiting" && !oneTimeKeyUsed ? <p className={projectStyles.setupStatus} role="status">No SDK event yet. Run one instrumented request, then check again.</p> : null}
              <form action={verifyKeySetupAction}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <div className={projectStyles.setupActions}>
                  <SubmitButton pendingLabel="Checking connection…">{oneTimeKeyUsed ? "Open dashboard →" : "Check connection →"}</SubmitButton>
                  <Link className={projectStyles.skipLink} href={`/workspace/${orgSlug}/overview`}>Skip for now</Link>
                </div>
              </form>
            </div>
          </article>
        </section>
      ) : null}

      <section className={styles.panel} hidden={Boolean(oneTimeKey)}>
        <details className={projectStyles.disclosure} open={projectRows.length === 0}>
          <summary>
            <span className={projectStyles.summaryCopy}>
              <strong>New app</strong>
              <small>Create an app and its first write key</small>
            </span>
            <span className={projectStyles.summaryIcon} aria-hidden="true">+</span>
          </summary>
          <div className={projectStyles.disclosureBody}>
            {canManage ? (
              <form action={createProjectAction} className={projectStyles.createForm}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <div className="field">
                  <label htmlFor="project-name">App name</label>
                  <input id="project-name" name="name" placeholder="Support copilot…" autoComplete="off" required />
                </div>
                <div className="field">
                  <label htmlFor="key-env">Key type</label>
                  <select id="key-env" name="environment" defaultValue="live">
                    <option value="live">Live</option>
                    <option value="test">Test</option>
                  </select>
                </div>
                <SubmitButton pendingLabel="Creating app…">Create app →</SubmitButton>
              </form>
            ) : (
              <p className="muted">Ask a workspace owner or admin to create an app.</p>
            )}
          </div>
        </details>
      </section>

      <section className={`${styles.panel} ${styles.section}`} aria-labelledby="projects-heading" hidden={Boolean(oneTimeKey)}>
        <div className={styles.panelHead}>
          <h2 id="projects-heading">Your apps</h2>
          <span>{projectRows.length} {projectRows.length === 1 ? "app" : "apps"}</span>
        </div>
        {projectRows.length === 0 ? (
          <div className={styles.empty}>
            <strong>Create your first app</strong>
            <p>Tokly creates the first write key automatically. The full key is shown once, so copy and save it before leaving the page.</p>
          </div>
        ) : (
          <div className={projectStyles.projectList}>
            {projectRows.map((project) => {
              const projectKeys = keysByProject.get(project.id) ?? [];
              const activeKeys = projectKeys.filter((key) => !key.revokedAt);
              const revokedKeys = projectKeys.filter((key) => key.revokedAt);
              const projectMachines = machinesByProject.get(project.id) ?? [];

              return (
                <article className={projectStyles.projectCard} key={project.id}>
                  <header className={projectStyles.projectHeader}>
                    <div>
                      <span>App</span>
                      <h3>{project.name}</h3>
                    </div>
                    <div className={projectStyles.projectHeaderActions}>
                      <span className={projectStyles.keyCount}>
                        {activeKeys.length} active {activeKeys.length === 1 ? "key" : "keys"}
                      </span>
                      {canManage ? (
                        <form action={deleteProjectAction}>
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <ConfirmSubmitButton
                            label="Delete app"
                            ariaLabel={`Delete ${project.name} app`}
                            confirmation={`Delete ${project.name}? This permanently removes its keys, usage history, and app budgets. This cannot be undone.`}
                          />
                        </form>
                      ) : null}
                    </div>
                  </header>

                  {activeKeys.length > 0 ? (
                    <ul className={projectStyles.keyList} aria-label={`${project.name} active keys`}>
                      {activeKeys.map((key) => <KeyRow key={key.id} item={key} orgSlug={orgSlug} canManage={canManage} />)}
                    </ul>
                  ) : (
                    <p className={projectStyles.noKeys}>This app has no active keys.</p>
                  )}

                  {revokedKeys.length > 0 ? (
                    <details className={projectStyles.revokedKeys}>
                      <summary>Show {revokedKeys.length} revoked {revokedKeys.length === 1 ? "key" : "keys"}</summary>
                      <ul className={projectStyles.keyList} aria-label={`${project.name} revoked keys`}>
                        {revokedKeys.map((key) => <KeyRow key={key.id} item={key} orgSlug={orgSlug} canManage={canManage} />)}
                      </ul>
                    </details>
                  ) : null}

                  {canManage ? (
                    <details className={projectStyles.addKey}>
                      <summary>Add another key</summary>
                      <div className={projectStyles.addKeyBody}>
                        <p>Use a separate key for each device or environment. This lets you revoke one key without interrupting the others.</p>
                        <form action={createProjectKeyAction} className={projectStyles.keyForm}>
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <div className="field">
                            <label htmlFor={`key-name-${project.id}`}>Key name</label>
                            <input id={`key-name-${project.id}`} name="name" placeholder="Vercel production…" autoComplete="off" minLength={2} maxLength={80} required />
                          </div>
                          <div className="field">
                            <label htmlFor={`key-env-${project.id}`}>Key type</label>
                            <select id={`key-env-${project.id}`} name="environment" defaultValue="live">
                              <option value="live">Live</option>
                              <option value="test">Test</option>
                            </select>
                          </div>
                          <SubmitButton className="button secondary" pendingLabel="Creating key…">Create key →</SubmitButton>
                        </form>
                      </div>
                    </details>
                  ) : null}

                  <div className={projectStyles.addKeyBody}>
                    <h4>Developer machines</h4>
                    {projectMachines.length ? <ul className={projectStyles.keyList}>{projectMachines.map((machine) => <li className={projectStyles.keyRow} key={machine.id}>
                      <div className={projectStyles.keyIdentity}><strong>{machine.name}</strong><code>{machine.credentialPrefix}••••</code></div>
                      <span className={projectStyles.environment}>{machine.platform}</span>
                      <div className={projectStyles.keyUsage}><span>{(machine.selectedTools as string[]).join(", ") || "No tools"}</span><strong>{machine.lastSeenAt ? `Seen ${formatDateTime(machine.lastSeenAt.toISOString())}` : "No heartbeat"}</strong></div>
                      <span className={`${styles.status} ${machine.revokedAt ? styles.error : ""}`}>{machine.revokedAt ? "Revoked" : "Connected"}</span>
                      {canManage && !machine.revokedAt ? <form action={revokeMachineConnectionAction}><input type="hidden" name="orgSlug" value={orgSlug}/><input type="hidden" name="connectionId" value={machine.id}/><ConfirmSubmitButton label="Revoke" ariaLabel={`Revoke ${machine.name}`} confirmation={`Revoke ${machine.name}? Its collector will no longer be able to send activity.`}/></form> : null}
                    </li>)}</ul> : <p className="muted">No developer machine connected.</p>}
                    {canManage ? <div>
                      <p>Optional: the separate machine CLI is being prepared for its first npm release. Use the server SDK for exact application telemetry today.</p>
                      <p className="muted mono">tokly-cli · npm release pending</p>
                    </div> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!oneTimeKey ? (
        <>
          <details className={`${styles.panel} ${styles.section} ${projectStyles.guide}`} open={!hasUsedKey}>
            <summary>
              <span className={projectStyles.summaryCopy}>
                <strong>SDK integration examples</strong>
                <small>Copy setup code for your AI provider</small>
              </span>
              <span className={projectStyles.summaryIcon} aria-hidden="true">+</span>
            </summary>
            <div className={projectStyles.disclosureBody}>
              <p>Install the server-only package, then choose the provider whose response you want to meter.</p>
              <pre className={styles.codeBlock}><code>{sdkInstall}</code></pre>
              <div className={projectStyles.installCopy}><CopyButton value={sdkInstall} label="Copy install command" /></div>
              <IntegrationExamples />
            </div>
          </details>
          <details className={`${styles.panel} ${styles.section} ${projectStyles.guide}`} open={!hasUsedKey}>
            <summary>
              <span className={projectStyles.summaryCopy}>
                <strong>Send a test event</strong>
                <small>View a ready-to-run cURL example</small>
              </span>
              <span className={projectStyles.summaryIcon} aria-hidden="true">+</span>
            </summary>
            <div className={projectStyles.disclosureBody}>
              {!hasUsedKey ? <p><strong>Still setting up?</strong> If you did not save the original key, create another one under your app before running this command.</p> : null}
              <pre className={styles.codeBlock}><code>{curl}</code></pre>
              <p className="muted">Replace <span className="mono">YOUR_APP_KEY</span> with a live or test key before running the command.</p>
            </div>
          </details>
        </>
      ) : null}
    </>
  );
}
