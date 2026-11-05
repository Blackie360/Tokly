//! Local-only tracking. File contents, diffs, credentials and remote URLs are never stored.
pub mod graph;
mod history;
pub mod notes;
use chrono::Utc;
use git2::{Repository, StatusOptions};
use notify::{RecursiveMode, Watcher};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use walkdir::WalkDir;

pub type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn now() -> i64 {
    Utc::now().timestamp()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub branch: String,
    pub changed_files: Vec<String>,
    pub note: String,
    pub last_activity: Option<i64>,
    pub excluded: bool,
    pub available: bool,
    pub pinned: bool,
    pub last_commit: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: i64,
    pub project_id: String,
    pub kind: String,
    pub label: String,
    pub timestamp: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistory {
    pub project_id: String,
    pub head_sha: Option<String>,
    pub shallow: bool,
    pub truncated: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub project_id: String,
    pub sha: String,
    pub parents: Vec<String>,
    pub missing_parents: Vec<String>,
    pub label: String,
    pub timestamp: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub root: String,
    pub scanned_at: i64,
    pub repositories_found: usize,
    pub status: String,
    pub issues: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub roots: Vec<String>,
    pub projects: Vec<Project>,
    pub activity: Vec<Activity>,
    pub commits: Vec<Commit>,
    pub git_history: Vec<GitHistory>,
    pub scans: Vec<ScanReport>,
    pub retention_days: i64,
    pub history_days: i64,
    pub preferred_editor: String,
    pub last_scan: Option<i64>,
    pub warnings: Vec<String>,
}
pub struct Store {
    db: Connection,
    scans: Vec<ScanReport>,
    pub last_scan: Option<i64>,
    pub warnings: Vec<String>,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path).map_err(err)?;
        Self::from_connection(db)
    }
    fn from_connection(db: Connection) -> Result<Self> {
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS roots(path TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  INSERT OR IGNORE INTO settings VALUES('retention','90'),('history','7'),('editor','auto');
  DELETE FROM settings WHERE key='paused';
  CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,branch TEXT NOT NULL DEFAULT '',changed TEXT NOT NULL DEFAULT '[]',note TEXT NOT NULL DEFAULT '',last_activity INTEGER,excluded INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,kind TEXT NOT NULL,label TEXT NOT NULL,timestamp INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS activity_time ON activity(timestamp);
  CREATE TABLE IF NOT EXISTS commits(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sha TEXT NOT NULL,label TEXT NOT NULL,timestamp INTEGER NOT NULL,PRIMARY KEY(project_id,sha));
  CREATE INDEX IF NOT EXISTS commit_time ON commits(timestamp);").map_err(err)?;
        let has_pinned: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('projects') WHERE name='pinned')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !has_pinned {
            db.execute(
                "ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(err)?;
        }
        let has_last_commit: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('projects') WHERE name='last_commit')", [], |r| r.get(0)).map_err(err)?;
        if !has_last_commit {
            db.execute("ALTER TABLE projects ADD COLUMN last_commit INTEGER", [])
                .map_err(err)?;
        }
        let columns: HashSet<String> = db
            .prepare("PRAGMA table_info(commits)")
            .map_err(err)?
            .query_map([], |r| r.get(1))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        for column in ["parents", "missing_parents"] {
            if !columns.contains(column) {
                db.execute(
                    &format!("ALTER TABLE commits ADD COLUMN {column} TEXT NOT NULL DEFAULT '[]'"),
                    [],
                )
                .map_err(err)?;
            }
        }
        db.execute_batch("CREATE TABLE IF NOT EXISTS active_commits(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sha TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(project_id,sha));
            CREATE TABLE IF NOT EXISTS git_history(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,head_sha TEXT,shallow INTEGER NOT NULL,truncated INTEGER NOT NULL);").map_err(err)?;
        Ok(Self {
            db,
            scans: vec![],
            last_scan: None,
            warnings: vec![],
        })
    }
    pub fn roots(&self) -> Result<Vec<String>> {
        let mut s = self
            .db
            .prepare("SELECT path FROM roots ORDER BY path")
            .map_err(err)?;
        let rows = s.query_map([], |r| r.get(0)).map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn add_root(&mut self, path: &Path) -> Result<()> {
        let p = path.canonicalize().map_err(err)?;
        if !p.is_dir() {
            return Err("Choose a folder.".into());
        }
        if p.parent().is_none() {
            return Err("Choose a workspace folder, rather than the entire disk.".into());
        }
        self.db
            .execute(
                "INSERT OR IGNORE INTO roots VALUES(?)",
                [p.to_string_lossy().as_ref()],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn remove_root(&mut self, path: &str) -> Result<()> {
        let normalized = Path::new(path).canonicalize().ok();
        let path = normalized.as_ref().and_then(|p| p.to_str()).unwrap_or(path);
        let tx = self.db.transaction().map_err(err)?;
        tx.execute("DELETE FROM roots WHERE path=?", [path])
            .map_err(err)?;
        tx.commit().map_err(err)?;
        let roots = self.roots()?;
        let ids = self.project_paths()?;
        for id in ids {
            if !roots.iter().any(|r| Path::new(&id).starts_with(r)) {
                self.db
                    .execute("DELETE FROM projects WHERE id=?", [id])
                    .map_err(err)?;
            }
        }
        Ok(())
    }
    pub fn preferred_editor(&self) -> String {
        self.db
            .query_row("SELECT value FROM settings WHERE key='editor'", [], |r| {
                r.get(0)
            })
            .unwrap_or_else(|_| "auto".into())
    }
    pub fn set_preferred_editor(&mut self, editor: &str) -> Result<()> {
        self.db
            .execute("UPDATE settings SET value=? WHERE key='editor'", [editor])
            .map_err(err)?;
        Ok(())
    }
    pub fn history_days(&self) -> i64 {
        self.db
            .query_row("SELECT value FROM settings WHERE key='history'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap_or_else(|_| "7".into())
            .parse()
            .unwrap_or(7)
    }
    pub fn set_history_days(&mut self, days: i64) -> Result<()> {
        if ![7, 30, 90].contains(&days) {
            return Err("Choose 7, 30 or 90 days.".into());
        }
        self.db
            .execute(
                "UPDATE settings SET value=? WHERE key='history'",
                [days.to_string()],
            )
            .map_err(err)?;
        self.reconcile()
    }
    pub fn retention(&self) -> i64 {
        self.db
            .query_row(
                "SELECT value FROM settings WHERE key='retention'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "90".into())
            .parse()
            .unwrap_or(90)
    }
    pub fn set_retention(&mut self, days: i64) -> Result<()> {
        if ![7, 30, 90, 365].contains(&days) {
            return Err("Choose 7, 30, 90 or 365 days.".into());
        }
        self.db
            .execute(
                "UPDATE settings SET value=? WHERE key='retention'",
                [days.to_string()],
            )
            .map_err(err)?;
        self.prune()
    }
    fn prune(&mut self) -> Result<()> {
        let cutoff = now() - self.retention() * 86400;
        self.db
            .execute("DELETE FROM activity WHERE timestamp < ?", [cutoff])
            .map_err(err)?;
        self.db
            .execute("DELETE FROM commits WHERE timestamp < ?", [cutoff])
            .map_err(err)?;
        Ok(())
    }
    pub fn save_note(&mut self, id: &str, note: &str) -> Result<()> {
        if note.chars().count() > 2000 {
            return Err("Keep notes under 2,000 characters.".into());
        }
        if self
            .db
            .execute("UPDATE projects SET note=? WHERE id=?", params![note, id])
            .map_err(err)?
            == 0
        {
            return Err("Project not found.".into());
        }
        Ok(())
    }
    pub fn exclude(&mut self, id: &str, value: bool) -> Result<()> {
        if self
            .db
            .execute(
                "UPDATE projects SET excluded=? WHERE id=?",
                params![value, id],
            )
            .map_err(err)?
            == 0
        {
            return Err("Project not found.".into());
        }
        Ok(())
    }
    pub fn pin_project(&mut self, id: &str, pinned: bool) -> Result<()> {
        if self
            .db
            .execute(
                "UPDATE projects SET pinned=? WHERE id=?",
                params![pinned, id],
            )
            .map_err(err)?
            == 0
        {
            return Err("Project not found.".into());
        }
        Ok(())
    }
    fn project_paths(&self) -> Result<Vec<String>> {
        let mut s = self.db.prepare("SELECT id FROM projects").map_err(err)?;
        let rows = s.query_map([], |r| r.get(0)).map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut q=self.db.prepare("SELECT id,name,branch,changed,note,last_activity,excluded,available,pinned,last_commit FROM projects ORDER BY pinned DESC,last_activity DESC,name").map_err(err)?;
        let projects = q
            .query_map([], |r| {
                let changed: String = r.get(3)?;
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    branch: r.get(2)?,
                    changed_files: serde_json_compat::decode(&changed),
                    note: r.get(4)?,
                    last_activity: r.get(5)?,
                    excluded: r.get(6)?,
                    available: r.get(7)?,
                    pinned: r.get(8)?,
                    last_commit: r.get(9)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut q=self.db.prepare("SELECT id,project_id,kind,label,timestamp FROM activity ORDER BY timestamp DESC,id DESC LIMIT 500").map_err(err)?;
        let activity = q
            .query_map([], |r| {
                Ok(Activity {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    kind: r.get(2)?,
                    label: r.get(3)?,
                    timestamp: r.get(4)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut q=self.db.prepare("SELECT c.project_id,c.sha,c.label,c.timestamp,c.parents,c.missing_parents FROM commits c JOIN active_commits a ON a.project_id=c.project_id AND a.sha=c.sha JOIN projects p ON p.id=c.project_id WHERE c.timestamp>=? AND p.available=1 AND p.excluded=0 ORDER BY c.project_id,a.position").map_err(err)?;
        let commits = q
            .query_map(
                [now() - self.retention().min(self.history_days()) * 86400],
                |r| {
                    Ok(Commit {
                        project_id: r.get(0)?,
                        sha: r.get(1)?,
                        parents: serde_json_compat::decode(&r.get::<_, String>(4)?),
                        missing_parents: serde_json_compat::decode(&r.get::<_, String>(5)?),
                        label: r.get(2)?,
                        timestamp: r.get(3)?,
                    })
                },
            )
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let git_history = self
            .db
            .prepare("SELECT project_id,head_sha,shallow,truncated FROM git_history")
            .map_err(err)?
            .query_map([], |r| {
                Ok(GitHistory {
                    project_id: r.get(0)?,
                    head_sha: r.get(1)?,
                    shallow: r.get(2)?,
                    truncated: r.get(3)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Snapshot {
            roots: self.roots()?,
            projects,
            activity,
            commits,
            git_history,
            scans: self.scans.clone(),
            retention_days: self.retention(),
            history_days: self.history_days(),
            preferred_editor: self.preferred_editor(),
            last_scan: self.last_scan,
            warnings: self.warnings.clone(),
        })
    }
    pub fn reconcile(&mut self) -> Result<()> {
        self.warnings.clear();
        self.scans.clear();
        for root in self.roots()? {
            let mut report = ScanReport {
                root: root.clone(),
                scanned_at: now(),
                repositories_found: 0,
                status: "complete".into(),
                issues: vec![],
            };
            if let Err(e) = std::fs::read_dir(&root) {
                report.status = if e.kind() == std::io::ErrorKind::PermissionDenied {
                    "permission"
                } else {
                    "unavailable"
                }
                .into();
                report.issues.push(format!("Cannot read folder: {e}"));
                self.warnings.push(format!("Folder unavailable: {root}"));
                self.scans.push(report);
                continue;
            }
            for result in WalkDir::new(&root)
                .follow_links(false)
                .max_depth(12)
                .into_iter()
                .filter_entry(|e| {
                    e.depth() == 0 || !ignored_component(e.file_name().to_string_lossy().as_ref())
                })
            {
                match result {
                    Ok(entry) if entry.file_type().is_dir() => {
                        if entry.path().join(".git").exists() {
                            report.repositories_found += 1;
                            let warnings_before = self.warnings.len();
                            self.refresh_project(entry.path())?;
                            report.issues.extend(
                                self.warnings[warnings_before..]
                                    .iter()
                                    .take(10 - report.issues.len().min(10))
                                    .cloned(),
                            );
                        }
                    }
                    Err(e) => {
                        if report.issues.len() < 10 {
                            report.issues.push(format!("Could not scan a folder: {e}"));
                        }
                        if self.warnings.len() < 10 {
                            self.warnings.push(format!("Could not scan a folder: {e}"));
                        }
                    }
                    _ => {}
                }
            }
            if !report.issues.is_empty() {
                report.status = "partial".into();
            }
            self.scans.push(report);
        }
        for id in self.project_paths()? {
            self.db
                .execute(
                    "UPDATE projects SET available=? WHERE id=?",
                    params![Path::new(&id).join(".git").exists(), id],
                )
                .map_err(err)?;
        }
        self.prune()?;
        self.last_scan = Some(now());
        Ok(())
    }
    fn refresh_project(&mut self, path: &Path) -> Result<()> {
        let id = path.to_string_lossy().to_string();
        let repo = match Repository::open(path) {
            Ok(r) => r,
            Err(e) => {
                self.db
                    .execute("DELETE FROM active_commits WHERE project_id=?", [&id])
                    .map_err(err)?;
                self.warnings
                    .push(format!("Cannot read {}: {e}", path.display()));
                return Ok(());
            }
        };
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.db
            .execute(
                "INSERT OR IGNORE INTO projects(id,name) VALUES(?,?)",
                params![id, name],
            )
            .map_err(err)?;
        let excluded: bool = self
            .db
            .query_row("SELECT excluded FROM projects WHERE id=?", [&id], |r| {
                r.get(0)
            })
            .map_err(err)?;
        if excluded {
            return Ok(());
        }
        let head = repo.head().ok();
        let head_id = head
            .as_ref()
            .and_then(|h| h.peel_to_commit().ok())
            .map(|c| c.id());
        let branch = head
            .as_ref()
            .map(|h| {
                if h.is_branch() {
                    h.shorthand().unwrap_or("Unknown").to_string()
                } else {
                    format!(
                        "detached {}",
                        h.target()
                            .map(|x| x.to_string()[..7].to_string())
                            .unwrap_or_default()
                    )
                }
            })
            .unwrap_or_else(|| "No commits yet".into());
        let mut options = StatusOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false);
        let changed = match repo.statuses(Some(&mut options)) {
            Ok(s) => s
                .iter()
                .filter_map(|e| e.path().map(str::to_string))
                .filter(|p| !ignored_path(Path::new(p)))
                .collect::<Vec<_>>(),
            Err(e) => {
                self.warnings
                    .push(format!("Cannot read changes for {name}: {e}"));
                vec![]
            }
        };
        self.db
            .execute(
                "UPDATE projects SET branch=?,changed=?,last_commit=?,available=1 WHERE id=?",
                params![
                    branch,
                    serde_json_compat::encode(&changed),
                    head_id
                        .and_then(|oid| repo.find_commit(oid).ok())
                        .map(|c| c.time().seconds()),
                    id
                ],
            )
            .map_err(err)?;
        let history = history::read(&repo, head_id, 10_000);
        let cutoff = now() - self.history_days().min(self.retention()) * 86400;
        let tx = self.db.transaction().map_err(err)?;
        tx.execute("DELETE FROM active_commits WHERE project_id=?", [&id])
            .map_err(err)?;
        tx.execute(
            "INSERT OR REPLACE INTO git_history VALUES(?,?,?,?)",
            params![
                id,
                head_id.map(|oid| oid.to_string()),
                repo.is_shallow(),
                history.truncated
            ],
        )
        .map_err(err)?;
        for (position, c) in history.entries.into_iter().enumerate() {
            if c.timestamp < cutoff {
                continue;
            }
            tx.execute("INSERT INTO commits(project_id,sha,label,timestamp,parents,missing_parents) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,sha) DO UPDATE SET parents=excluded.parents,missing_parents=excluded.missing_parents",
                params![id,c.sha,c.label,c.timestamp,serde_json_compat::encode(&c.parents),serde_json_compat::encode(&c.missing)]).map_err(err)?;
            tx.execute(
                "INSERT INTO active_commits VALUES(?,?,?)",
                params![id, c.sha, position as i64],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(())
    }
    pub fn record_paths(&mut self, paths: impl IntoIterator<Item = PathBuf>) -> Result<()> {
        let mut projects = self.snapshot()?.projects;
        projects.sort_by_key(|p| std::cmp::Reverse(p.id.len()));
        let mut unique = HashSet::new();
        for path in paths {
            if let Some(p) = projects.iter().find(|p| path.starts_with(&p.id)) {
                if p.excluded {
                    continue;
                }
                let relative = path.strip_prefix(&p.id).map_err(err)?;
                if relative.as_os_str().is_empty()
                    || ignored_path(relative)
                    || relative.components().any(|c| c.as_os_str() == ".git")
                {
                    continue;
                }
                if let Ok(repo) = Repository::open(&p.id) {
                    if repo.status_should_ignore(relative).unwrap_or(false) {
                        continue;
                    }
                }
                let label = relative.to_string_lossy().to_string();
                if !unique.insert((p.id.clone(), label.clone())) {
                    continue;
                }
                let timestamp = now();
                self.db.execute("INSERT INTO activity(project_id,kind,label,timestamp) VALUES(?,'file',?,?)",params![p.id,label,timestamp]).map_err(err)?;
                self.db
                    .execute(
                        "UPDATE projects SET last_activity=? WHERE id=?",
                        params![timestamp, p.id],
                    )
                    .map_err(err)?;
            }
        }
        Ok(())
    }
}
// Filenames are JSON-encoded to preserve newlines, backslashes and Unicode.
mod serde_json_compat {
    pub fn encode(v: &Vec<String>) -> String {
        serde_json::to_string(v).unwrap_or_else(|_| "[]".into())
    }
    pub fn decode(s: &str) -> Vec<String> {
        serde_json::from_str(s).unwrap_or_default()
    }
}
pub fn ignored_component(s: &str) -> bool {
    matches!(
        s,
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".git"
            | ".next"
            | ".cache"
            | ".venv"
            | "venv"
            | "__pycache__"
            | "Library"
            | ".Trash"
            | ".idea"
    )
}
pub fn ignored_path(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        ignored_component(&s) || s == ".DS_Store" || s.ends_with(".swp") || s.ends_with('~')
    })
}

/// One serialized worker owns the watcher, bounds its queue, and reconciles every minute.
/// Missing notification bursts are repaired as current Git state, never fabricated edit history.
pub struct Tracker {
    stop: Arc<std::sync::atomic::AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}
impl Drop for Tracker {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
pub fn start(store: Arc<Mutex<Store>>) -> Tracker {
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let worker_stop = stop.clone();
    let handle = thread::spawn(move || {
        let (tx, rx) = mpsc::sync_channel(4096);
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                let _ = tx.try_send(event);
            })
            .ok();
        let mut watched = HashSet::<String>::new();
        let mut requested = HashSet::<String>::new();
        let mut watch_warnings = Vec::<String>::new();
        let mut watch_attempt = Instant::now() - Duration::from_secs(60);
        let mut pending = HashMap::<PathBuf, Instant>::new();
        let mut scan = Instant::now() - Duration::from_secs(60);
        while !worker_stop.load(std::sync::atomic::Ordering::Relaxed) {
            match rx.recv_timeout(Duration::from_millis(400)) {
                Ok(Ok(e)) => {
                    if matches!(
                        e.kind,
                        notify::EventKind::Create(_)
                            | notify::EventKind::Modify(_)
                            | notify::EventKind::Remove(_)
                    ) {
                        for p in e.paths {
                            pending.insert(p, Instant::now());
                        }
                    }
                }
                Ok(Err(e)) => {
                    if let Ok(mut s) = store.lock() {
                        s.warnings.push(format!("File watcher: {e}"));
                    }
                }
                _ => {}
            }
            let Ok(mut s) = store.lock() else {
                break;
            };
            let desired: HashSet<String> = s
                .roots()
                .unwrap_or_default()
                .into_iter()
                .filter(|p| Path::new(p).is_dir())
                .collect();
            if desired != requested
                || (desired != watched && watch_attempt.elapsed() >= Duration::from_secs(60))
            {
                watch_warnings.clear();
                if let Some(w) = watcher.as_mut() {
                    for p in watched.difference(&desired) {
                        let _ = w.unwatch(Path::new(p));
                    }
                    watched.retain(|p| desired.contains(p));
                    for p in desired.difference(&watched).cloned().collect::<Vec<_>>() {
                        match w.watch(Path::new(&p),RecursiveMode::Recursive) {
                            Ok(())=>{watched.insert(p);},
                            Err(e)=>watch_warnings.push(format!("Could not watch {p}: {e}. Git status will still refresh every minute.")),
                        }
                    }
                } else if !desired.is_empty() {
                    watch_warnings.push(
                        "File watcher unavailable; Git status will refresh every minute.".into(),
                    );
                }
                requested = desired;
                watch_attempt = Instant::now();
                scan = Instant::now() - Duration::from_secs(60);
                pending.clear();
            }
            let ready: Vec<PathBuf> = pending
                .iter()
                .filter(|(_, t)| t.elapsed() > Duration::from_secs(2))
                .map(|(p, _)| p.clone())
                .collect();
            for p in &ready {
                pending.remove(p);
            }
            if !ready.is_empty() || scan.elapsed() >= Duration::from_secs(60) {
                if let Err(e) = s.reconcile() {
                    s.warnings.push(e);
                }
                if let Err(e) = s.record_paths(ready) {
                    s.warnings.push(e);
                }
                scan = Instant::now();
            }
            for warning in &watch_warnings {
                if !s.warnings.contains(warning) {
                    s.warnings.push(warning.clone());
                }
            }
        }
    });
    Tracker {
        stop,
        handle: Some(handle),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    fn fixture() -> (TempDir, Store, PathBuf) {
        let temp = TempDir::new().unwrap();
        let p = temp.path().join("project");
        std::fs::create_dir(&p).unwrap();
        let p = p.canonicalize().unwrap();
        Repository::init(&p).unwrap();
        let s = Store::from_connection(Connection::open_in_memory().unwrap()).unwrap();
        (temp, s, p)
    }
    fn commit(path: &Path) {
        let repo = Repository::open(path).unwrap();
        std::fs::write(path.join("hello.txt"), "hello").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("hello.txt")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "First commit", &tree, &[])
            .unwrap();
    }
    #[test]
    fn discovers_nested_repositories_and_deduplicates_commits() {
        let (t, mut s, p) = fixture();
        commit(&p);
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        s.reconcile().unwrap();
        let snap = s.snapshot().unwrap();
        assert_eq!(snap.projects.len(), 1);
        assert_eq!(snap.commits.len(), 1);
        assert_eq!(snap.projects[0].last_activity, None);
    }
    #[test]
    fn history_window_imports_old_commits_and_respects_retention() {
        let (temp, mut s, p) = fixture();
        let repo = Repository::open(&p).unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let old = git2::Signature::new(
            "Test",
            "test@example.com",
            &git2::Time::new(now() - 60 * 86400, 0),
        )
        .unwrap();
        let parent_id = repo
            .commit(Some("HEAD"), &old, &old, "Older work", &tree, &[])
            .unwrap();
        let parent = repo.find_commit(parent_id).unwrap();
        let recent = git2::Signature::new(
            "Test",
            "test@example.com",
            &git2::Time::new(now() - 20 * 86400, 0),
        )
        .unwrap();
        repo.commit(
            Some("HEAD"),
            &recent,
            &recent,
            "Recent work",
            &tree,
            &[&parent],
        )
        .unwrap();
        s.add_root(temp.path()).unwrap();
        s.reconcile().unwrap();
        assert!(s.snapshot().unwrap().commits.is_empty());
        assert!(s.snapshot().unwrap().projects[0].last_commit.is_some());
        s.set_history_days(30).unwrap();
        assert_eq!(s.snapshot().unwrap().commits.len(), 1);
        s.set_history_days(90).unwrap();
        assert_eq!(s.snapshot().unwrap().commits.len(), 2);
        s.set_history_days(7).unwrap();
        assert!(s.snapshot().unwrap().commits.is_empty());
        s.set_history_days(90).unwrap();
        s.set_retention(7).unwrap();
        s.reconcile().unwrap();
        assert!(s.snapshot().unwrap().commits.is_empty());
        assert_eq!(
            s.db.query_row("SELECT COUNT(*) FROM commits", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(s.set_history_days(14).is_err());
    }
    #[test]
    fn branch_membership_replaces_cached_ancestry_without_losing_notes() {
        let (temp, mut s, p) = fixture();
        let repo = Repository::open(&p).unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let root = repo.commit(None, &sig, &sig, "Root", &tree, &[]).unwrap();
        let root_commit = repo.find_commit(root).unwrap();
        let main = repo
            .commit(None, &sig, &sig, "Main work", &tree, &[&root_commit])
            .unwrap();
        let side = repo
            .commit(None, &sig, &sig, "Side work", &tree, &[&root_commit])
            .unwrap();
        let merge = repo
            .commit(
                None,
                &sig,
                &sig,
                "Merge work",
                &tree,
                &[
                    &repo.find_commit(main).unwrap(),
                    &repo.find_commit(side).unwrap(),
                ],
            )
            .unwrap();
        repo.reference("refs/heads/main", merge, true, "fixture")
            .unwrap();
        repo.reference("refs/heads/side", side, true, "fixture")
            .unwrap();
        repo.set_head("refs/heads/main").unwrap();
        s.add_root(temp.path()).unwrap();
        s.reconcile().unwrap();
        assert_eq!(s.snapshot().unwrap().commits.len(), 4);
        assert_eq!(s.snapshot().unwrap().commits[0].parents.len(), 2);
        s.save_note(p.to_str().unwrap(), "Keep my next step")
            .unwrap();
        s.pin_project(p.to_str().unwrap(), true).unwrap();
        repo.set_head("refs/heads/side").unwrap();
        s.reconcile().unwrap();
        let snap = s.snapshot().unwrap();
        assert_eq!(snap.commits.len(), 2);
        assert!(!snap
            .commits
            .iter()
            .any(|c| c.sha == main.to_string() || c.sha == merge.to_string()));
        assert_eq!(snap.projects[0].note, "Keep my next step");
        assert!(snap.projects[0].pinned);
        assert_eq!(
            s.db.query_row("SELECT count(*) FROM commits", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            4
        );
        repo.set_head_detached(main).unwrap();
        s.reconcile().unwrap();
        assert!(s.snapshot().unwrap().projects[0]
            .branch
            .starts_with("detached"));
        assert_eq!(
            s.snapshot().unwrap().git_history[0].head_sha,
            Some(main.to_string())
        );
        assert_eq!(s.snapshot().unwrap().commits.len(), 2);
        repo.set_head("refs/heads/unborn").unwrap();
        s.reconcile().unwrap();
        assert!(s.snapshot().unwrap().commits.is_empty());
    }
    #[test]
    fn discovery_reports_empty_found_unreadable_and_missing_workspaces() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        std::fs::create_dir(&root).unwrap();
        let mut s = Store::from_connection(Connection::open_in_memory().unwrap()).unwrap();
        s.add_root(&root).unwrap();
        s.reconcile().unwrap();
        assert_eq!(s.snapshot().unwrap().scans[0].repositories_found, 0);
        assert_eq!(s.snapshot().unwrap().scans[0].status, "complete");
        let project = root.join("project");
        Repository::init(&project).unwrap();
        s.reconcile().unwrap();
        assert_eq!(s.snapshot().unwrap().scans[0].repositories_found, 1);
        s.save_note(
            project.canonicalize().unwrap().to_str().unwrap(),
            "Preserve this note",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o000)).unwrap();
            let result = s.reconcile();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            result.unwrap();
            assert_eq!(s.snapshot().unwrap().scans[0].status, "permission");
        }
        std::fs::rename(&root, temp.path().join("moved")).unwrap();
        s.reconcile().unwrap();
        assert_eq!(s.snapshot().unwrap().scans[0].status, "unavailable");
        assert_eq!(s.snapshot().unwrap().projects[0].note, "Preserve this note");
    }
    #[test]
    fn legacy_cache_migrates_without_becoming_active_history() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE commits(project_id TEXT NOT NULL,sha TEXT NOT NULL,label TEXT NOT NULL,timestamp INTEGER NOT NULL,PRIMARY KEY(project_id,sha)); INSERT INTO commits VALUES('old-project','old-sha','Legacy subject',9999999999);").unwrap();
        let s = Store::from_connection(db).unwrap();
        assert!(s.snapshot().unwrap().commits.is_empty());
        assert_eq!(
            s.db.query_row("SELECT label FROM commits", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "Legacy subject"
        );
    }
    #[test]
    fn tracks_changes_and_notes_without_file_contents() {
        let (t, mut s, p) = fixture();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        let file = p.join("report.txt");
        std::fs::write(&file, "secret content").unwrap();
        s.record_paths(vec![file.clone(), file]).unwrap();
        s.save_note(p.to_str().unwrap(), "Continue tomorrow")
            .unwrap();
        s.reconcile().unwrap();
        let snap = s.snapshot().unwrap();
        assert_eq!(snap.activity.len(), 1);
        assert_eq!(snap.activity[0].label, "report.txt");
        assert_eq!(snap.projects[0].note, "Continue tomorrow");
        assert!(snap.projects[0]
            .changed_files
            .contains(&"report.txt".into()));
        assert!(!serde_json::to_string(&snap)
            .unwrap()
            .contains("secret content"));
    }
    #[test]
    fn exclusion_and_noise_do_not_record_activity() {
        let (t, mut s, p) = fixture();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        s.record_paths(vec![
            p.join("node_modules/a.js"),
            p.join(".git/index"),
            p.join("a.swp"),
        ])
        .unwrap();
        assert!(s.snapshot().unwrap().activity.is_empty());
        s.exclude(p.to_str().unwrap(), true).unwrap();
        s.reconcile().unwrap();
        s.record_paths(vec![p.join("a.rs")]).unwrap();
        assert!(s.snapshot().unwrap().activity.is_empty());
        assert!(s.snapshot().unwrap().projects[0].excluded);
    }
    #[test]
    fn removing_root_cascades_but_preserves_overlapping_approval() {
        let (t, mut s, p) = fixture();
        s.add_root(t.path()).unwrap();
        s.add_root(&p).unwrap();
        s.reconcile().unwrap();
        s.remove_root(t.path().to_str().unwrap()).unwrap();
        assert_eq!(s.snapshot().unwrap().projects.len(), 1);
        s.remove_root(p.to_str().unwrap()).unwrap();
        assert!(s.snapshot().unwrap().projects.is_empty());
    }
    #[test]
    fn retention_prunes_old_metadata() {
        let (t, mut s, p) = fixture();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        s.db.execute(
            "INSERT INTO activity(project_id,kind,label,timestamp) VALUES(?,'file','old',?)",
            params![p.to_str().unwrap(), now() - 10 * 86400],
        )
        .unwrap();
        s.set_retention(7).unwrap();
        assert!(s.snapshot().unwrap().activity.is_empty());
        assert!(s.set_retention(0).is_err());
    }
    #[test]
    fn worktrees_are_discovered() {
        let (t, mut s, p) = fixture();
        commit(&p);
        let repo = Repository::open(&p).unwrap();
        let work = t.path().join("linked");
        repo.worktree("linked", &work, None).unwrap();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        assert_eq!(s.snapshot().unwrap().projects.len(), 2);
    }
    #[test]
    fn excluded_nested_repo_does_not_leak_into_parent() {
        let (t, mut s, p) = fixture();
        let nested = p.join("nested");
        Repository::init(&nested).unwrap();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        s.exclude(nested.to_str().unwrap(), true).unwrap();
        s.record_paths(vec![nested.join("a.rs")]).unwrap();
        assert!(s.snapshot().unwrap().activity.is_empty());
    }
    #[test]
    fn missing_repository_is_marked_unavailable() {
        let (t, mut s, p) = fixture();
        s.add_root(t.path()).unwrap();
        s.reconcile().unwrap();
        std::fs::remove_dir_all(p.join(".git")).unwrap();
        s.reconcile().unwrap();
        assert!(!s.snapshot().unwrap().projects[0].available);
    }
    #[test]
    fn real_watcher_records_a_file_change() {
        let (temp, s, p) = fixture();
        // Start before onboarding: no roots means no project monitoring.
        let shared = Arc::new(Mutex::new(s));
        let _worker = start(shared.clone());
        assert!(shared
            .lock()
            .unwrap()
            .snapshot()
            .unwrap()
            .projects
            .is_empty());
        shared.lock().unwrap().add_root(temp.path()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while shared
            .lock()
            .unwrap()
            .snapshot()
            .unwrap()
            .projects
            .is_empty()
        {
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(100));
        }
        std::fs::write(p.join("observed.txt"), "not stored").unwrap();
        loop {
            let found = shared
                .lock()
                .unwrap()
                .snapshot()
                .unwrap()
                .activity
                .iter()
                .any(|a| a.label == "observed.txt");
            if found {
                break;
            }
            assert!(Instant::now() < deadline, "watcher did not record edit");
            thread::sleep(Duration::from_millis(100));
        }
    }
    #[test]
    fn local_database_restores_notes_and_preferences() {
        let (temp, mut s, p) = fixture();
        s.add_root(temp.path()).unwrap();
        s.reconcile().unwrap();
        let db = temp.path().join("state.db");
        let mut persisted = Store::open(&db).unwrap();
        persisted.add_root(&p).unwrap();
        persisted.reconcile().unwrap();
        persisted
            .save_note(p.to_str().unwrap(), "Pick up here")
            .unwrap();
        persisted
            .db
            .execute("INSERT INTO settings VALUES('paused','true')", [])
            .unwrap();
        persisted.set_retention(30).unwrap();
        persisted.pin_project(p.to_str().unwrap(), true).unwrap();
        persisted.set_history_days(30).unwrap();
        persisted.set_preferred_editor("dev.zed.Zed").unwrap();
        drop(persisted);
        let mut reopened = Store::open(&db).unwrap();
        reopened.reconcile().unwrap();
        reopened
            .record_paths(vec![p.join("after-relaunch.rs")])
            .unwrap();
        let restored = reopened.snapshot().unwrap();
        assert!(restored
            .activity
            .iter()
            .any(|a| a.label == "after-relaunch.rs"));
        assert_eq!(
            reopened
                .db
                .query_row(
                    "SELECT COUNT(*) FROM settings WHERE key='paused'",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(restored.retention_days, 30);
        assert_eq!(restored.history_days, 30);
        assert_eq!(restored.preferred_editor, "dev.zed.Zed");
        assert!(restored.projects[0].pinned);
        assert_eq!(restored.projects[0].note, "Pick up here");
        assert_eq!(restored.roots.len(), 1);
    }
}
