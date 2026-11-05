import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  ExternalLink,
  FileCode2,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  LayoutDashboard,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { call, native, resetPreview, sample } from "./api";
import {
  empty,
  inPeriod,
  relative,
  weekDays,
  type Project,
  type Snapshot,
} from "./model";
type Page = "Overview" | "Projects" | "Weekly progress" | "Settings";
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Projects", icon: FolderGit2 },
  { name: "Weekly progress", icon: TrendingUp },
  { name: "Settings", icon: Settings },
] as const;
const colors = ["lilac", "peach", "mint", "blue"];
export default function App() {
  const [data, setData] = useState<Snapshot>(empty);
  const [page, setPage] = useState<Page>("Overview");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState("Activity");
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [week, setWeek] = useState(0);
  const [login, setLogin] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    try {
      setData(await call<Snapshot>("snapshot"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("Overview");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (native)
      void import("@tauri-apps/plugin-autostart")
        .then((m) => m.isEnabled())
        .then(setLogin)
        .catch((e) => setError(String(e)));
  }, []);
  const projects = data.projects.filter((p) => !p.excluded);
  const visible = projects.filter((p) =>
    `${p.name} ${p.branch} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current =
    projects.find((p) => p.id === selected) || visible[0] || projects[0];
  useEffect(() => {
    setNote(current?.note || "");
    setNoteDirty(false);
  }, [current?.id, current?.note]);
  async function action(
    command: string,
    args: Record<string, unknown> = {},
    message = "",
  ) {
    setBusy(true);
    setError("");
    try {
      await call(command, args);
      await refresh();
      if (message) setToast(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setQuery("");
  }
  const activeIds = new Set(projects.map((p) => p.id));
  const activities = data.activity.filter((a) => activeIds.has(a.projectId));
  const commits = data.commits.filter((a) => activeIds.has(a.projectId));
  const days = weekDays(week);
  const periodActivity = activities.filter((a) => inPeriod(a.timestamp, days));
  const periodCommits = commits.filter((c) => inPeriod(c.timestamp, days));
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name || "Project";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const add = () => void action("add_root");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
          aria-label="Tokly overview"
        >
          <span className="brand-symbol">
            T<span />
          </span>
          <span>
            tokly<span className="brand-period">.</span>
          </span>
        </a>
        <div className="sidebar-caption">Your work, remembered.</div>
        <nav aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => navigate(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {name === "Projects" && (
                <span className="nav-count">{projects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={21} />
            <div>
              <strong>Just you. Just local.</strong>
              <p>Your activity stays on this Mac.</p>
            </div>
          </div>
          <button
            className="tracking-status"
            onClick={() => void action("set_paused", { paused: !data.paused })}
            disabled={busy}
            aria-label={data.paused ? "Resume tracking" : "Pause tracking"}
          >
            <span className={`status-dot ${data.paused ? "paused" : ""}`} />
            <span>
              {!native
                ? "Sample preview"
                : data.paused
                  ? "Tracking paused"
                  : "Tracking enabled"}
            </span>
            {data.paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <div className="version">
            Tokly for macOS <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            {!native && (
              <span className="preview-badge">
                Browser preview · sample data only
              </span>
            )}
            <button
              className="icon-button"
              title="Refresh Git status"
              aria-label="Refresh Git status"
              disabled={busy || data.paused}
              onClick={() => void action("rescan", {}, "Git status refreshed")}
            >
              <RefreshCw size={17} className={busy ? "spinning" : ""} />
            </button>
            <div className="avatar" aria-label="Local workspace">
              T
            </div>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {data.warnings.length > 0 && (
            <div className="warning-banner" role="status">
              {data.warnings.slice(0, 3).map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spinning" />
              <h2>Opening your workspace…</h2>
            </div>
          ) : data.roots.length === 0 && page !== "Settings" ? (
            <section className="onboarding">
              <div className="welcome-art">
                <FolderGit2 size={66} />
                <span className="welcome-bookmark">
                  <Bookmark size={32} />
                </span>
                <span className="art-dot" />
              </div>
              <span className="eyebrow">A little less remembering.</span>
              <h1>
                Come back to
                <br />
                your next good idea.
              </h1>
              <p>
                Choose where you keep your projects. Tokly finds Git
                repositories and remembers activity while you build in your
                favorite editor.
              </p>
              <button
                className="button primary large"
                disabled={busy}
                onClick={add}
              >
                {busy ? (
                  <LoaderCircle size={18} className="spinning" />
                ) : (
                  <Plus size={18} />
                )}
                Choose workspace folder
              </button>
              {!native && (
                <button
                  className="text-button"
                  onClick={() => {
                    sample();
                    void refresh();
                  }}
                >
                  Explore a sample workspace <ArrowRight size={15} />
                </button>
              )}
              <div className="onboarding-facts">
                <span>
                  <ShieldCheck size={16} />
                  Stored on your device
                </span>
                <span>
                  <Code2 size={16} />
                  Works with any editor
                </span>
                <span>
                  <Check size={16} />
                  No account needed
                </span>
              </div>
              <p className="small">
                Tracks file changes in approved folders. It doesn’t read your
                screen or detect which agent made an edit.
              </p>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "Overview"
                      ? today
                      : page === "Projects"
                        ? "A place for every next step"
                        : page === "Weekly progress"
                          ? "Small changes add up"
                          : "Make yourself at home"}
                  </div>
                  <h1>
                    {page === "Overview"
                      ? "Back to your projects"
                      : page === "Projects"
                        ? current?.name || "Your projects"
                        : page === "Weekly progress"
                          ? "Your week in motion"
                          : "Your workspace, your way"}
                    <span className="heading-dot" />
                  </h1>
                  <p>
                    {page === "Overview"
                      ? "Less catching up. More making things."
                      : page === "Projects"
                        ? current?.id || "Projects appear after discovery."
                        : page === "Weekly progress"
                          ? "An honest picture of changes and commits."
                          : "Choose what Tokly watches and how long it remembers."}
                  </p>
                </div>
                {page === "Overview" || page === "Projects" ? (
                  <button
                    className="button primary"
                    onClick={add}
                    disabled={busy}
                  >
                    <Plus size={17} />
                    Add workspace
                  </button>
                ) : null}
              </div>
              {page === "Overview" && (
                <>
                  <div className="overview-layout">
                    <section className="project-section">
                      <div className="section-heading">
                        <h2>
                          Your projects <span>{projects.length}</span>
                        </h2>
                        <span className="subtle">
                          Sorted by latest file activity
                        </span>
                      </div>
                      <label className="search-box">
                        <Search size={17} />
                        <input
                          ref={searchRef}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Find a project…"
                          aria-label="Find a project"
                        />
                        <kbd>⌘ K</kbd>
                      </label>
                      <div className="project-list">
                        {visible.map((p, i) => (
                          <button
                            key={p.id}
                            className={`project-row ${current?.id === p.id ? "selected" : ""}`}
                            onClick={() => setSelected(p.id)}
                          >
                            <span className={`project-icon ${colors[i % 4]}`}>
                              {i % 2 ? (
                                <Code2 size={23} />
                              ) : (
                                <FolderGit2 size={23} />
                              )}
                            </span>
                            <span className="project-info">
                              <strong>{p.name}</strong>
                              <span>
                                <GitBranch size={12} />
                                {p.branch}
                              </span>
                            </span>
                            <span className="project-meta">
                              <span>
                                {p.available
                                  ? relative(p.lastActivity)
                                  : "Folder unavailable"}
                              </span>
                              <span
                                className={
                                  p.changedFiles.length ? "changed" : "subtle"
                                }
                              >
                                {p.changedFiles.length
                                  ? `${p.changedFiles.length} changed files`
                                  : "Working tree clean"}
                              </span>
                            </span>
                            <ChevronRight className="row-arrow" size={17} />
                          </button>
                        ))}
                        {visible.length === 0 && (
                          <div className="empty-inline">
                            {query
                              ? "No projects match your search."
                              : "No Git projects found yet. Create or clone one in your workspace, then refresh."}
                          </div>
                        )}
                      </div>
                      <div className="section-footnote">
                        <Folder size={14} />
                        {data.roots.length} approved{" "}
                        {data.roots.length === 1 ? "workspace" : "workspaces"}
                        <button
                          className="text-button"
                          onClick={() => navigate("Settings")}
                        >
                          Manage folders
                        </button>
                      </div>
                    </section>
                    <aside className="continue-panel">
                      <div className="bookmark-icon">
                        <Bookmark size={24} />
                      </div>
                      <span className="continue-caption">
                        Your next little win
                      </span>
                      <h2>{current?.name || "Your next project"}</h2>
                      <p>
                        {current?.note ||
                          "Leave a next-step note so you know where to begin."}
                      </p>
                      {current && (
                        <>
                          <button
                            className="button dark"
                            disabled={busy || !current.available}
                            onClick={() =>
                              void action("open_project", {
                                id: current.id,
                                editor: true,
                              })
                            }
                          >
                            Open in Cursor <ExternalLink size={15} />
                          </button>
                          <button
                            className="continue-link"
                            onClick={() => {
                              navigate("Projects");
                              setTab("Notes");
                            }}
                          >
                            Edit next step <ArrowRight size={15} />
                          </button>
                        </>
                      )}
                      <div className="continue-doodle" aria-hidden="true">
                        <Sparkles size={42} />
                      </div>
                    </aside>
                  </div>
                  <section className="activity-section">
                    <div className="section-heading">
                      <h2>While you were building</h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("Weekly progress")}
                      >
                        View your week <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="activity-list">
                      {activities.slice(0, 4).map((a) => (
                        <div className="activity-row" key={a.id}>
                          <span className="activity-symbol">
                            <FileCode2 size={17} />
                          </span>
                          <div>
                            <strong>{a.label}</strong>
                            <span>
                              File activity in {projectName(a.projectId)}
                            </span>
                          </div>
                          <time
                            dateTime={new Date(
                              a.timestamp * 1000,
                            ).toISOString()}
                          >
                            {relative(a.timestamp)}
                          </time>
                        </div>
                      ))}
                      {activities.length === 0 && (
                        <div className="empty-inline">
                          Your next file change will appear here. Existing
                          commits are in Weekly progress.
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {page === "Projects" && (
                <>
                  <div className="project-picker" aria-label="Choose project">
                    {projects.map((p) => (
                      <button
                        className={`chip ${current?.id === p.id ? "active" : ""}`}
                        key={p.id}
                        onClick={() => setSelected(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {current ? (
                    <div className="detail-layout">
                      <section>
                        <div className="detail-toolbar">
                          <span className="branch-label">
                            <GitBranch size={15} />
                            {current.branch}
                          </span>
                          <button
                            className="text-button"
                            disabled={busy || !current.available}
                            onClick={() =>
                              void action("open_project", {
                                id: current.id,
                                editor: false,
                              })
                            }
                          >
                            Open folder <ExternalLink size={14} />
                          </button>
                        </div>
                        <div className="tabs" role="tablist">
                          {["Activity", "Changes", "Notes"].map((t) => (
                            <button
                              role="tab"
                              aria-selected={tab === t}
                              key={t}
                              onClick={() => setTab(t)}
                              className={tab === t ? "active" : ""}
                            >
                              {t}
                              {t === "Changes" && (
                                <span>{current.changedFiles.length}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="tab-content" role="tabpanel">
                          {tab === "Activity" ? (
                            <>
                              {commits
                                .filter((c) => c.projectId === current.id)
                                .slice(0, 20)
                                .map((c) => (
                                  <div className="activity-row" key={c.sha}>
                                    <span className="activity-symbol">
                                      <GitCommitHorizontal size={18} />
                                    </span>
                                    <div>
                                      <strong>{c.label}</strong>
                                      <span>Commit {c.sha.slice(0, 7)}</span>
                                    </div>
                                    <time>{relative(c.timestamp)}</time>
                                  </div>
                                ))}
                              {activities
                                .filter((a) => a.projectId === current.id)
                                .slice(0, 20)
                                .map((a) => (
                                  <div className="activity-row" key={a.id}>
                                    <span className="activity-symbol">
                                      <FileCode2 size={17} />
                                    </span>
                                    <div>
                                      <strong>{a.label}</strong>
                                      <span>File activity</span>
                                    </div>
                                    <time>{relative(a.timestamp)}</time>
                                  </div>
                                ))}
                              {!commits.some(
                                (c) => c.projectId === current.id,
                              ) &&
                                !activities.some(
                                  (a) => a.projectId === current.id,
                                ) && (
                                  <div className="empty-inline">
                                    No recent activity recorded for this
                                    project.
                                  </div>
                                )}
                            </>
                          ) : tab === "Changes" ? (
                            <>
                              {current.changedFiles.map((f) => (
                                <div className="file-row" key={f}>
                                  <FileCode2 size={16} />
                                  <span>{f}</span>
                                  <span className="change-label">Changed</span>
                                </div>
                              ))}
                              {!current.changedFiles.length && (
                                <div className="empty-inline">
                                  <Check size={22} />
                                  <p>Your working tree is clean.</p>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="note-editor">
                              <label htmlFor="next-step">
                                Where will you pick up next?
                              </label>
                              <textarea
                                id="next-step"
                                value={note}
                                maxLength={2000}
                                onChange={(e) => {
                                  setNote(e.target.value);
                                  setNoteDirty(true);
                                }}
                                placeholder="One small next step…"
                              />
                              <div className="note-actions">
                                <span>{note.length}/2000</span>
                                <button
                                  className="button primary"
                                  disabled={busy || !noteDirty}
                                  onClick={() =>
                                    void action(
                                      "save_note",
                                      { id: current.id, note },
                                      "Next step saved",
                                    )
                                  }
                                >
                                  Save next step <Check size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                      <aside className="project-facts">
                        <div className="mini-note">
                          <Bookmark size={21} />
                          <h3>Your saved next step</h3>
                          <p>
                            {current.note ||
                              "No next step yet. Write one in Notes."}
                          </p>
                        </div>
                        <h3>Project status</h3>
                        <dl>
                          <div>
                            <dt>Folder</dt>
                            <dd>
                              {current.available ? "Available" : "Unavailable"}
                            </dd>
                          </div>
                          <div>
                            <dt>Changed files</dt>
                            <dd>{current.changedFiles.length}</dd>
                          </div>
                          <div>
                            <dt>Last file activity</dt>
                            <dd>{relative(current.lastActivity)}</dd>
                          </div>
                        </dl>
                        <button
                          className="button secondary full"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              "exclude_project",
                              { id: current.id, excluded: true },
                              "Project excluded. Restore it in Settings.",
                            )
                          }
                        >
                          Exclude from tracking
                        </button>
                      </aside>
                    </div>
                  ) : (
                    <div className="empty-inline">
                      No active projects. Add a workspace or restore an excluded
                      project in Settings.
                    </div>
                  )}
                </>
              )}
              {page === "Weekly progress" && (
                <>
                  <div className="week-toolbar">
                    <div>
                      <strong>
                        {days[0].toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        –{" "}
                        {days[6].toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </strong>
                      <p>
                        {periodCommits.length} commits across{" "}
                        {new Set(periodCommits.map((c) => c.projectId)).size}{" "}
                        projects
                      </p>
                    </div>
                    <div className="week-controls">
                      <button
                        className="icon-button"
                        aria-label="Previous week"
                        disabled={
                          week <= -Math.floor((data.retentionDays - 1) / 7)
                        }
                        onClick={() => setWeek((w) => w - 1)}
                      >
                        <ArrowLeft size={17} />
                      </button>
                      <button className="chip" onClick={() => setWeek(0)}>
                        This week
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Next week"
                        disabled={week === 0}
                        onClick={() => setWeek((w) => w + 1)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </div>
                  <section className="chart-panel">
                    <div className="section-heading">
                      <h2>File activity</h2>
                      <span className="chart-legend">
                        <i />
                        Recorded changes
                      </span>
                    </div>
                    <div className="bar-chart">
                      {days.map((day) => {
                        const next = new Date(day);
                        next.setDate(next.getDate() + 1);
                        const count = periodActivity.filter(
                          (a) =>
                            a.timestamp >= day.getTime() / 1000 &&
                            a.timestamp < next.getTime() / 1000,
                        ).length;
                        const max = Math.max(
                          1,
                          ...days.map(
                            (d) =>
                              periodActivity.filter(
                                (a) =>
                                  new Date(
                                    a.timestamp * 1000,
                                  ).toDateString() === d.toDateString(),
                              ).length,
                          ),
                        );
                        return (
                          <div className="bar-column" key={day.toISOString()}>
                            <span className="bar-value">{count}</span>
                            <div
                              className={`bar ${count ? "" : "zero"}`}
                              style={{
                                height: `${Math.max(2, (count / max) * 150)}px`,
                              }}
                              title={`${day.toLocaleDateString()}: ${count} file activity events`}
                            />
                            <span>
                              {day.toLocaleDateString(undefined, {
                                weekday: "short",
                              })}
                            </span>
                            <small>{day.getDate()}</small>
                          </div>
                        );
                      })}
                    </div>
                    <p className="chart-caption">
                      <CircleHelp size={14} />
                      File activity records changes, not completed tasks or
                      coding time.
                    </p>
                  </section>
                  <div className="progress-table">
                    <div className="table-row table-head">
                      <span>Project</span>
                      <span>Commits</span>
                      <span>File events</span>
                      <span>Next step</span>
                    </div>
                    {projects.map((p, i) => (
                      <div className="table-row" key={p.id}>
                        <span>
                          <i className={`table-dot ${colors[i % 4]}`} />
                          {p.name}
                        </span>
                        <span>
                          {
                            periodCommits.filter((c) => c.projectId === p.id)
                              .length
                          }
                        </span>
                        <span>
                          {
                            periodActivity.filter((a) => a.projectId === p.id)
                              .length
                          }
                        </span>
                        <span>{p.note || "No note saved"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="small">
                    Commits include all authors on the current branch during the
                    last 7 days. File history is limited to the latest 500
                    events.
                  </p>
                </>
              )}
              {page === "Settings" && (
                <div className="settings-layout">
                  <section className="settings-group">
                    <div className="setting-heading">
                      <span className="setting-icon">
                        <FolderGit2 size={21} />
                      </span>
                      <div>
                        <h2>Workspace folders</h2>
                        <p>
                          Git projects inside these folders are discovered
                          automatically, up to 12 levels deep.
                        </p>
                      </div>
                    </div>
                    {data.roots.map((path) => (
                      <div className="folder-setting" key={path}>
                        <Folder size={17} />
                        <span>{path}</span>
                        <button
                          className="icon-button danger"
                          aria-label={`Remove ${path}`}
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await call<boolean>("confirm_action", {
                                message:
                                  "Remove this workspace and its saved activity and notes?",
                              })
                            )
                              void action(
                                "remove_root",
                                { path },
                                "Workspace removed",
                              );
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={add}
                    >
                      <Plus size={16} />
                      Add workspace folder
                    </button>
                    {data.projects.some((p) => p.excluded) && (
                      <div className="excluded-projects">
                        <h3>Excluded projects</h3>
                        {data.projects
                          .filter((p) => p.excluded)
                          .map((p) => (
                            <div key={p.id}>
                              <span>{p.name}</span>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void action(
                                    "exclude_project",
                                    { id: p.id, excluded: false },
                                    "Project restored",
                                  )
                                }
                              >
                                Restore
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>
                  <section className="settings-group">
                    <div className="setting-heading">
                      <span className="setting-icon">
                        <ActivityIcon size={21} />
                      </span>
                      <div>
                        <h2>Quietly in the background</h2>
                        <p>
                          Close the window and keep building. Quit Tokly to stop
                          tracking.
                        </p>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>Background tracking</strong>
                        <p>Watch only your approved folders.</p>
                      </div>
                      <button
                        className={`toggle ${!data.paused ? "on" : ""}`}
                        role="switch"
                        aria-checked={!data.paused}
                        aria-label="Background tracking"
                        disabled={busy}
                        onClick={() =>
                          void action("set_paused", { paused: !data.paused })
                        }
                      >
                        <span />
                      </button>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>Launch at login</strong>
                        <p>
                          {native
                            ? "Start Tokly when you sign in to your Mac."
                            : "Available in the macOS app."}
                        </p>
                      </div>
                      <button
                        className={`toggle ${login ? "on" : ""}`}
                        role="switch"
                        aria-checked={login}
                        aria-label="Launch at login"
                        disabled={!native || busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const m =
                              await import("@tauri-apps/plugin-autostart");
                            if (login) await m.disable();
                            else await m.enable();
                            setLogin(await m.isEnabled());
                          } catch (e) {
                            setError(String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <span />
                      </button>
                    </div>
                  </section>
                  <section className="settings-group">
                    <div className="setting-heading">
                      <span className="setting-icon">
                        <ShieldCheck size={21} />
                      </span>
                      <div>
                        <h2>A small local memory</h2>
                        <p>
                          File paths, timestamps, Git metadata and notes. No
                          file contents or remote uploads.
                        </p>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <label htmlFor="retention">
                          <strong>Keep activity for</strong>
                        </label>
                        <p>
                          Older activity is deleted automatically. Your
                          next-step notes stay.
                        </p>
                      </div>
                      <select
                        id="retention"
                        value={data.retentionDays}
                        disabled={busy}
                        onChange={async (e) => {
                          const days = Number(e.target.value);
                          if (
                            days < data.retentionDays &&
                            !(await call<boolean>("confirm_action", {
                              message:
                                "Delete activity older than this retention period?",
                            }))
                          )
                            return;
                          void action(
                            "set_retention",
                            { days },
                            "Retention updated",
                          );
                        }}
                      >
                        {[7, 30, 90, 365].map((d) => (
                          <option key={d} value={d}>
                            {d} days
                          </option>
                        ))}
                      </select>
                    </div>
                  </section>
                  <div className="settings-footer">
                    <span>
                      <Check size={15} />
                      Changes save automatically
                    </span>
                    {!native && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (
                            await call<boolean>("confirm_action", {
                              message: "Clear this sample workspace?",
                            })
                          ) {
                            resetPreview();
                            void refresh();
                          }
                        }}
                      >
                        Reset sample workspace
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <span className="status-dot" />
            {native
              ? "Stored on this device"
              : "Preview only — no access to your files"}
          </span>
          <span>
            {data.lastScan
              ? `Last scan ${relative(data.lastScan).toLowerCase()}`
              : "Ready when you are"}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
