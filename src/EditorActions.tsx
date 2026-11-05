import { Folder } from "lucide-react";
import type { Editor } from "./model";

function EditorIcon({ editor }: { editor: Editor }) {
  if (editor.id.startsWith("com.microsoft.VSCode")) return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#38a9ed" d="m17 2 6 3v14l-6 3-10-8-4 3-3-2V9l3-2 4 3zm0 5-7 5 7 5zM3 10v4l2-2z"/></svg>;
  if (editor.name === "Cursor") return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="m4 2 17 10-8 2-4 8z"/><path fill="#8d83a5" d="m4 2 9 12-4 8z"/></svg>;
  if (editor.name === "Zed") return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2" d="M4 5h16L4 19h16M4 10V5m16 14v-5"/></svg>;
  return <span aria-hidden="true" className="editor-monogram">{editor.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span>;
}

export function EditorActions({ editors, disabled, onOpen }: { editors: Editor[]; disabled: boolean; onOpen: (id: string) => void }) {
  return <div className="editor-actions" role="group" aria-label="Open project in">
    <span className="editor-actions-label">Open in</span>
    {editors.map(editor => <button key={editor.id} className="editor-shortcut" disabled={disabled} aria-label={`Open in ${editor.name}`} title={`Open in ${editor.name}`} onClick={() => onOpen(editor.id)}><EditorIcon editor={editor}/></button>)}
    <button className="editor-shortcut" disabled={disabled} aria-label="Open in Finder" title="Open in Finder" onClick={() => onOpen("finder")}><Folder size={20} aria-hidden="true"/></button>
  </div>;
}
