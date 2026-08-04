import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./page.module.css";

const bars = [28, 42, 34, 60, 52, 78, 68, 91, 73, 64, 84, 72, 96, 88, 100, 82];

const setupSteps = [
  {
    number: "01",
    title: "Create your workspace",
    description: "Sign up for Tokly and create the workspace where your machine activity will appear.",
  },
  {
    number: "02",
    title: "Install the Tokly CLI",
    description: "Add the machine connector globally so the tokly command is available in your terminal.",
    command: "npm install -g tokly-sdk",
  },
  {
    number: "03",
    title: "Connect from your terminal",
    description: "Run the setup wizard. Tokly opens a secure browser sign-in and syncs your session back—no project key to copy.",
    command: "tokly init",
  },
  {
    number: "04",
    title: "Choose what to monitor",
    description: "Select the AI tools detected on your machine, preview the changes, and start monitoring.",
  },
];

export default function HomePage() {
  return (
    <main id="main-content">
      <div className="page-frame">
        <header className={styles.siteHeader}>
          <Logo />
          <div className={styles.headerActions}>
            <ThemeToggle />
            <Link className="button" href="/sign-in?mode=sign-up">
              Get started →
            </Link>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div>
              <div className="eyebrow">AI spend operations / 01</div>
              <h1>
                Every token. <em>Accounted for.</em>
              </h1>
              <p className={styles.heroLead}>
                See which models, features, and environments are consuming your AI budget—without
                proxying traffic or surrendering provider credentials.
              </p>
              <div className={styles.heroActions}>
                <Link className="button" href="/sign-in?mode=sign-up">
                  Create free workspace →
                </Link>
                <Link className="button secondary" href="/demo">
                  Inspect live demo
                </Link>
              </div>
            </div>
            <div className={styles.heroMeta} aria-label="Product guarantees">
              <div><strong>0</strong><span>prompts stored</span></div>
              <div><strong>&lt;100ms</strong><span>ingestion target</span></div>
              <div><strong>5</strong><span>provider types</span></div>
            </div>
          </div>

          <aside className={styles.console} aria-label="Token velocity preview">
            <div className={styles.consoleHead}>
              <span>Usage velocity / 24h</span>
              <span className={styles.live}>● Live</span>
            </div>
            <div className={styles.velocity}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Current spend</div>
                <div className={styles.metricValue}>$184.62</div>
              </div>
              <div className={styles.bars} aria-hidden="true">
                {bars.map((height, index) => (
                  <span key={`${height}-${index}`} style={{ height: `${height}%`, animationDelay: `${index * 35}ms` }} />
                ))}
              </div>
              <p className="mono muted">↑ 12.4% vs previous period · cache saved $31.08</p>
            </div>
            <div className={styles.consoleFoot}>
              <span>ORD-36.8219</span><span>NAI-1.2921</span><span>UTC+03</span>
            </div>
          </aside>
        </section>
      </div>

      <section className={styles.getStarted} aria-labelledby="get-started-heading">
        <div className={`page-frame ${styles.getStartedFrame}`}>
          <div className={styles.getStartedIntro}>
            <div>
              <div className="eyebrow">Machine setup / 02</div>
              <h2 id="get-started-heading">From account to live monitoring in minutes.</h2>
            </div>
            <div className={styles.getStartedCta}>
              <p>
                The guided setup detects supported AI tools and shows every configuration change
                before it is applied.
              </p>
              <Link className="button" href="/sign-in?mode=sign-up">
                Create your account →
              </Link>
            </div>
          </div>

          <ol className={styles.setupSteps}>
            {setupSteps.map((step) => (
              <li className={styles.setupStep} key={step.number}>
                <div className={styles.stepNumber}>{step.number}</div>
                <div className={styles.stepContent}>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  {step.command ? (
                    <pre className={styles.command} aria-label={`Terminal command: ${step.command}`}>
                      <code>
                        <span aria-hidden="true">$</span> {step.command}
                      </code>
                    </pre>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.toolStrip} aria-label="Supported developer AI tools">
            <span>Detects</span>
            <span>Cursor</span>
            <span>Codex</span>
            <span>Claude Code</span>
            <span>Gemini CLI</span>
            <span>Ollama</span>
          </div>
        </div>
      </section>

      <section className={styles.principles} aria-label="Platform principles">
        <article className={styles.principle}><span className={styles.principleIndex}>01 / Attribute</span><h2>Know what caused the spend.</h2><p>Break usage down by app, model, feature, environment, user, trace, and session.</p></article>
        <article className={styles.principle}><span className={styles.principleIndex}>02 / Reconcile</span><h2>Price history, not guesswork.</h2><p>Effective-dated model rates preserve the cost calculation that applied when each call ran.</p></article>
        <article className={styles.principle}><span className={styles.principleIndex}>03 / Respond</span><h2>Budgets that speak up early.</h2><p>Threshold alerts reach your team before a monthly AI bill becomes an incident.</p></article>
      </section>
    </main>
  );
}
