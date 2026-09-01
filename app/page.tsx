import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { IntegrationExamples } from "@/components/integration-examples";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./page.module.css";

const bars = [28, 42, 34, 60, 52, 78, 68, 91, 73, 64, 84, 72, 96, 88, 100, 82];

const setupSteps = [
  {
    number: "01",
    title: "Create an app key",
    description: "Create a Tokly workspace and app, then save the server-only write key shown once.",
  },
  {
    number: "02",
    title: "Install the SDK",
    description: "Add the lightweight TypeScript package to the application that calls your model provider.",
    code: "npm install tokly-sdk",
    codeKind: "terminal" as const,
  },
  {
    number: "03",
    title: "Capture real usage",
    description: "Send provider usage through a typed adapter and attach the feature and environment that caused it.",
    code: "tokly.capture(fromOpenAIResponse({ model, usage }));",
    codeKind: "typescript" as const,
  },
  {
    number: "04",
    title: "Operate with context",
    description: "Inspect exact tokens, attributed cost, latency, pricing coverage, and budget thresholds in Tokly.",
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
              <div className="eyebrow">AI telemetry SDK / 01</div>
              <h1>
                Every token. <em>Accounted for.</em>
              </h1>
              <p className={styles.heroLead}>
                Instrument your AI applications with exact token, cost, latency, and feature
                attribution—without proxying traffic or surrendering provider credentials.
              </p>
              <div className={styles.heroActions}>
                <Link className="button" href="/sign-in?mode=sign-up">
                  Get your SDK key →
                </Link>
                <Link className="button secondary" href="/demo">
                  Inspect live demo
                </Link>
              </div>
            </div>
            <div className={styles.heroMeta} aria-label="Product guarantees">
              <div><strong>0</strong><span>prompts stored</span></div>
              <div><strong>&lt;100ms</strong><span>ingestion target</span></div>
              <div><strong>6</strong><span>typed adapters</span></div>
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

      <section className={styles.getStarted} id="sdk-setup" aria-labelledby="get-started-heading">
        <div className={`page-frame ${styles.getStartedFrame}`}>
          <div className={styles.getStartedIntro}>
            <div>
              <div className="eyebrow">SDK setup / 02</div>
              <h2 id="get-started-heading">From model response to cost insight in minutes.</h2>
            </div>
            <div className={styles.getStartedCta}>
              <p>
                One server-side SDK captures provider-reported usage and the business context that
                a machine-level command cannot reliably infer.
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
                  {step.code ? (
                    <div className={styles.commandShell}>
                      <pre className={styles.command} aria-label={`${step.codeKind === "terminal" ? "Terminal command" : "TypeScript example"}: ${step.code}`}>
                        <code>
                          {step.codeKind === "terminal" ? <span aria-hidden="true">$</span> : null}{step.codeKind === "terminal" ? " " : null}{step.code}
                        </code>
                      </pre>
                      <div className={styles.commandCopy}>
                        <CopyButton
                          compact
                          label={step.codeKind === "terminal" ? "Copy install command" : "Copy TypeScript example"}
                          value={step.code}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.toolStrip} aria-label="Supported SDK adapters">
            <span>Adapters</span>
            <span>Vercel AI</span>
            <span>OpenAI</span>
            <span>Anthropic</span>
            <span>Gemini</span>
            <span>OpenRouter</span>
            <span>Ollama</span>
          </div>

          <section className={styles.examplesSection} aria-labelledby="provider-examples-heading">
            <div className={styles.examplesIntro}>
              <div>
                <span className="coordinate">Ready-to-use code</span>
                <h3 id="provider-examples-heading">Choose your provider example.</h3>
              </div>
              <p>Copy the complete server-side example, add your app key as an environment variable, and capture the usage returned by your provider.</p>
            </div>
            <IntegrationExamples />
          </section>

          <aside className={styles.connectorNote} aria-label="Optional developer machine connector">
            <div>
              <span className="coordinate">Optional companion</span>
              <strong>Want local developer-tool activity too?</strong>
              <p>The separate <span className="mono">tokly-cli</span> connector is being prepared for its first npm release. The SDK remains the source of exact application usage and cost.</p>
            </div>
            <span className={styles.releaseStatus}>npm release pending</span>
          </aside>
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
