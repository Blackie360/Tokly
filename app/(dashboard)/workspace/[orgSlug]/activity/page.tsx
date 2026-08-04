import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/overview";
import styles from "@/components/dashboard/dashboard.module.css";
import { getAgentActivity } from "@/lib/dashboard/queries";
import { formatDateTime, formatDuration } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Developer AI activity" };

export default async function ActivityPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  const activity = await getAgentActivity(current.workspace.id);
  return <>
    <PageHeader eyebrow="Machine monitoring" title="Developer AI activity" description="Lifecycle events from Cursor, Codex, and Ollama. Activity-only records never affect tokens, spend, budgets, or pricing coverage." />
    <section className={styles.panel}>
      <div className={styles.panelHead}><h2>{activity.length} activity events</h2><span>Activity only · latest 100</span></div>
      {activity.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>App</th><th>Tool</th><th>Event</th><th>Model</th><th>Duration</th><th>Status</th></tr></thead><tbody>{activity.map((event) => <tr key={event.id}><td>{formatDateTime(event.occurredAt)}</td><td>{event.project}</td><td className="mono">{event.tool}</td><td>{event.eventType}</td><td className="mono">{event.model ?? "—"}</td><td className="mono">{formatDuration(event.durationMs)}</td><td><span className={`${styles.status} ${event.status === "error" ? styles.error : ""}`}>{event.status ?? "activity only"}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}><div><strong>No activity-only events yet</strong><p>Connect Cursor, Codex, or Ollama from an app. Exact Claude and Gemini usage remains in Usage.</p></div></div>}
    </section>
  </>;
}
