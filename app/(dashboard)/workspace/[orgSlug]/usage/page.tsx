import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/overview";
import { CostChart, UsageChart } from "@/components/dashboard/usage-chart";
import styles from "@/components/dashboard/dashboard.module.css";
import { getDashboardData } from "@/lib/dashboard/queries";
import { formatCompact, formatCurrency, formatDateTime } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Usage explorer" };

type Search = { days?: string; project?: string; provider?: string; environment?: string; model?: string; feature?: string; status?: string; sort?: string };

export default async function UsagePage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Search> }) {
  const [{ orgSlug }, search] = await Promise.all([params, searchParams]);
  const current = await requireWorkspace(orgSlug);
  const provider = ["openai", "anthropic", "google", "vercel", "other"].includes(search.provider ?? "") ? search.provider as "openai" | "anthropic" | "google" | "vercel" | "other" : undefined;
  const status = ["success", "error"].includes(search.status ?? "") ? search.status as "success" | "error" : undefined;
  const days = [7, 30, 90].includes(Number(search.days)) ? Number(search.days) : 30;
  const data = await getDashboardData(current.workspace.id, {
    days,
    projectId: search.project || undefined,
    provider,
    environment: search.environment || undefined,
    model: search.model || undefined,
    feature: search.feature || undefined,
    status,
  });
  const recent = data.recent.toSorted((a, b) => {
    if (search.sort === "cost") return (b.cost ?? -1) - (a.cost ?? -1);
    if (search.sort === "tokens") return b.tokens - a.tokens;
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });

  return <>
    <PageHeader eyebrow="Request ledger / 02" title="Usage explorer" description="Filter and attribute model activity without exposing prompts or completions." updatedAt={data.updatedAt} />
    <form className={styles.filters}>
      <div className={styles.filterField}><label htmlFor="days">Range</label><select id="days" name="days" defaultValue={String(days)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>
      <div className={styles.filterField}><label htmlFor="project">Project</label><select id="project" name="project" defaultValue={search.project ?? ""}><option value="">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
      <div className={styles.filterField}><label htmlFor="provider">Provider</label><select id="provider" name="provider" defaultValue={search.provider ?? ""}><option value="">All providers</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option><option value="vercel">Vercel</option><option value="other">Other</option></select></div>
      <div className={styles.filterField}><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={search.status ?? ""}><option value="">All statuses</option><option value="success">Success</option><option value="error">Error</option></select></div>
      <div className={styles.filterField}><label htmlFor="environment">Environment</label><input id="environment" name="environment" defaultValue={search.environment ?? ""} placeholder="live" /></div>
      <div className={styles.filterField}><label htmlFor="model">Model</label><input id="model" name="model" defaultValue={search.model ?? ""} placeholder="gpt-5.5" /></div>
      <div className={styles.filterField}><label htmlFor="feature">Feature</label><input id="feature" name="feature" defaultValue={search.feature ?? ""} placeholder="answer-ticket" /></div>
      <div className={styles.filterField}><label htmlFor="sort">Sort</label><select id="sort" name="sort" defaultValue={search.sort ?? "time"}><option value="time">Newest</option><option value="cost">Highest cost</option><option value="tokens">Most tokens</option></select></div>
      <button className="button" type="submit">Apply filters</button>
    </form>
    <div className={styles.grid}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Token volume</h2><span>Stacked input / output</span></div><div className={styles.panelBody}><UsageChart data={data.series} /></div></section>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Cost velocity</h2><span>USD by hour</span></div><div className={styles.panelBody}><CostChart data={data.series} /></div></section>
    </div>
    <section className={styles.panel}>
      <div className={styles.panelHead}><h2>{recent.length} usage events</h2><span>Max 100 rows</span></div>
      {recent.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Event</th><th>Time</th><th>Project / feature</th><th>Provider / model</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead><tbody>{recent.map((event) => <tr key={event.id}><td className="mono">{event.id}</td><td>{formatDateTime(event.occurredAt)}</td><td><strong>{event.project}</strong><br/><span className="muted">{event.feature}</span></td><td className="mono">{event.provider}<br/><span className="muted">{event.model}</span></td><td className="mono">{formatCompact(event.tokens)}</td><td className="mono">{event.cost === null ? "Unpriced" : formatCurrency(event.cost, 5)}</td><td><span className={`${styles.status} ${event.status === "error" ? styles.error : ""}`}>{event.status}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}><div><strong>No matching events</strong><p>Clear one or more filters, or send a new event from an instrumented project.</p></div></div>}
    </section>
  </>;
}
