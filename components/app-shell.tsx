import Link from "next/link";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";
import styles from "./app-shell.module.css";

const navItems = [
  ["overview", "Overview", "01"],
  ["projects", "Apps", "02"],
  ["usage", "Usage", "03"],
  ["activity", "AI activity", "04"],
  ["budgets", "Budgets", "05"],
  ["members", "Members", "06"],
  ["settings", "Settings", "07"],
];

const demoNavItems = [
  ["overview", "Overview", "01"],
  ["usage", "Usage", "02"],
  ["budgets", "Budgets", "03"],
];

export function AppShell({
  children,
  workspaceName,
  workspaceSlug,
  userName,
  role,
  demo = false,
}: {
  children: React.ReactNode;
  workspaceName: string;
  workspaceSlug: string;
  userName: string;
  role: string;
  demo?: boolean;
}) {
  const basePath = demo ? "/demo" : `/workspace/${workspaceSlug}`;
  const items = demo ? demoNavItems : navItems;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandRow}><Logo /><span className={styles.version}>App v0.1</span><div className={styles.mobileControls}><ThemeToggle />{demo ? <Link className="button" href="/sign-in?mode=sign-up">Create workspace</Link> : null}</div></div>
        <div className={styles.workspace}>
          <span className="panel-label">Active workspace</span>
          <strong>{workspaceName}</strong>
          <span>{demo ? "Read-only demo" : role}</span>
        </div>
        <nav className={styles.nav} aria-label="Workspace navigation">
          {items.map(([path, label, index]) => (
            <NavLink key={path} href={demo ? (path === "overview" ? "/demo" : `/demo#${path}`) : `${basePath}/${path}`} label={label} index={index} />
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <ThemeToggle />
          <div className={styles.operator}><span>{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><small>{demo ? "Demo" : role}</small></div></div>
          {demo ? <Link className="button" href="/sign-in?mode=sign-up">Create workspace →</Link> : null}
        </div>
      </aside>
      <div className={styles.mainColumn}>
        <div className={styles.statusRail} aria-label="Telemetry policy">
          <span><i /> Privacy-safe usage data</span><span>Prompts excluded</span><span>Provider keys never collected</span><span>UTC+03</span>
        </div>
        <main id="main-content" className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
