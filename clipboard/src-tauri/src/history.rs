use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const STRING: &str = "public.utf8-plain-text";
pub const RTF: &str = "public.rtf";
pub const HTML: &str = "public.html";
pub const PNG: &str = "public.png";
pub const TIFF: &str = "public.tiff";
pub const FILE_URL: &str = "public.file-url";

/// Letters usable as pin keys; leaves out ones that clash with editing and app shortcuts.
pub const PIN_KEYS: &str = "bdefghijklmnoprstuy";

pub type Raw = (String, Vec<u8>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Content {
    pub kind: String,
    pub file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub application: Option<String>,
    pub first_copied_at: f64,
    pub last_copied_at: f64,
    pub number_of_copies: u32,
    pub pin: Option<String>,
    pub title: String,
    pub text: Option<String>,
    pub hash: String,
    /// "text", "image" or "file"
    pub kind: String,
    pub thumb: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub contents: Vec<Content>,
}

impl Item {
    fn search_text(&self) -> &str {
        self.text.as_deref().unwrap_or(&self.title)
    }
}

pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

pub struct History {
    dir: PathBuf,
    pub items: Vec<Item>,
}

impl History {
    pub fn load(dir: &Path) -> History {
        let _ = std::fs::create_dir_all(dir.join("blobs"));
        // Copied content is stored as plain files; keep other accounts on this Mac out of it.
        // (Windows profiles are already private to their account.)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
        }
        let items = std::fs::read(dir.join("index.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        History {
            dir: dir.to_path_buf(),
            items,
        }
    }

    fn blob(&self, file: &str) -> PathBuf {
        self.dir.join("blobs").join(file)
    }

    pub fn save(&self) {
        if let Ok(bytes) = serde_json::to_vec(&self.items) {
            let tmp = self.dir.join("index.json.tmp");
            if std::fs::write(&tmp, bytes).is_ok() {
                let _ = std::fs::rename(tmp, self.dir.join("index.json"));
            }
        }
    }

    fn remove_blobs(&self, item: &Item) {
        for content in &item.contents {
            let _ = std::fs::remove_file(self.blob(&content.file));
        }
        if let Some(thumb) = &item.thumb {
            let _ = std::fs::remove_file(self.blob(thumb));
        }
    }

    /// Records a copy. Identical contents bump the existing item instead of adding a new one.
    pub fn add(
        &mut self,
        raw: Vec<Raw>,
        application: Option<String>,
        limit: usize,
        at: f64,
    ) -> Option<String> {
        if raw.is_empty() {
            return None;
        }
        let hash = hash(&raw);
        if let Some(existing) = self.items.iter_mut().find(|i| i.hash == hash) {
            existing.last_copied_at = at;
            existing.number_of_copies += 1;
            if existing.application.is_none() {
                existing.application = application;
            }
            let id = existing.id.clone();
            self.save();
            return Some(id);
        }

        let id = uuid::Uuid::new_v4().to_string();
        let (kind, title, text) = describe(&raw);
        let mut item = Item {
            id: id.clone(),
            application,
            first_copied_at: at,
            last_copied_at: at,
            number_of_copies: 1,
            pin: None,
            title,
            text,
            hash,
            kind: kind.to_string(),
            thumb: None,
            width: None,
            height: None,
            contents: vec![],
        };

        if kind == "image" {
            let source = raw
                .iter()
                .find(|r| r.0 == PNG)
                .or_else(|| raw.iter().find(|r| r.0 == TIFF));
            if let Some(image) = source.and_then(|r| image::load_from_memory(&r.1).ok()) {
                item.width = Some(image.width());
                item.height = Some(image.height());
                let mut png = std::io::Cursor::new(Vec::new());
                let small = image.thumbnail(640, 128);
                if small.write_to(&mut png, image::ImageFormat::Png).is_ok() {
                    let file = format!("{id}-thumb.png");
                    if std::fs::write(self.blob(&file), png.into_inner()).is_ok() {
                        item.thumb = Some(file);
                    }
                }
            }
        }

        for (n, (kind, data)) in raw.iter().enumerate() {
            let file = format!("{id}-{n}");
            if std::fs::write(self.blob(&file), data).is_ok() {
                item.contents.push(Content {
                    kind: kind.clone(),
                    file,
                });
            }
        }
        if item.contents.is_empty() {
            return None;
        }
        self.items.push(item);
        self.trim(limit);
        self.save();
        Some(id)
    }

    pub fn get(&self, id: &str) -> Option<&Item> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn read_contents(&self, id: &str) -> Vec<Raw> {
        let Some(item) = self.get(id) else {
            return vec![];
        };
        item.contents
            .iter()
            .filter_map(|c| {
                std::fs::read(self.blob(&c.file))
                    .ok()
                    .map(|d| (c.kind.clone(), d))
            })
            .collect()
    }

    pub fn thumbnail(&self, id: &str) -> Option<Vec<u8>> {
        let file = self.get(id)?.thumb.clone()?;
        std::fs::read(self.blob(&file)).ok()
    }

    /// Marks an item as just used so it sorts first by last copy time.
    pub fn touch(&mut self, id: &str, at: f64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.last_copied_at = at;
            self.save();
        }
    }

    pub fn delete(&mut self, id: &str) {
        if let Some(pos) = self.items.iter().position(|i| i.id == id) {
            let item = self.items.remove(pos);
            self.remove_blobs(&item);
            self.save();
        }
    }

    pub fn clear(&mut self, including_pinned: bool) {
        let (doomed, kept): (Vec<Item>, Vec<Item>) = std::mem::take(&mut self.items)
            .into_iter()
            .partition(|i| including_pinned || i.pin.is_none());
        for item in &doomed {
            self.remove_blobs(item);
        }
        self.items = kept;
        self.save();
    }

    pub fn toggle_pin(&mut self, id: &str, limit: usize) {
        let used: HashSet<String> = self.items.iter().filter_map(|i| i.pin.clone()).collect();
        let Some(item) = self.items.iter_mut().find(|i| i.id == id) else {
            return;
        };
        if item.pin.is_some() {
            item.pin = None;
        } else {
            let free = PIN_KEYS
                .chars()
                .map(|c| c.to_string())
                .find(|k| !used.contains(k));
            let Some(free) = free else { return };
            item.pin = Some(free);
        }
        self.trim(limit);
        self.save();
    }

    /// Drops the least recently copied unpinned items beyond `limit`.
    pub fn trim(&mut self, limit: usize) {
        let mut unpinned: Vec<(f64, String)> = self
            .items
            .iter()
            .filter(|i| i.pin.is_none())
            .map(|i| (i.last_copied_at, i.id.clone()))
            .collect();
        if unpinned.len() <= limit {
            return;
        }
        unpinned.sort_by(|a, b| b.0.total_cmp(&a.0));
        let doomed: HashSet<String> = unpinned.into_iter().skip(limit).map(|p| p.1).collect();
        let (gone, kept): (Vec<Item>, Vec<Item>) = std::mem::take(&mut self.items)
            .into_iter()
            .partition(|i| doomed.contains(&i.id));
        for item in &gone {
            self.remove_blobs(item);
        }
        self.items = kept;
    }

    pub fn unpinned(&self, sort_by: &str) -> Vec<&Item> {
        let mut list: Vec<&Item> = self.items.iter().filter(|i| i.pin.is_none()).collect();
        match sort_by {
            "firstCopiedAt" => list.sort_by(|a, b| b.first_copied_at.total_cmp(&a.first_copied_at)),
            "numberOfCopies" => list.sort_by(|a, b| {
                b.number_of_copies
                    .cmp(&a.number_of_copies)
                    .then(b.last_copied_at.total_cmp(&a.last_copied_at))
            }),
            _ => list.sort_by(|a, b| b.last_copied_at.total_cmp(&a.last_copied_at)),
        }
        list
    }

    pub fn pinned(&self) -> Vec<&Item> {
        let mut list: Vec<&Item> = self.items.iter().filter(|i| i.pin.is_some()).collect();
        list.sort_by(|a, b| a.pin.cmp(&b.pin));
        list
    }

    pub fn size_on_disk(&self) -> u64 {
        let blobs = std::fs::read_dir(self.dir.join("blobs"))
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter_map(|e| e.metadata().ok())
                    .map(|m| m.len())
                    .sum::<u64>()
            })
            .unwrap_or(0);
        let index = std::fs::metadata(self.dir.join("index.json"))
            .map(|m| m.len())
            .unwrap_or(0);
        blobs + index
    }
}

pub fn hash(raw: &[Raw]) -> String {
    let mut hasher = Sha256::new();
    for (kind, data) in raw {
        hasher.update(kind.as_bytes());
        hasher.update([0u8]);
        hasher.update(data);
    }
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Returns the item kind, its list title and its searchable text.
pub fn describe(raw: &[Raw]) -> (&'static str, String, Option<String>) {
    let files: Vec<String> = raw
        .iter()
        .filter(|r| r.0 == FILE_URL)
        .filter_map(|r| String::from_utf8(r.1.clone()).ok())
        .map(|url| percent_decode(url.trim_start_matches("file://")))
        .collect();
    if !files.is_empty() {
        let names: Vec<&str> = files
            .iter()
            .map(|p| p.trim_end_matches('/').rsplit('/').next().unwrap_or(p))
            .collect();
        return ("file", names.join(", "), Some(files.join("\n")));
    }
    if let Some(text) = raw
        .iter()
        .find(|r| r.0 == STRING)
        .map(|r| String::from_utf8_lossy(&r.1).to_string())
    {
        if !text.is_empty() {
            let title: String = text.chars().take(500).collect();
            let body: String = text.chars().take(20_000).collect();
            return ("text", title, Some(body));
        }
    }
    if raw.iter().any(|r| r.0 == PNG || r.0 == TIFF) {
        return ("image", "Image".into(), None);
    }
    ("text", "Formatted text".into(), None)
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && input.is_char_boundary(i + 1)
            && input.is_char_boundary(i + 3)
        {
            if let Ok(value) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

// ---------------------------------------------------------------------------
// Search

pub fn search<'a>(query: &str, items: Vec<&'a Item>, mode: &str) -> Vec<&'a Item> {
    if query.is_empty() {
        return items;
    }
    match mode {
        "regexp" => match regex::RegexBuilder::new(query)
            .case_insensitive(true)
            .build()
        {
            Ok(re) => items
                .into_iter()
                .filter(|i| re.is_match(i.search_text()))
                .collect(),
            Err(_) => vec![],
        },
        "fuzzy" => {
            let mut scored: Vec<(usize, f64, &Item)> = items
                .into_iter()
                .enumerate()
                .filter_map(|(n, item)| {
                    fuzzy_score(query, item.search_text()).map(|s| (n, s, item))
                })
                .collect();
            scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
            scored.into_iter().map(|s| s.2).collect()
        }
        "mixed" => {
            for fallback in ["exact", "regexp", "fuzzy"] {
                let found = search(query, items.clone(), fallback);
                if !found.is_empty() {
                    return found;
                }
            }
            vec![]
        }
        _ => {
            let needle = query.to_lowercase();
            items
                .into_iter()
                .filter(|i| i.search_text().to_lowercase().contains(&needle))
                .collect()
        }
    }
}

/// Subsequence match; higher is better. Rewards consecutive and early matches.
pub fn fuzzy_score(query: &str, text: &str) -> Option<f64> {
    let needle: Vec<char> = query.to_lowercase().chars().collect();
    if needle.is_empty() {
        return None;
    }
    let (mut score, mut n, mut previous) = (0.0, 0usize, usize::MAX);
    for (i, ch) in text
        .chars()
        .take(2000)
        .flat_map(|c| c.to_lowercase())
        .enumerate()
    {
        if n < needle.len() && ch == needle[n] {
            score += 1.0;
            if previous != usize::MAX && i == previous + 1 {
                score += 2.0;
            }
            if n == 0 {
                score += (3.0 - i as f64 / 10.0).max(0.0);
            }
            previous = i;
            n += 1;
        }
    }
    (n == needle.len()).then(|| score / needle.len() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tokly-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn text(s: &str) -> Vec<Raw> {
        vec![(STRING.to_string(), s.as_bytes().to_vec())]
    }

    #[cfg(unix)]
    #[test]
    fn history_folder_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        History::load(&dir);
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
    }

    #[test]
    fn duplicate_copy_bumps_existing_item() {
        let dir = temp();
        let mut h = History::load(&dir);
        let a = h.add(text("hello"), Some("Notes".into()), 10, 1.0).unwrap();
        h.add(text("world"), None, 10, 2.0).unwrap();
        let again = h.add(text("hello"), None, 10, 3.0).unwrap();
        assert_eq!(a, again);
        assert_eq!(h.items.len(), 2);
        let item = h.get(&a).unwrap();
        assert_eq!(item.number_of_copies, 2);
        assert_eq!(item.first_copied_at, 1.0);
        assert_eq!(item.last_copied_at, 3.0);
        assert_eq!(h.unpinned("lastCopiedAt")[0].id, a);
        assert_eq!(h.unpinned("firstCopiedAt")[0].title, "world");
        assert_eq!(h.unpinned("numberOfCopies")[0].id, a);
    }

    #[test]
    fn limit_drops_oldest_but_keeps_pins() {
        let dir = temp();
        let mut h = History::load(&dir);
        let first = h.add(text("one"), None, 2, 1.0).unwrap();
        h.toggle_pin(&first, 2);
        assert_eq!(h.get(&first).unwrap().pin.as_deref(), Some("b"));
        h.add(text("two"), None, 2, 2.0);
        h.add(text("three"), None, 2, 3.0);
        h.add(text("four"), None, 2, 4.0);
        let titles: Vec<&str> = h
            .unpinned("lastCopiedAt")
            .iter()
            .map(|i| i.title.as_str())
            .collect();
        assert_eq!(titles, ["four", "three"]);
        assert_eq!(h.pinned().len(), 1);
        // Blobs of the trimmed item are gone: one per remaining item.
        assert_eq!(std::fs::read_dir(dir.join("blobs")).unwrap().count(), 3);
    }

    #[test]
    fn persists_and_restores_contents() {
        let dir = temp();
        let id = {
            let mut h = History::load(&dir);
            h.add(
                vec![
                    (STRING.into(), b"rich".to_vec()),
                    (RTF.into(), b"{\\rtf1 rich}".to_vec()),
                ],
                None,
                10,
                1.0,
            )
            .unwrap()
        };
        let h = History::load(&dir);
        let contents = h.read_contents(&id);
        assert_eq!(contents.len(), 2);
        assert_eq!(contents[1], (RTF.to_string(), b"{\\rtf1 rich}".to_vec()));
    }

    #[test]
    fn clear_respects_pins_unless_asked() {
        let dir = temp();
        let mut h = History::load(&dir);
        let a = h.add(text("keep"), None, 10, 1.0).unwrap();
        h.add(text("drop"), None, 10, 2.0);
        h.toggle_pin(&a, 10);
        h.clear(false);
        assert_eq!(h.items.len(), 1);
        h.clear(true);
        assert!(h.items.is_empty());
        assert_eq!(std::fs::read_dir(dir.join("blobs")).unwrap().count(), 0);
    }

    #[test]
    fn describes_files_and_images() {
        let (kind, title, text) = describe(&[
            (FILE_URL.into(), b"file:///Users/me/My%20Doc.txt".to_vec()),
            (FILE_URL.into(), b"file:///tmp/dir/".to_vec()),
        ]);
        assert_eq!((kind, title.as_str()), ("file", "My Doc.txt, dir"));
        assert_eq!(text.unwrap(), "/Users/me/My Doc.txt\n/tmp/dir/");
        assert_eq!(describe(&[(PNG.into(), vec![1, 2, 3])]).0, "image");
    }

    #[test]
    fn image_gets_thumbnail_and_dimensions() {
        let dir = temp();
        let mut h = History::load(&dir);
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(300, 200)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let id = h
            .add(vec![(PNG.into(), png.into_inner())], None, 10, 1.0)
            .unwrap();
        let item = h.get(&id).unwrap();
        assert_eq!((item.width, item.height), (Some(300), Some(200)));
        assert!(h.thumbnail(&id).is_some());
    }

    #[test]
    fn search_modes() {
        let dir = temp();
        let mut h = History::load(&dir);
        h.add(text("Hello World"), None, 10, 1.0);
        h.add(text("order #4521"), None, 10, 2.0);
        h.add(text("how are you"), None, 10, 3.0);
        let all = || h.unpinned("lastCopiedAt");
        let titles = |found: Vec<&Item>| found.iter().map(|i| i.title.clone()).collect::<Vec<_>>();

        assert_eq!(titles(search("WORLD", all(), "exact")), ["Hello World"]);
        assert_eq!(titles(search("#\\d{4}", all(), "regexp")), ["order #4521"]);
        assert!(search("#\\d{4}", all(), "exact").is_empty());
        assert!(search("(", all(), "regexp").is_empty());
        // "Hello World" ranks first: its "wo" is consecutive.
        assert_eq!(
            titles(search("hwo", all(), "fuzzy")),
            ["Hello World", "how are you"]
        );
        assert_eq!(titles(search("hlwd", all(), "mixed")), ["Hello World"]);
        assert_eq!(search("", all(), "exact").len(), 3);
        assert!(fuzzy_score("xyz", "hello").is_none());
    }
}
