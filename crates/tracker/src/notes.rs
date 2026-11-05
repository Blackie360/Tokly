use crate::{err, now, Result, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickyNote {
    pub id: String,
    pub text: String,
    pub color: usize,
    pub position: usize,
}
impl Store {
    pub fn project_notes(&self, project: &str) -> Result<Vec<StickyNote>> {
        self.db.prepare("SELECT id,text,color,position FROM project_notes WHERE project_id=? ORDER BY position").map_err(err)?
            .query_map([project],|r|Ok(StickyNote{id:r.get(0)?,text:r.get(1)?,color:r.get(2)?,position:r.get(3)?})).map_err(err)?.collect::<std::result::Result<Vec<_>,_>>().map_err(err)
    }
    pub fn add_note(&mut self, project: &str) -> Result<String> {
        let count = self.project_notes(project)?.len();
        if count == 0 {
            return Err("Project not found. Refresh your workspaces.".into());
        }
        if count >= 12 {
            return Err("Each project supports up to 12 distinct-color notes.".into());
        }
        let id = format!("note:{project}:{count}");
        let tx = self.db.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO project_notes VALUES(?,?,'',?,?)",
            params![id, project, count as i64, count as i64],
        )
        .map_err(err)?;
        tx.execute(
            "INSERT OR REPLACE INTO selected_notes VALUES(?,?)",
            params![project, id],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(id)
    }
    pub fn select_note(&mut self, project: &str, note_id: &str) -> Result<()> {
        if !self.project_notes(project)?.iter().any(|n| n.id == note_id) {
            return Err("This note does not belong to this project.".into());
        }
        self.db
            .execute(
                "INSERT OR REPLACE INTO selected_notes VALUES(?,?)",
                params![project, note_id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn save_sticky_note(&mut self, project: &str, note_id: &str, text: &str) -> Result<()> {
        if text.chars().count() > 2000 {
            return Err("Keep notes under 2,000 characters.".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        if tx
            .execute(
                "UPDATE project_notes SET text=? WHERE id=? AND project_id=?",
                params![text, note_id, project],
            )
            .map_err(err)?
            == 0
        {
            return Err("Note not found in this project.".into());
        }
        if note_id == format!("legacy:{project}") {
            tx.execute(
                "UPDATE projects SET note=? WHERE id=?",
                params![text, project],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(())
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    #[serde(default)]
    pub note_id: Option<String>,
    pub text: String,
    pub updated_at: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    project_id: String,
    name: String,
    saved_note: Option<String>,
    recovery_draft: Option<Draft>,
    sticky_notes: Vec<StickyBackup>,
    active_note_id: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StickyBackup {
    #[serde(flatten)]
    note: StickyNote,
    recovery_draft: Option<Draft>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: &'static str,
    version: u8,
    exported_at: i64,
    notes: Vec<Note>,
}
fn key(id: &str, note_id: Option<&str>) -> String {
    serde_json::json!([id, note_id.unwrap_or(&format!("legacy:{id}"))]).to_string()
}

impl Store {
    pub fn notes_backup(&self, drafts: Vec<Draft>) -> Result<String> {
        if drafts.len() > 10_000 || drafts.iter().any(|d| d.text.chars().count() > 2000) {
            return Err("The note backup is too large. Export fewer drafts.".into());
        }
        let mut drafts: HashMap<_, _> = drafts
            .into_iter()
            .map(|d| (key(&d.id, d.note_id.as_deref()), d))
            .collect();
        let mut notes = self
            .db
            .prepare("SELECT id,name,note FROM projects ORDER BY name,id")
            .map_err(err)?
            .query_map([], |row| {
                Ok(Note {
                    project_id: row.get(0)?,
                    name: row.get(1)?,
                    saved_note: Some(row.get(2)?),
                    recovery_draft: None,
                    sticky_notes: vec![],
                    active_note_id: None,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        for note in &mut notes {
            note.active_note_id = self
                .db
                .query_row(
                    "SELECT note_id FROM selected_notes WHERE project_id=?",
                    [&note.project_id],
                    |r| r.get(0),
                )
                .ok();
            for sticky in self.project_notes(&note.project_id)? {
                let recovery = drafts.remove(&key(&note.project_id, Some(&sticky.id)));
                if sticky.position == 0 {
                    note.recovery_draft = recovery.clone();
                }
                note.sticky_notes.push(StickyBackup {
                    note: sticky,
                    recovery_draft: recovery,
                });
            }
            // Keep legacy draft exports readable even for old rows not yet reconciled.
            if note.sticky_notes.is_empty() {
                note.recovery_draft = drafts.remove(&key(&note.project_id, None));
            }
        }
        for (_, draft) in drafts {
            notes.push(Note {
                project_id: draft.id.clone(),
                name: "Recovered draft (project no longer listed)".into(),
                saved_note: None,
                recovery_draft: Some(draft),
                sticky_notes: vec![],
                active_note_id: None,
            });
        }
        serde_json::to_string_pretty(&Backup {
            format: "Tokly note backup",
            version: 2,
            exported_at: now(),
            notes,
        })
        .map_err(err)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_keeps_saved_and_pending_notes_separate_including_orphans() {
        let store =
            Store::from_connection(rusqlite::Connection::open_in_memory().unwrap()).unwrap();
        store
            .db
            .execute(
                "INSERT INTO projects(id,name,note) VALUES('p','Project','Saved café')",
                [],
            )
            .unwrap();
        let json = store
            .notes_backup(vec![
                Draft {
                    id: "p".into(),
                    note_id: None,
                    text: "New 🚀 <script>text</script>".into(),
                    updated_at: 10,
                },
                Draft {
                    id: "gone".into(),
                    note_id: None,
                    text: "Orphan recovery".into(),
                    updated_at: 20,
                },
            ])
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["version"], 2);
        assert_eq!(parsed["notes"][0]["savedNote"], "Saved café");
        assert_eq!(
            parsed["notes"][0]["recoveryDraft"]["text"],
            "New 🚀 <script>text</script>"
        );
        assert_eq!(
            parsed["notes"][1]["recoveryDraft"]["text"],
            "Orphan recovery"
        );
        assert!(store
            .notes_backup(vec![Draft {
                id: "p".into(),
                note_id: None,
                text: "x".repeat(2001),
                updated_at: 0
            }])
            .is_err());
    }
}

#[cfg(test)]
mod stack_tests {
    use super::*;
    #[test]
    fn migrates_legacy_notes_and_keeps_project_stacks_selection_and_backups_separate() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("notes.db");
        let store = Store::open(&path).unwrap();
        store.db.execute("INSERT INTO projects(id,name,note) VALUES('p','Project','Original café'),('q','Other','Other original')",[]).unwrap();
        drop(store);
        let mut store = Store::open(&path).unwrap();
        let legacy = store.project_notes("p").unwrap();
        assert_eq!(legacy.len(), 1);
        assert_eq!(legacy[0].text, "Original café");
        assert_eq!(legacy[0].color, 0);
        let second = store.add_note("p").unwrap();
        store
            .save_sticky_note("p", &second, "Second thought 🚀")
            .unwrap();
        assert!(store
            .save_sticky_note("q", &second, "Wrong project")
            .is_err());
        assert!(store.select_note("q", &second).is_err());
        let json = store
            .notes_backup(vec![Draft {
                id: "p".into(),
                note_id: Some(second.clone()),
                text: "Pending second note".into(),
                updated_at: 1,
            }])
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let project = parsed["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["projectId"] == "p")
            .unwrap();
        assert_eq!(project["stickyNotes"][0]["text"], "Original café");
        assert_eq!(
            project["stickyNotes"][1]["recoveryDraft"]["text"],
            "Pending second note"
        );
        drop(store);
        let mut restored = Store::open(&path).unwrap();
        let snap = restored.snapshot().unwrap();
        let p = snap.projects.iter().find(|p| p.id == "p").unwrap();
        assert_eq!(p.active_note_id, second);
        assert_eq!(p.note, "Second thought 🚀");
        assert_eq!(p.notes.len(), 2);
        assert_eq!(
            restored.project_notes("q").unwrap()[0].text,
            "Other original"
        );
        restored.save_note("p", "Recovered legacy draft").unwrap();
        assert_eq!(
            restored.project_notes("p").unwrap()[0].text,
            "Recovered legacy draft"
        );
        assert_eq!(
            restored.project_notes("p").unwrap()[1].text,
            "Second thought 🚀"
        );
        for _ in 2..12 {
            restored.add_note("p").unwrap();
        }
        let notes = restored.project_notes("p").unwrap();
        assert_eq!(
            notes
                .iter()
                .map(|n| n.color)
                .collect::<std::collections::HashSet<_>>()
                .len(),
            12
        );
        assert!(restored.add_note("p").is_err());
    }
}
