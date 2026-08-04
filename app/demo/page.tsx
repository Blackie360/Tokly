import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DashboardOverview, PageHeader } from "@/components/dashboard/overview";
import dashboardStyles from "@/components/dashboard/dashboard.module.css";
import { demoDashboard } from "@/lib/dashboard/demo";
import { formatCurrency, formatDateTime, formatCompact } from "@/lib/format";

export const metadata: Metadata = { title: "Live demo" };

export default function DemoPage() {
  return (
    <AppShell workspaceName="Blackbird Labs" workspaceSlug="demo" userName="Demo operator" role="observer" demo>
      <DashboardOverview data={demoDashboard} usageHref="#usage" />

      <section id="usage" className={dashboardStyles.section} style={{ scrollMarginTop: 120 }}>
        <PageHeader eyebrow="Usage explorer / 02" title="Request ledger" description="A privacy-safe event trail with model, feature, token, cost, and status attribution." />
        <div className={dashboardStyles.panel}><div className={dashboardStyles.tableWrap}><table className={dashboardStyles.table}><thead><tr><th>Event</th><th>Time</th><th>Project</th><th>Model</th><th>Feature</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>{demoDashboard.recent.map((event) => <tr key={event.id}><td className="mono">{event.id}</td><td>{formatDateTime(event.occurredAt)}</td><td>{event.project}</td><td className="mono">{event.model}</td><td>{event.feature}</td><td className="mono">{formatCompact(event.tokens)}</td><td className="mono">{event.cost === null ? "Unpriced" : formatCurrency(event.cost, 4)}</td></tr>)}</tbody></table></div></div>
      </section>

      <section id="budgets" className={dashboardStyles.section} style={{ scrollMarginTop: 120 }}>
        <PageHeader eyebrow="Budget controls / 03" title="Monthly guardrails" description="Alert thresholds surface risk without blocking or rerouting customer traffic." />
        <div className={dashboardStyles.budgetGrid}>{demoDashboard.budgets.map((budget) => { const percent = (budget.spent / budget.limit) * 100; return <article className={dashboardStyles.budgetCard} key={budget.id}><div className={dashboardStyles.budgetCardHeader}><div><h2>{budget.name}</h2><p>{budget.scope} budget · alerts to {budget.alertEmail}</p></div><span className="panel-label">{percent.toFixed(0)}%</span></div><div className={dashboardStyles.budgetValue}><strong>{formatCurrency(budget.spent)}</strong><span className="muted">/ {formatCurrency(budget.limit)}</span></div><div className={dashboardStyles.budgetTrack}><span className={percent >= 80 ? dashboardStyles.warning : ""} style={{ width: `${Math.min(percent, 100)}%` }} /></div><div className={dashboardStyles.thresholds}><span>0</span><span>50 alert</span><span>80 alert</span><span>100</span></div></article>; })}</div>
      </section>

      <section id="projects" className={dashboardStyles.section} style={{ scrollMarginTop: 120 }}><PageHeader eyebrow="Projects / 04" title="Instrumented applications" description="Each application gets independent live or test keys that can be revoked without affecting provider credentials." /><div className={dashboardStyles.metrics}>{demoDashboard.projects.map((project, index) => <article className={dashboardStyles.metricCard} key={project.id}><span className={dashboardStyles.metricLabel}>Project {String(index + 1).padStart(2, "0")}</span><strong style={{ display: "block", marginTop: "1.4rem" }}>{project.name}</strong><span className="mono muted">{project.slug}</span></article>)}</div></section>
      <section id="members" className={dashboardStyles.section} style={{ scrollMarginTop: 120 }}><PageHeader eyebrow="Team / 05" title="Workspace operators" description="Owners and admins manage keys and budgets; members receive read-only operational visibility." /></section>
      <section id="settings" className={dashboardStyles.section} style={{ scrollMarginTop: 120 }}><PageHeader eyebrow="Policy / 06" title="Privacy by construction" description="This data plane rejects prompts, completions, files, and arbitrary metadata. What is not collected cannot leak." /></section>
    </AppShell>
  );
}
