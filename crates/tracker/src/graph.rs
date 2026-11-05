//! On-demand graph of local refs. No network calls, repository writes or persistent graph cache.
use crate::{err, history, Commit, Result};
use git2::Repository;
use serde::Serialize;
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    hash::{Hash, Hasher},
    path::Path,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRef {
    pub name: String,
    pub sha: String,
    pub kind: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub commits: Vec<Commit>,
    pub earlier_children: HashMap<String, Vec<String>>,
    pub refs: Vec<GitRef>,
    pub head_sha: Option<String>,
    pub head_label: String,
    pub shallow: bool,
    pub total: usize,
    pub offset: usize,
    pub next_offset: Option<usize>,
    pub generation: String,
    pub warnings: Vec<String>,
}
struct Cached {
    project: String,
    page: Page,
    children: HashMap<String, Vec<String>>,
}
#[derive(Default)]
pub struct GraphCache {
    cached: Option<Cached>,
}

type RefSnapshot = (Vec<GitRef>, Option<String>, String, Vec<String>, String);
fn refs(repo: &Repository) -> Result<RefSnapshot> {
    let mut refs = Vec::new();
    let mut warnings = Vec::new();
    for reference in repo.references().map_err(err)? {
        let reference = reference.map_err(err)?;
        let name = reference.name().unwrap_or_default();
        let kind = if name.starts_with("refs/heads/") {
            "local"
        } else if name.starts_with("refs/remotes/") {
            "remote"
        } else if name.starts_with("refs/tags/") {
            "tag"
        } else {
            "other"
        };
        match reference.peel_to_commit() {
            Ok(commit) => refs.push(GitRef {
                name: reference.shorthand().unwrap_or(name).into(),
                sha: commit.id().to_string(),
                kind: kind.into(),
            }),
            Err(_) => warnings.push(format!(
                "Reference {} does not resolve to an available commit.",
                reference.shorthand().unwrap_or(name)
            )),
        }
    }
    refs.sort_by(|a, b| (&a.kind, &a.name).cmp(&(&b.kind, &b.name)));
    let head = repo.head().ok();
    let head_sha = head
        .as_ref()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| c.id().to_string());
    let label = head
        .as_ref()
        .map(|h| {
            if h.is_branch() {
                h.shorthand().unwrap_or("HEAD").to_string()
            } else {
                "Detached HEAD".into()
            }
        })
        .unwrap_or_else(|| "No commits on HEAD".into());
    let mut hasher = DefaultHasher::new();
    for r in &refs {
        (&r.name, &r.sha, &r.kind).hash(&mut hasher);
    }
    (&head_sha, &label).hash(&mut hasher);
    std::fs::read(repo.commondir().join("shallow"))
        .unwrap_or_default()
        .hash(&mut hasher);
    warnings.hash(&mut hasher);
    Ok((
        refs,
        head_sha,
        label,
        warnings,
        format!("{:x}", hasher.finish()),
    ))
}
impl GraphCache {
    pub fn page(
        &mut self,
        project: &Path,
        offset: usize,
        expected: Option<&str>,
        force: bool,
    ) -> Result<Page> {
        let repo = Repository::open(project).map_err(err)?;
        let (references, head_sha, head_label, warnings, generation) = refs(&repo)?;
        if expected.is_some_and(|g| g != generation) {
            return Err(
                "Git references changed. Refresh the graph before loading another page.".into(),
            );
        }
        let id = project.to_string_lossy().to_string();
        if force
            || self
                .cached
                .as_ref()
                .is_none_or(|c| c.project != id || c.page.generation != generation)
        {
            let mut heads: Vec<_> = references
                .iter()
                .filter_map(|r| git2::Oid::from_str(&r.sha).ok())
                .collect();
            if let Some(sha) = &head_sha {
                heads.push(git2::Oid::from_str(sha).map_err(err)?);
            }
            let history = history::read_roots(&repo, heads, usize::MAX);
            if refs(&repo)?.4 != generation {
                return Err(
                    "Git references changed during the scan. Refresh the graph to try again."
                        .into(),
                );
            }
            let commits: Vec<_> = history
                .entries
                .into_iter()
                .map(|c| Commit {
                    project_id: id.clone(),
                    sha: c.sha,
                    label: c.label,
                    timestamp: c.timestamp,
                    parents: c.parents,
                    missing_parents: c.missing,
                })
                .collect();
            let mut children: HashMap<String, Vec<String>> = HashMap::new();
            for commit in &commits {
                for parent in &commit.parents {
                    children
                        .entry(parent.clone())
                        .or_default()
                        .push(commit.sha.clone());
                }
            }
            self.cached = Some(Cached {
                children,
                project: id,
                page: Page {
                    earlier_children: HashMap::new(),
                    total: commits.len(),
                    commits,
                    refs: references,
                    head_sha,
                    head_label,
                    shallow: repo.is_shallow(),
                    offset: 0,
                    next_offset: None,
                    generation,
                    warnings,
                },
            });
        }
        let cached = &self.cached.as_ref().expect("cache loaded above").page;
        if offset > cached.total {
            return Err("Graph page is no longer available. Refresh the graph.".into());
        }
        let end = offset.saturating_add(50).min(cached.total);
        let shown: HashSet<_> = cached.commits[offset..end]
            .iter()
            .map(|c| c.sha.as_str())
            .collect();
        let children = &self.cached.as_ref().expect("cache loaded").children;
        let earlier_children = shown
            .iter()
            .filter_map(|sha| {
                let earlier: Vec<_> = children
                    .get(*sha)
                    .into_iter()
                    .flatten()
                    .filter(|child| !shown.contains(child.as_str()))
                    .cloned()
                    .collect();
                (!earlier.is_empty()).then_some((sha.to_string(), earlier))
            })
            .collect();
        Ok(Page {
            earlier_children,
            commits: cached.commits[offset..end].to_vec(),
            refs: cached.refs.clone(),
            head_sha: cached.head_sha.clone(),
            head_label: cached.head_label.clone(),
            shallow: cached.shallow,
            total: cached.total,
            offset,
            next_offset: (end < cached.total).then_some(end),
            generation: cached.generation.clone(),
            warnings: cached.warnings.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn commit(repo: &Repository, parents: &[git2::Oid], subject: &str) -> git2::Oid {
        let tree = repo.index().unwrap().write_tree().unwrap();
        let parents: String = parents.iter().map(|p| format!("parent {p}\n")).collect();
        // Old timestamps deliberately prove the graph has no activity-window cutoff.
        let raw = format!("tree {tree}\n{parents}author Test <test@example.com> 1000000000 +0000\ncommitter Test <test@example.com> 1000000000 +0000\n\n{subject}\n");
        repo.odb()
            .unwrap()
            .write(git2::ObjectType::Commit, raw.as_bytes())
            .unwrap()
    }
    #[test]
    fn all_refs_detached_head_and_ref_changes_are_visible_without_checkout() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let root = commit(&repo, &[], "Old root");
        let main = commit(&repo, &[root], "Main work");
        let side = commit(&repo, &[root], "Unmerged branch");
        let remote = commit(&repo, &[root], "Remote only work");
        let tag = commit(&repo, &[], "Tag only history");
        let merge = commit(&repo, &[main, side], "Real merge message");
        let detached = commit(&repo, &[root], "Detached work");
        for (name, oid) in [
            ("refs/heads/main", merge),
            ("refs/heads/side", side),
            ("refs/remotes/origin/feature", remote),
            ("refs/tags/v1", tag),
        ] {
            repo.reference(name, oid, true, "fixture").unwrap();
        }
        repo.set_head_detached(detached).unwrap();
        let mut cache = GraphCache::default();
        let page = cache.page(temp.path(), 0, None, false).unwrap();
        assert_eq!(page.total, 7);
        assert_eq!(page.head_sha, Some(detached.to_string()));
        assert_eq!(page.head_label, "Detached HEAD");
        assert_eq!(page.refs.len(), 4);
        assert!(page.refs.iter().any(|r| r.kind == "remote"));
        assert_eq!(
            page.commits
                .iter()
                .find(|c| c.sha == merge.to_string())
                .unwrap()
                .parents,
            vec![main.to_string(), side.to_string()]
        );
        assert_eq!(repo.head().unwrap().target(), Some(detached));
        repo.set_head("refs/heads/side").unwrap();
        assert!(cache
            .page(temp.path(), 0, Some(&page.generation), false)
            .is_err());
        let next = cache.page(temp.path(), 0, None, false).unwrap();
        assert_eq!(next.head_label, "side");
        assert_eq!(next.total, 6); // Detached-only work is no longer reachable.
    }
    #[test]
    fn paginates_more_than_ten_thousand_commits_and_reuses_cache() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let mut parent = vec![];
        for i in 0..10_051 {
            parent = vec![commit(&repo, &parent, &format!("Commit {i}"))];
        }
        repo.reference("refs/heads/main", parent[0], true, "fixture")
            .unwrap();
        repo.set_head("refs/heads/main").unwrap();
        let start = std::time::Instant::now();
        let mut cache = GraphCache::default();
        let page = cache.page(temp.path(), 0, None, false).unwrap();
        eprintln!("10,051-commit cold graph scan: {:?}", start.elapsed());
        assert_eq!(page.total, 10_051);
        assert_eq!(page.commits.len(), 50);
        assert_eq!(page.next_offset, Some(50));
        let start = std::time::Instant::now();
        let last = cache
            .page(temp.path(), 10_050, Some(&page.generation), false)
            .unwrap();
        eprintln!("Cached graph page: {:?}", start.elapsed());
        assert_eq!(last.commits.len(), 1);
        assert_eq!(last.commits[0].label, "Commit 0");
        assert_eq!(last.next_offset, None);
        assert!(last.commits[0].parents.is_empty());
        assert_eq!(last.earlier_children[&last.commits[0].sha].len(), 1);
    }
    #[test]
    fn shallow_graph_preserves_parent_boundary_and_missing_ref_warning() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let root = commit(&repo, &[], "Root");
        let tip = commit(&repo, &[root], "Tip");
        repo.reference("refs/heads/main", tip, true, "fixture")
            .unwrap();
        repo.set_head("refs/heads/main").unwrap();
        std::fs::write(repo.path().join("shallow"), format!("{tip}\n")).unwrap();
        let mut cache = GraphCache::default();
        let page = cache.page(temp.path(), 0, None, false).unwrap();
        assert!(page.shallow);
        assert_eq!(page.total, 1);
        assert_eq!(page.commits[0].missing_parents, vec![root.to_string()]);
        // Simulate a partial/corrupt ref without asking Git to accept a nonexistent object.
        std::fs::write(
            repo.path().join("refs/heads/missing"),
            "1111111111111111111111111111111111111111\n",
        )
        .unwrap();
        let page = cache.page(temp.path(), 0, None, true).unwrap();
        assert_eq!(page.warnings.len(), 1);
    }
}

#[cfg(test)]
mod paging_merge_tests {
    use super::*;
    #[test]
    fn merge_across_page_boundary_keeps_both_parents_and_incoming_children() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let tree = repo.index().unwrap().write_tree().unwrap();
        let create = |parents: &[git2::Oid], i: usize| {
            let parent_lines: String = parents.iter().map(|p| format!("parent {p}\n")).collect();
            repo.odb().unwrap().write(git2::ObjectType::Commit,format!("tree {tree}\n{parent_lines}author T <t@example.com> 100 +0000\ncommitter T <t@example.com> 100 +0000\n\nCommit {i}\n").as_bytes()).unwrap()
        };
        let root = create(&[], 0);
        let a = create(&[root], 1);
        let b = create(&[root], 2);
        let merge = create(&[a, b], 3);
        let mut tip = merge;
        for i in 4..53 {
            tip = create(&[tip], i);
        }
        repo.reference("refs/heads/main", tip, true, "fixture")
            .unwrap();
        repo.set_head("refs/heads/main").unwrap();
        let mut cache = GraphCache::default();
        let first = cache.page(temp.path(), 0, None, false).unwrap();
        assert_eq!(first.commits.last().unwrap().sha, merge.to_string());
        assert_eq!(
            first.commits.last().unwrap().parents,
            vec![a.to_string(), b.to_string()]
        );
        let second = cache
            .page(temp.path(), 50, Some(&first.generation), false)
            .unwrap();
        assert_eq!(second.total, 53);
        assert_eq!(
            second.earlier_children[&a.to_string()],
            vec![merge.to_string()]
        );
        assert_eq!(
            second.earlier_children[&b.to_string()],
            vec![merge.to_string()]
        );
        assert_eq!(first.commits.len() + second.commits.len(), 53);
    }
}
