//! Local-only tracking. File contents, diffs, credentials and remote URLs are never stored.
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
pub struct Commit {
    pub project_id: String,
    pub sha: String,
    pub label: String,
    pub timestamp: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub roots: Vec<String>,
    pub projects: Vec<Project>,
    pub activity: Vec<Activity>,
    pub commits: Vec<Commit>,
    pub paused: bool,
    pub retention_days: i64,
    pub last_scan: Option<i64>,
    pub warnings: Vec<String>,
}
pub struct Store {
    db: Connection,
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
  INSERT OR IGNORE INTO settings VALUES('paused','false'),('retention','90');
  CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,branch TEXT NOT NULL DEFAULT '',changed TEXT NOT NULL DEFAULT '[]',note TEXT NOT NULL DEFAULT '',last_activity INTEGER,excluded INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,kind TEXT NOT NULL,label TEXT NOT NULL,timestamp INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS activity_time ON activity(timestamp);
  CREATE TABLE IF NOT EXISTS commits(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sha TEXT NOT NULL,label TEXT NOT NULL,timestamp INTEGER NOT NULL,PRIMARY KEY(project_id,sha));
  CREATE INDEX IF NOT EXISTS commit_time ON commits(timestamp);").map_err(err)?;
        Ok(Self {
            db,
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
    pub fn paused(&self) -> bool {
        self.db
            .query_row("SELECT value FROM settings WHERE key='paused'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap_or_default()
            == "true"
    }
    pub fn set_paused(&mut self, value: bool) -> Result<()> {
        self.db
            .execute(
                "UPDATE settings SET value=? WHERE key='paused'",
                [value.to_string()],
            )
            .map_err(err)?;
        Ok(())
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
    fn project_paths(&self) -> Result<Vec<String>> {
        let mut s = self.db.prepare("SELECT id FROM projects").map_err(err)?;
        let rows = s.query_map([], |r| r.get(0)).map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut q=self.db.prepare("SELECT id,name,branch,changed,note,last_activity,excluded,available FROM projects ORDER BY last_activity DESC,name").map_err(err)?;
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
        let mut q=self.db.prepare("SELECT project_id,sha,label,timestamp FROM commits WHERE timestamp>=? ORDER BY timestamp DESC").map_err(err)?;
        let commits = q
            .query_map([now() - self.retention() * 86400], |r| {
                Ok(Commit {
                    project_id: r.get(0)?,
                    sha: r.get(1)?,
                    label: r.get(2)?,
                    timestamp: r.get(3)?,
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
            paused: self.paused(),
            retention_days: self.retention(),
            last_scan: self.last_scan,
            warnings: self.warnings.clone(),
        })
    }
    pub fn reconcile(&mut self) -> Result<()> {
        self.warnings.clear();
        if self.paused() {
            return Ok(());
        }
        for root in self.roots()? {
            if !Path::new(&root).is_dir() {
                self.warnings.push(format!("Folder unavailable: {root}"));
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
                            self.refresh_project(entry.path())?;
                        }
                    }
                    Err(e) if self.warnings.len() < 10 => {
                        self.warnings.push(format!("Could not scan a folder: {e}"));
                    }
                    _ => {}
                }
            }
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
        let branch = repo
            .head()
            .ok()
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
                "UPDATE projects SET branch=?,changed=?,available=1 WHERE id=?",
                params![branch, serde_json_compat::encode(&changed), id],
            )
            .map_err(err)?;
        let mut walk = repo.revwalk().map_err(err)?;
        if walk.push_head().is_ok() {
            walk.set_sorting(git2::Sort::TIME).map_err(err)?;
            let cutoff = now() - 7 * 86400;
            for oid in walk.take(10000).flatten() {
                if let Ok(c) = repo.find_commit(oid) {
                    let t = c.time().seconds();
                    if t < cutoff {
                        break;
                    }
                    self.db.execute("INSERT OR IGNORE INTO commits(project_id,sha,label,timestamp) VALUES(?,?,?,?)",params![id,oid.to_string(),c.summary().unwrap_or("Commit"),t]).map_err(err)?;
                }
            }
        }
        Ok(())
    }
    pub fn record_paths(&mut self, paths: impl IntoIterator<Item = PathBuf>) -> Result<()> {
        if self.paused() {
            return Ok(());
        }
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
            let desired: HashSet<String> = if s.paused() {
                HashSet::new()
            } else {
                s.roots()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|p| Path::new(p).is_dir())
                    .collect()
            };
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
            if s.paused() {
                pending.clear();
                continue;
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
    fn pause_exclusion_and_noise_do_not_record_activity() {
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
        s.set_paused(true).unwrap();
        s.record_paths(vec![p.join("a.rs")]).unwrap();
        s.set_paused(false).unwrap();
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
        let (temp, mut s, p) = fixture();
        s.add_root(temp.path()).unwrap();
        let shared = Arc::new(Mutex::new(s));
        let _worker = start(shared.clone());
        let deadline = Instant::now() + Duration::from_secs(10);
        while shared.lock().unwrap().last_scan.is_none() {
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
        persisted.set_paused(true).unwrap();
        persisted.set_retention(30).unwrap();
        drop(persisted);
        let restored = Store::open(&db).unwrap().snapshot().unwrap();
        assert!(restored.paused);
        assert_eq!(restored.retention_days, 30);
        assert_eq!(restored.projects[0].note, "Pick up here");
        assert_eq!(restored.roots.len(), 1);
    }
}
