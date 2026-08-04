import type { Metadata } from "next";
import { createBudgetAction } from "@/app/actions";
import { PageHeader } from "@/components/dashboard/overview";
import styles from "@/components/dashboard/dashboard.module.css";
import { getDashboardData } from "@/lib/dashboard/queries";
import { formatCurrency } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  const data = await getDashboardData(current.workspace.id, { days: 30 });
  const canManage = /(owner|admin)/.test(current.workspace.role);
  return <>
    <PageHeader eyebrow="Monthly controls / 03" title="Budgets & alerts" description="Notify operators at 50%, 80%, and 100% without blocking model traffic." />
    <div className={styles.budgetGrid}>
      {data.budgets.map((budget) => { const percent = budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 0; return <article className={styles.budgetCard} key={budget.id}><div className={styles.budgetCardHeader}><div><h2>{budget.name}</h2><p>{budget.scope} · {budget.alertEmail}</p></div><span className="panel-label">{percent.toFixed(0)}%</span></div><div className={styles.budgetValue}><strong>{formatCurrency(budget.spent)}</strong><span className="muted">/ {formatCurrency(budget.limit)}</span></div><div className={styles.budgetTrack}><span className={percent >= 80 ? styles.warning : ""} style={{ width: `${Math.min(percent, 100)}%` }} /></div><div className={styles.thresholds}><span>0</span><span>50 alert</span><span>80 alert</span><span>100</span></div></article>; })}
      {!data.budgets.length ? <div className={styles.empty}><div><strong>No budget guardrails</strong><p>Create the first monthly limit to begin receiving threshold alerts.</p></div></div> : null}
    </div>
    {canManage ? <section className={`${styles.panel} ${styles.section}`}><div className={styles.panelHead}><h2>Create monthly budget</h2><span>Owner / admin</span></div><div className={styles.panelBody}><form action={createBudgetAction} className="form-grid"><input type="hidden" name="orgSlug" value={orgSlug}/><div className="field"><label htmlFor="name">Budget name</label><input id="name" name="name" placeholder="Platform monthly" required/></div><div className="field"><label htmlFor="scope">Scope</label><select id="scope" name="scope"><option value="organization">Entire organization</option><option value="project">Specific project</option></select></div><div className="field"><label htmlFor="projectId">Project (for project scope)</label><select id="projectId" name="projectId"><option value="">Select project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div className="field"><label htmlFor="monthlyLimitUsd">Monthly limit (USD)</label><input id="monthlyLimitUsd" name="monthlyLimitUsd" type="number" min="1" step="0.01" placeholder="300.00" required/></div><div className="field"><label htmlFor="alertEmail">Alert recipient</label><input id="alertEmail" name="alertEmail" type="email" defaultValue={current.user.email} required/></div><button className="button" type="submit">Create budget →</button></form></div></section> : null}
  </>;
}
