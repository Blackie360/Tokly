import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard/types";
import { formatCompact, formatCurrency, formatDateTime } from "@/lib/format";
import { UsageChart } from "./usage-chart";
import styles from "./dashboard.module.css";

export function PageHeader({ eyebrow, title, description, updatedAt }: { eyebrow: string; title: string; description: string; updatedAt?: string }) {
  return (
    <header className={styles.pageHeader}>
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>
      <div>{description ? <p>{description}</p> : null}{updatedAt ? <div className={styles.timestamp}>Updated {formatDateTime(updatedAt)}</div> : null}</div>
    </header>
  );
}

export function DashboardOverview({ data, usageHref }: { data: DashboardData; usageHref: string }) {
  const latest = data.series.at(-1);
  const previous = data.series.at(-2);
  const velocity = latest?.cost ?? 0;
  const velocityDelta = previous?.cost ? ((velocity - previous.cost) / previous.cost) * 100 : 0;
  return (
    <>
      <PageHeader eyebrow="Operations snapshot / 01" title="Usage overview" description="A cost and token ledger across every instrumented AI workload." updatedAt={data.updatedAt} />

      <section className={styles.velocityRail} aria-label="Usage velocity">
        <div className={styles.velocityLead}><span className={styles.pulse} aria-hidden="true" /><div><span>Current cost velocity</span><strong>{formatCurrency(velocity)}/hr</strong></div></div>
        <div className={styles.velocityCell}><span>Velocity change</span><strong>{velocityDelta >= 0 ? "+" : ""}{velocityDelta.toFixed(1)}%</strong></div>
        <div className={styles.velocityCell}><span>Error rate</span><strong>{data.metrics.errorRate.toFixed(2)}%</strong></div>
        <div className={styles.velocityCell}><span>Cache benefit</span><strong>{formatCurrency(data.metrics.cacheSavings)}</strong></div>
        <div className={styles.velocityCell}><span>Budget load</span><strong>{data.metrics.budgetUsed.toFixed(1)}%</strong></div>
      </section>

      <section className={styles.metrics} aria-label="Key metrics">
        <article className={styles.metricCard}><span className={styles.metricLabel}>Month-to-date spend</span><strong className={styles.metricValue}>{formatCurrency(data.metrics.monthSpend)}</strong><span className={styles.metricDelta}>Provider-reported + calculated</span></article>
        <article className={styles.metricCard}><span className={styles.metricLabel}>Total tokens</span><strong className={styles.metricValue}>{formatCompact(data.metrics.tokens)}</strong><span className={styles.metricDelta}>Input + output</span></article>
        <article className={styles.metricCard}><span className={styles.metricLabel}>Model requests</span><strong className={styles.metricValue}>{formatCompact(data.metrics.requests)}</strong><span className={styles.metricDelta}>Successful and failed</span></article>
        <article className={styles.metricCard}><span className={styles.metricLabel}>Cache savings</span><strong className={styles.metricValue}>{formatCurrency(data.metrics.cacheSavings)}</strong><span className={styles.metricDelta}>Estimated vs uncached input</span></article>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Token throughput</h2><span>Input / output</span></div>
          <div className={styles.panelBody}><UsageChart data={data.series} /></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Cost by model</h2><span>Share</span></div>
          <div className={styles.panelBody}>
            {data.models.length ? <div className={styles.modelList}>{data.models.slice(0, 5).map((model) => <div className={styles.modelRow} key={`${model.provider}:${model.model}`}><div><div className={styles.modelName}>{model.model}</div><div className={styles.modelMeta}>{model.provider} · {formatCompact(model.tokens)} tokens</div></div><div className={styles.modelCost}>{formatCurrency(model.cost)}</div><div className={styles.shareTrack}><span style={{ width: `${Math.min(100, model.share)}%` }} /></div></div>)}</div> : <div className={styles.empty}><div><strong>No model traffic yet</strong><p>Send the first usage event to populate this panel.</p></div></div>}
          </div>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.section}`}>
        <div className={styles.panelHead}><h2>Recent usage events</h2><Link href={usageHref as never}>Open explorer →</Link></div>
        {data.recent.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>Project / feature</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead><tbody>{data.recent.slice(0, 6).map((event) => <tr key={event.id}><td className="mono">{formatDateTime(event.occurredAt)}</td><td><strong>{event.project}</strong><br/><span className="muted">{event.feature}</span></td><td className="mono">{event.model}<br/><span className="muted">{event.provider}</span></td><td className="mono">{formatCompact(event.tokens)}</td><td className="mono">{event.cost === null ? "Unpriced" : formatCurrency(event.cost, 4)}</td><td><span className={`${styles.status} ${event.status === "error" ? styles.error : ""}`}>{event.status}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}><div><strong>Waiting for the first event</strong><p>Use your project write key with the REST endpoint or TypeScript SDK.</p></div></div>}
      </section>
    </>
  );
}
