//! Restore appends validated notes to already known projects. It never opens backup paths.
use crate::{context::Context, err, notes::Draft, Result, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: String,
    version: u8,
    notes: Vec<ProjectBackup>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBackup {
    project_id: String,
    #[serde(default)]
    saved_note: Option<String>,
    #[serde(default)]
    recovery_draft: Option<Draft>,
    #[serde(default)]
    sticky_notes: Vec<ImportedNote>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedNote {
    text: String,
    #[serde(default)]
    color: usize,
    #[serde(default)]
    context: Option<Context>,
    #[serde(default)]
    recovery_draft: Option<Draft>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub projects: Vec<ProjectPreview>,
    pub total: usize,
    pub duplicates: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPreview {
    pub name: String,
    pub project_id: String,
    pub count: usize,
}
struct Plan {
    preview: RestorePreview,
    notes: Vec<(String, ImportedNote)>,
}
fn validate(note: &ImportedNote) -> Result<()> {
    if note.text.chars().count() > 2000 || note.color >= 12 {
        return Err("Backup contains an invalid note length or color.".into());
    }
    if let Some(c) = &note.context {
        if c.branch.len() > 4096
            || c.changed_files.len() > 100_000
            || c.changed_files.iter().any(|p| p.len() > 32768)
            || c.head_sha
                .as_ref()
                .is_some_and(|s| s.len() != 40 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err("Backup contains invalid Git context.".into());
        }
    }
    Ok(())
}
impl Store {
    fn restore_plan(&self, content: &str) -> Result<Plan> {
        if content.len() > 10 * 1024 * 1024 {
            return Err("Choose a note backup smaller than 10 MB.".into());
        }
        let backup: Backup = serde_json::from_str(content)
            .map_err(|_| "This file is not a valid Tokly note backup.".to_string())?;
        if backup.format != "Tokly note backup" || ![1, 2].contains(&backup.version) {
            return Err("Unsupported Tokly backup format or version.".into());
        }
        if backup.notes.len() > 10_000 {
            return Err("Backup has too many projects.".into());
        }
        let mut candidates = Vec::new();
        for project in backup.notes {
            let mut notes = project.sticky_notes;
            if notes.is_empty() {
                if let Some(text) = project.saved_note {
                    notes.push(ImportedNote {
                        text,
                        color: 0,
                        context: None,
                        recovery_draft: None,
                    });
                }
            }
            if let Some(draft) = project.recovery_draft {
                notes.push(ImportedNote {
                    text: draft.text,
                    color: 0,
                    context: None,
                    recovery_draft: None,
                });
            }
            for mut note in notes {
                validate(&note)?;
                if let Some(draft) = note.recovery_draft.take() {
                    let recovery = ImportedNote {
                        text: draft.text,
                        color: note.color,
                        context: None,
                        recovery_draft: None,
                    };
                    validate(&recovery)?;
                    if !recovery.text.is_empty() && recovery.text != note.text {
                        candidates.push((project.project_id.clone(), recovery));
                    }
                }
                if !note.text.is_empty() {
                    candidates.push((project.project_id.clone(), note));
                }
            }
        }
        let mut known = HashMap::new();
        let mut counts = HashMap::new();
        let mut names = HashMap::new();
        let mut accepted = Vec::new();
        let mut duplicates = 0;
        for (project, note) in candidates {
            if !known.contains_key(&project) {
                let name:String=self.db.query_row("SELECT name FROM projects WHERE id=?",[&project],|r|r.get(0)).map_err(|_|format!("Backup project is not in Tokly: {project}. Add its original workspace first. No notes were restored."))?;
                let notes = self.project_notes(&project)?;
                counts.insert(project.clone(), notes.len());
                names.insert(project.clone(), name);
                known.insert(
                    project.clone(),
                    notes
                        .into_iter()
                        .map(|n| (n.text, n.context))
                        .collect::<Vec<_>>(),
                );
            }
            let seen = known.get_mut(&project).unwrap();
            // Identical text is already safely represented; keep the existing context and color.
            if seen.iter().any(|(text, _)| text == &note.text) {
                duplicates += 1;
                continue;
            }
            seen.push((note.text.clone(), note.context.clone()));
            let count = counts.get_mut(&project).unwrap();
            *count += 1;
            if *count > 12 {
                return Err(format!("Restoring {} would exceed its 12-note capacity. Existing notes are untouched; the backup remains available.",names[&project]));
            }
            accepted.push((project, note));
        }
        let mut projects: Vec<_> = names
            .into_iter()
            .map(|(id, name)| ProjectPreview {
                count: accepted.iter().filter(|(p, _)| p == &id).count(),
                project_id: id,
                name,
            })
            .collect();
        projects.sort_by(|a, b| a.project_id.cmp(&b.project_id));
        Ok(Plan {
            preview: RestorePreview {
                total: accepted.len(),
                duplicates,
                projects,
            },
            notes: accepted,
        })
    }
    pub fn preview_restore(&self, content: &str) -> Result<RestorePreview> {
        Ok(self.restore_plan(content)?.preview)
    }
    pub fn restore_notes(&mut self, content: &str) -> Result<RestorePreview> {
        let plan = self.restore_plan(content)?; // Revalidate capacity and duplicates against the current database.
        let tx = self.db.transaction().map_err(err)?;
        for (project, note) in plan.notes {
            let position: usize = tx
                .query_row(
                    "SELECT COUNT(*) FROM project_notes WHERE project_id=?",
                    [&project],
                    |r| r.get(0),
                )
                .map_err(err)?;
            let used: HashSet<usize> = tx
                .prepare("SELECT color FROM project_notes WHERE project_id=?")
                .map_err(err)?
                .query_map([&project], |r| r.get(0))
                .map_err(err)?
                .collect::<std::result::Result<_, _>>()
                .map_err(err)?;
            let color = if !used.contains(&note.color) {
                note.color
            } else {
                (0..12)
                    .find(|c| !used.contains(c))
                    .ok_or("No note colors available.")?
            };
            let id = format!("note:{project}:{position}");
            tx.execute(
                "INSERT INTO project_notes VALUES(?,?,?,?,?)",
                params![id, project, note.text, color, position],
            )
            .map_err(err)?;
            if let Some(context) = note.context {
                tx.execute(
                    "INSERT INTO note_context VALUES(?,?)",
                    params![id, serde_json::to_string(&context).map_err(err)?],
                )
                .map_err(err)?;
            }
        }
        tx.commit().map_err(err)?;
        Ok(plan.preview)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        let s = Store::from_connection(db).unwrap();
        s.db.execute(
            "INSERT INTO projects(id,name,note) VALUES('p','Project','Original')",
            [],
        )
        .unwrap();
        s.db.execute(
            "INSERT INTO project_notes VALUES('legacy:p','p','Original',0,0)",
            [],
        )
        .unwrap();
        s
    }
    #[test]
    fn restore_preserves_existing_and_recovers_drafts_idempotently() {
        let mut s = store();
        let backup = r#"{"format":"Tokly note backup","version":2,"notes":[{"projectId":"p","stickyNotes":[{"text":"Original","color":0},{"text":"Saved","color":0,"recoveryDraft":{"id":"p","text":"Pending","updatedAt":1}}]}]}"#;
        assert_eq!(s.preview_restore(backup).unwrap().total, 2);
        assert_eq!(s.project_notes("p").unwrap().len(), 1);
        s.restore_notes(backup).unwrap();
        let notes = s.project_notes("p").unwrap();
        assert_eq!(notes[0].text, "Original");
        assert_eq!(notes.len(), 3);
        assert_ne!(notes[1].color, notes[2].color);
        assert_eq!(s.restore_notes(backup).unwrap().total, 0);
    }
    #[test]
    fn rejects_bad_unknown_and_over_capacity_without_partial_writes() {
        let mut s = store();
        for content in [
            "{}",
            r#"{"format":"Tokly note backup","version":3,"notes":[]}"#,
            r#"{"format":"Tokly note backup","version":1,"notes":[{"projectId":"p","savedNote":"New"},{"projectId":"unknown","savedNote":"Other"}]}"#,
        ] {
            assert!(s.restore_notes(content).is_err());
            assert_eq!(s.project_notes("p").unwrap().len(), 1);
        }
        for _ in 1..12 {
            s.add_note("p").unwrap();
        }
        let v1 = r#"{"format":"Tokly note backup","version":1,"notes":[{"projectId":"p","savedNote":"New"}]}"#;
        assert!(s.restore_notes(v1).is_err());
        assert_eq!(s.project_notes("p").unwrap().len(), 12);
    }
    #[test]
    fn accepts_legacy_backup_and_preserves_context_in_v2_roundtrip() {
        let mut s = store();
        s.restore_notes(r#"{"format":"Tokly note backup","version":1,"notes":[{"projectId":"p","savedNote":"Legacy export"}]}"#).unwrap();
        let context = Context {
            branch: "main".into(),
            head_sha: None,
            changed_files: vec![],
            observed_at: 1,
        };
        s.db.execute(
            "INSERT INTO note_context VALUES('note:p:1',?)",
            [serde_json::to_string(&context).unwrap()],
        )
        .unwrap();
        let backup = s.notes_backup(vec![]).unwrap();
        let mut other = store();
        other.restore_notes(&backup).unwrap();
        assert_eq!(other.project_notes("p").unwrap()[1].context, Some(context));
    }
    #[test]
    fn restore_is_durable_and_revalidates_after_preview() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("restore.db");
        let db = Store::open(&path).unwrap();
        db.db
            .execute(
                "INSERT INTO projects(id,name,note) VALUES('p','Project','Original')",
                [],
            )
            .unwrap();
        drop(db);
        let mut db = Store::open(&path).unwrap();
        let backup = r#"{"format":"Tokly note backup","version":1,"notes":[{"projectId":"p","savedNote":"Recovered"}]}"#;
        assert_eq!(db.preview_restore(backup).unwrap().total, 1);
        db.restore_notes(backup).unwrap();
        drop(db);
        let mut db = Store::open(&path).unwrap();
        assert_eq!(db.project_notes("p").unwrap()[1].text, "Recovered");
        let next = backup.replace("Recovered", "Another");
        assert_eq!(db.preview_restore(&next).unwrap().total, 1);
        for _ in 2..12 {
            db.add_note("p").unwrap();
        }
        assert!(db.restore_notes(&next).is_err());
        assert!(!db
            .project_notes("p")
            .unwrap()
            .iter()
            .any(|n| n.text == "Another"));
    }
}
