import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard/types";
import { formatCompact, formatCurrency, formatDateTime, formatDuration } from "@/lib/format";
import { UsageChart } from "./usage-chart";
import styles from "./dashboard.module.css";

export function PageHeader({ eyebrow, title, description, updatedAt, level = 1 }: { eyebrow: string; title: string; description: string; updatedAt?: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={styles.pageHeader}>
      <div><div className="eyebrow">{eyebrow}</div><Heading>{title}</Heading></div>
      <div>{description ? <p>{description}</p> : null}{updatedAt ? <div className={styles.timestamp}>Updated {formatDateTime(updatedAt)}</div> : null}</div>
    </header>
  );
}

export function FirstUseCard({
  title,
  description,
  href,
  action,
  steps,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
  steps: Array<{ title: string; description: string }>;
}) {
  return (
    <section className={styles.firstUse} aria-labelledby="first-use-heading">
      <div className={styles.firstUseIntro}>
        <div className="eyebrow">Start here</div>
        <h2 id="first-use-heading">{title}</h2>
        <p>{description}</p>
        <Link className="button" href={href as never}>{action} →</Link>
      </div>
      <ol className={styles.firstUseSteps}>
        {steps.map((step, index) => (
          <li key={step.title}>
            <span>{index + 1}</span>
            <div><strong>{step.title}</strong><p>{step.description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DashboardOverview({
  data,
  usageHref,
  projectsHref,
  hasUsage = data.metrics.requests > 0,
}: {
  data: DashboardData;
  usageHref: string;
  projectsHref?: string;
  hasUsage?: boolean;
}) {
  const latest = data.series.at(-1);
  const previous = data.series.at(-2);
  const velocity = latest?.cost ?? 0;
  const velocityDelta = previous?.cost ? ((velocity - previous.cost) / previous.cost) * 100 : 0;

  if (!hasUsage && projectsHref) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Usage overview" description="See AI requests, tokens, and cost after you connect your first app." />
        <FirstUseCard
          title="Send your first usage event"
          description="Your workspace is ready. Connect the app you just created, then this page will fill with real usage data."
          href={projectsHref}
          action="Continue setup"
          steps={[
            { title: "Copy the app key", description: "Use the write key created during setup." },
            { title: "Send one test event", description: "Run the ready-to-copy command on the Apps page." },
            { title: "Come back here", description: "Your first request and cost will appear in the overview." },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Operations snapshot / 01" title="Usage overview" description="A cost and token ledger across every instrumented AI workload." updatedAt={data.updatedAt} />

      <section className={styles.velocityRail} aria-label="Usage velocity">
        <div className={styles.velocityLead}><span className={styles.pulse} aria-hidden="true" /><div><span>Current cost velocity</span><strong>{formatCurrency(velocity)}/hr</strong></div></div>
        <div className={styles.velocityCell}><span>Velocity change</span><strong>{velocityDelta >= 0 ? "+" : ""}{velocityDelta.toFixed(1)}%</strong></div>
        <div className={styles.velocityCell}><span>Error rate</span><strong>{data.metrics.errorRate.toFixed(2)}%</strong></div>
        <div className={styles.velocityCell}><span>Avg sampled latency</span><strong>{formatDuration(data.metrics.averageLatencyMs)}</strong></div>
        <div className={styles.velocityCell}><span>Pricing coverage</span><strong>{data.metrics.pricedCoverage.toFixed(1)}%</strong></div>
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
        {data.recent.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>App / feature</th><th>Model</th><th>Tokens</th><th>Latency</th><th>Cost / source</th><th>Status</th></tr></thead><tbody>{data.recent.slice(0, 6).map((event) => <tr key={event.id}><td className="mono">{formatDateTime(event.occurredAt)}</td><td><strong>{event.project}</strong><br/><span className="muted">{event.feature}</span></td><td className="mono">{event.model}<br/><span className="muted">{event.provider}</span></td><td className="mono">{formatCompact(event.tokens)}</td><td className="mono">{formatDuration(event.latencyMs)}</td><td className="mono">{event.cost === null ? "Unpriced" : formatCurrency(event.cost, 4)}<br/><span className="muted">{event.costSource}</span></td><td><span className={`${styles.status} ${event.status === "error" ? styles.error : ""}`}>{event.status}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}><div><strong>Waiting for the first event</strong><p>Use your app write key with the REST endpoint or TypeScript SDK.</p></div></div>}
      </section>

      <section className={`${styles.panel} ${styles.section}`} aria-labelledby="budget-alert-feed">
        <div className={styles.panelHead}><h2 id="budget-alert-feed">Budget alert history</h2><span>Latest 12 thresholds</span></div>
        {data.notifications.length ? <ol className={styles.alertList}>{data.notifications.map((notification) => <li className={styles.alertRow} key={notification.id}><span className={styles.alertMarker} aria-hidden="true"/><div><strong>{notification.title}</strong><p>{notification.body}</p></div><time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time></li>)}</ol> : <div className={styles.compactEmpty}><strong>No budget thresholds crossed</strong><p>Alerts will appear here at 50%, 80%, and 100% of an active monthly budget.</p></div>}
      </section>
    </>
  );
}
