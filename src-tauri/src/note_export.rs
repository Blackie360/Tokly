use std::{fs::{self,OpenOptions},io::Write,path::Path,time::{SystemTime,UNIX_EPOCH}};
// Write beside the destination, sync, then rename: a failed write never truncates an existing backup.
pub fn write_atomic(destination:&Path,content:&str)->Result<(),String> {
    let parent=destination.parent().ok_or("Choose a folder for the backup.")?;
    let nonce=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    let temporary=parent.join(format!(".tokly-notes-{}-{nonce}.tmp",std::process::id()));
    let mut options=OpenOptions::new();options.write(true).create_new(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
    let mut file=options.open(&temporary).map_err(|e|e.to_string())?;
    let result=(||{
        file.write_all(content.as_bytes()).map_err(|e|e.to_string())?;
        file.sync_all().map_err(|e|e.to_string())?;
        fs::rename(&temporary,destination).map_err(|e|e.to_string())
    })();
    if result.is_err() {let _=fs::remove_file(&temporary);}
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_replaces_atomically_and_cleans_up_failed_writes() {
        let folder=std::env::temp_dir().join(format!("tokly-export-test-{}",std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let target=folder.join("notes.json");fs::write(&target,"old").unwrap();
        write_atomic(&target,"new backup").unwrap();assert_eq!(fs::read_to_string(&target).unwrap(),"new backup");
        let directory=folder.join("directory");fs::create_dir_all(&directory).unwrap();
        assert!(write_atomic(&directory,"must fail").is_err());
        assert_eq!(fs::read_dir(&folder).unwrap().count(),2);
        #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777,0o600);}
        fs::remove_dir_all(folder).unwrap();
    }
}
