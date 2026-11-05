use crate::{err, Result, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub branch: String,
    pub head_sha: Option<String>,
    pub changed_files: Vec<String>,
    pub observed_at: i64,
}
impl Store {
    pub fn current_context(&self, project: &str) -> Result<Option<Context>> {
        self.read_context("current_context", "project_id", project)
    }
    pub(crate) fn read_context(
        &self,
        table: &str,
        column: &str,
        id: &str,
    ) -> Result<Option<Context>> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .db
            .query_row(
                &format!("SELECT context FROM {table} WHERE {column}=?"),
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        raw.map(|s| serde_json::from_str(&s).map_err(err))
            .transpose()
    }
    pub fn mark_visit(&mut self, project: &str) -> Result<()> {
        let context = self
            .current_context(project)?
            .ok_or("No successful Git scan is available yet. Refresh the project first.")?;
        self.db
            .execute(
                "INSERT OR REPLACE INTO project_visits VALUES(?,?,?)",
                params![
                    project,
                    serde_json::to_string(&context).map_err(err)?,
                    crate::now()
                ],
            )
            .map_err(err)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_notes_have_no_invented_context_and_context_survives_relaunch() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("store.db");
        let store = Store::open(&path).unwrap();
        store
            .db
            .execute(
                "INSERT INTO projects(id,name,note) VALUES('p','Project','Legacy')",
                [],
            )
            .unwrap();
        drop(store);
        let mut store = Store::open(&path).unwrap();
        assert!(store.project_notes("p").unwrap()[0].context.is_none());
        assert!(store.mark_visit("p").is_err());
        let context = Context {
            branch: "main".into(),
            head_sha: Some("a".repeat(40)),
            changed_files: vec!["one.ts".into()],
            observed_at: 1,
        };
        store
            .db
            .execute(
                "INSERT INTO current_context VALUES('p',?)",
                [serde_json::to_string(&context).unwrap()],
            )
            .unwrap();
        store.save_note("p", "Remember this").unwrap();
        store.mark_visit("p").unwrap();
        let changed = Context {
            branch: "feature".into(),
            head_sha: Some("b".repeat(40)),
            changed_files: vec![],
            observed_at: 2,
        };
        store
            .db
            .execute(
                "UPDATE current_context SET context=?",
                [serde_json::to_string(&changed).unwrap()],
            )
            .unwrap();
        drop(store);
        let store = Store::open(&path).unwrap();
        let p = store.snapshot().unwrap().projects.remove(0);
        assert_eq!(p.notes[0].context, Some(context.clone()));
        assert_eq!(p.last_visit_context, Some(context));
        let backup: serde_json::Value =
            serde_json::from_str(&store.notes_backup(vec![]).unwrap()).unwrap();
        assert_eq!(
            backup["notes"][0]["stickyNotes"][0]["context"]["branch"],
            "main"
        );
    }
}
