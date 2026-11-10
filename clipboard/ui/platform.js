// The markup and labels are written with macOS key symbols. On Windows and Linux this
// swaps them for key names, renames the menu bar to the tray, and hides Mac-only options.

const IS_MAC = navigator.userAgent.includes("Mac");

const KEY_NAMES = {
  "⌘": "Ctrl+", "⌃": "Ctrl+", "⌥": "Alt+", "⇧": "Shift+",
  "⌫": "Backspace", "⌦": "Delete", "↩": "Enter",
};

/** Rewrites macOS key symbols in a label for the current system, e.g. "⌥⌘⌫" to "Alt+Ctrl+Backspace". */
function keys(text) {
  if (IS_MAC) return text;
  return text
    .replace(/⌥⇧-click/g, "Alt+Shift-click")
    .replace(/⌥-click/g, "Alt-click")
    .replace(/[⌘⌃⌥⇧⌫⌦↩]/g, (symbol) => KEY_NAMES[symbol])
    .replace(/\bmenu bar icon\b/g, "tray icon")
    .replace(/\bmenu icon\b/g, "tray icon")
    .replace(/\bMenu icon\b/g, "Tray icon");
}

if (!IS_MAC) {
  for (const element of document.querySelectorAll(".mac-only")) element.hidden = true;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = keys(node.nodeValue);
    if (text !== node.nodeValue) node.nodeValue = text;
  }
  for (const element of document.querySelectorAll("[title]")) element.title = keys(element.title);
}
