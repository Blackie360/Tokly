use crate::{err, now, Result, Store};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
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
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: &'static str,
    version: u8,
    exported_at: i64,
    notes: Vec<Note>,
}
impl Store {
    pub fn notes_backup(&self, drafts: Vec<Draft>) -> Result<String> {
        if drafts.len() > 10_000 || drafts.iter().any(|d| d.text.chars().count() > 2000) {
            return Err("The note backup is too large. Export fewer drafts.".into());
        }
        let mut drafts: HashMap<_, _> = drafts.into_iter().map(|d| (d.id.clone(), d)).collect();
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
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        for note in &mut notes {
            note.recovery_draft = drafts.remove(&note.project_id);
        }
        for (id, draft) in drafts {
            notes.push(Note {
                project_id: id,
                name: "Recovered draft (project no longer listed)".into(),
                saved_note: None,
                recovery_draft: Some(draft),
            });
        }
        serde_json::to_string_pretty(&Backup {
            format: "Tokly note backup",
            version: 1,
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
                    text: "New 🚀 <script>text</script>".into(),
                    updated_at: 10,
                },
                Draft {
                    id: "gone".into(),
                    text: "Orphan recovery".into(),
                    updated_at: 20,
                },
            ])
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["version"], 1);
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
                text: "x".repeat(2001),
                updated_at: 0
            }])
            .is_err());
    }
}
