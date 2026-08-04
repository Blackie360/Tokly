import type { Metadata } from "next";
import { BudgetForm } from "@/components/budget-form";
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
    <PageHeader eyebrow="Budgets" title="Budgets & alerts" description="Set a monthly spending target and receive email alerts before costs get out of hand." />
    <div className={styles.budgetGrid}>
      {data.budgets.map((budget) => { const percent = budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 0; return <article className={styles.budgetCard} key={budget.id}><div className={styles.budgetCardHeader}><div><h2>{budget.name}</h2><p>{budget.scope === "project" ? "app" : "workspace"} · {budget.alertEmail}</p></div><span className="panel-label">{percent.toFixed(0)}%</span></div><div className={styles.budgetValue}><strong>{formatCurrency(budget.spent)}</strong><span className="muted">/ {formatCurrency(budget.limit)}</span></div><div className={styles.budgetTrack}><span className={percent >= 80 ? styles.warning : ""} style={{ width: `${Math.min(percent, 100)}%` }} /></div><div className={styles.thresholds}><span>0</span><span>50 alert</span><span>80 alert</span><span>100</span></div></article>; })}
      {!data.budgets.length ? <div className={`${styles.empty} ${styles.compactEmpty}`}><div><strong>No budget yet</strong><p>Create a monthly target below. Tokly will alert you without interrupting your app.</p></div></div> : null}
    </div>
    {canManage ? <section className={`${styles.panel} ${styles.section}`}><div className={styles.panelHead}><h2>Create a monthly budget</h2><span>Optional</span></div><div className={styles.panelBody}><BudgetForm orgSlug={orgSlug} projects={data.projects} defaultEmail={current.user.email} /></div></section> : null}
  </>;
}
