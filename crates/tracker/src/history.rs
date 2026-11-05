//! Bounded, local HEAD ancestry with explicit parent IDs and topological ordering.
use git2::{Oid, Repository};
use std::collections::{BinaryHeap, HashMap, HashSet};

pub struct Entry {
    pub sha: String,
    pub label: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub missing: Vec<String>,
}
pub struct History {
    pub entries: Vec<Entry>,
    pub truncated: bool,
}

pub fn read(repo: &Repository, head: Option<Oid>, limit: usize) -> History {
    read_roots(repo, head.into_iter().collect(), limit)
}
pub fn read_roots(repo: &Repository, heads: Vec<Oid>, limit: usize) -> History {
    let shallow: HashSet<Oid> = std::fs::read_to_string(repo.commondir().join("shallow"))
        .unwrap_or_default()
        .lines()
        .filter_map(|line| Oid::from_str(line.trim()).ok())
        .collect();
    let mut pending = heads;
    let mut visited = HashSet::new();
    let mut entries = HashMap::new();
    while let Some(oid) = pending.pop() {
        if visited.contains(&oid) {
            continue;
        }
        if visited.len() >= limit {
            pending.push(oid);
            break;
        }
        visited.insert(oid);
        if let Ok(commit) = repo.find_commit(oid) {
            // libgit2 hides parents at shallow boundaries. Preserve the real ordered
            // IDs from the local commit header so a boundary is never drawn as a root.
            let parents: Vec<_> = if shallow.contains(&oid) {
                repo.odb()
                    .ok()
                    .and_then(|odb| {
                        odb.read(oid).ok().map(|object| {
                            String::from_utf8_lossy(object.data())
                                .split("\n\n")
                                .next()
                                .unwrap_or_default()
                                .lines()
                                .filter_map(|line| {
                                    line.strip_prefix("parent ")
                                        .and_then(|s| Oid::from_str(s).ok())
                                })
                                .collect()
                        })
                    })
                    .unwrap_or_default()
            } else {
                commit.parent_ids().collect()
            };
            if !shallow.contains(&oid) {
                pending.extend(parents.iter().rev().copied());
            }
            let missing = parents
                .iter()
                .filter(|p| shallow.contains(&oid) || repo.find_commit(**p).is_err())
                .map(ToString::to_string)
                .collect();
            entries.insert(
                oid.to_string(),
                Entry {
                    sha: oid.to_string(),
                    label: commit.summary().unwrap_or("Commit").into(),
                    timestamp: commit.time().seconds(),
                    parents: parents.iter().map(ToString::to_string).collect(),
                    missing,
                },
            );
        }
    }
    let truncated = pending.iter().any(|oid| !visited.contains(oid));
    // Children always precede their parents, even with skewed author/committer clocks.
    let mut children: HashMap<String, usize> = entries.keys().map(|sha| (sha.clone(), 0)).collect();
    for entry in entries.values() {
        for parent in &entry.parents {
            if let Some(count) = children.get_mut(parent) {
                *count += 1;
            }
        }
    }
    let mut ready = BinaryHeap::new();
    for (sha, count) in &children {
        if *count == 0 {
            ready.push((entries[sha].timestamp, sha.clone()));
        }
    }
    let mut ordered = Vec::with_capacity(entries.len());
    while let Some((_, sha)) = ready.pop() {
        let entry = entries
            .remove(&sha)
            .expect("each ready commit is visited once");
        for parent in &entry.parents {
            if let Some(count) = children.get_mut(parent) {
                *count -= 1;
                if *count == 0 {
                    ready.push((entries[parent].timestamp, parent.clone()));
                }
            }
        }
        ordered.push(entry);
    }
    History {
        entries: ordered,
        truncated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn add(repo: &Repository, parents: &[Oid], label: &str, time: i64) -> Oid {
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig =
            git2::Signature::new("Test", "test@example.com", &git2::Time::new(time, 0)).unwrap();
        let parents: Vec<_> = parents
            .iter()
            .map(|oid| repo.find_commit(*oid).unwrap())
            .collect();
        repo.commit(
            None,
            &sig,
            &sig,
            label,
            &tree,
            &parents.iter().collect::<Vec<_>>(),
        )
        .unwrap()
    }
    #[test]
    fn real_merge_is_topological_despite_clock_skew_and_bounded() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let root = add(&repo, &[], "Root", 400);
        let main = add(&repo, &[root], "Main", 200);
        let side = add(&repo, &[root], "Side", 300);
        let merge = add(&repo, &[main, side], "Merge actual subject", 100);
        let history = read(&repo, Some(merge), 10_000);
        assert_eq!(history.entries.len(), 4);
        assert_eq!(history.entries[0].sha, merge.to_string());
        assert_eq!(
            history.entries[0].parents,
            vec![main.to_string(), side.to_string()]
        );
        assert_eq!(history.entries.last().unwrap().sha, root.to_string());
        assert!(!history.truncated);
        let bounded = read(&repo, Some(merge), 2);
        assert_eq!(bounded.entries.len(), 2);
        assert!(bounded.truncated);
    }
    #[test]
    fn shallow_and_missing_objects_are_explicit_boundaries() {
        let temp = tempfile::tempdir().unwrap();
        let repo = Repository::init(temp.path()).unwrap();
        let root = add(&repo, &[], "Root", 1);
        let tip = add(&repo, &[root], "Tip", 2);
        std::fs::write(repo.path().join("shallow"), format!("{tip}\n")).unwrap();
        let history = read(&repo, Some(tip), 10_000);
        assert_eq!(history.entries.len(), 1);
        assert_eq!(history.entries[0].missing, vec![root.to_string()]);
        let missing = "1111111111111111111111111111111111111111";
        let tree = repo.index().unwrap().write_tree().unwrap();
        let raw = format!("tree {tree}\nparent {missing}\nauthor Test <test@example.com> 3 +0000\ncommitter Test <test@example.com> 3 +0000\n\nBroken ancestry\n");
        let oid = repo
            .odb()
            .unwrap()
            .write(git2::ObjectType::Commit, raw.as_bytes())
            .unwrap();
        let history = read(&repo, Some(oid), 10_000);
        assert_eq!(history.entries.len(), 1);
        assert_eq!(history.entries[0].missing, vec![missing.to_string()]);
    }
}
