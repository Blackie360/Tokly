import Link from "next/link";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";
import styles from "./app-shell.module.css";

const navItems = [
  ["overview", "Overview", "01"],
  ["usage", "Usage explorer", "02"],
  ["budgets", "Budgets", "03"],
  ["projects", "Projects & keys", "04"],
  ["members", "Members", "05"],
  ["settings", "Settings", "06"],
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
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandRow}><Logo /><span className={styles.version}>v0.1</span><div className={styles.mobileControls}><ThemeToggle />{demo ? <Link className="button" href="/sign-in">Create workspace</Link> : null}</div></div>
        <div className={styles.workspace}>
          <span className="panel-label">Active workspace</span>
          <strong>{workspaceName}</strong>
          <span>{demo ? "Read-only demo" : role}</span>
        </div>
        <nav className={styles.nav} aria-label="Workspace navigation">
          {navItems.map(([path, label, index]) => (
            <NavLink key={path} href={demo ? (path === "overview" ? "/demo" : `/demo#${path}`) : `${basePath}/${path}`} label={label} index={index} />
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <ThemeToggle />
          <div className={styles.operator}><span>{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><small>{demo ? "Observer" : "Operator"}</small></div></div>
          {demo ? <Link className="button" href="/sign-in">Create workspace →</Link> : null}
        </div>
      </aside>
      <div className={styles.mainColumn}>
        <div className={styles.statusRail} aria-label="System status">
          <span><i /> Ingestion nominal</span><span>ORD-36.8219</span><span>NAI-1.2921</span><span>UTC+03</span>
        </div>
        <main id="main-content" className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
