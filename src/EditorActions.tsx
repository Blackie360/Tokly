import { useState } from "react";
import { Folder } from "lucide-react";
import type { Editor } from "./model";

function EditorIcon({ editor }: { editor: Editor }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (editor.iconDataUrl?.startsWith("data:image/png;base64,") && failedSource !== editor.iconDataUrl) return <img src={editor.iconDataUrl} alt="" aria-hidden="true" className="installed-editor-icon" onError={() => setFailedSource(editor.iconDataUrl || null)}/>;
  return <span aria-hidden="true" className="editor-monogram">{editor.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span>;
}

export function EditorActions({ editors, disabled, onOpen }: { editors: Editor[]; disabled: boolean; onOpen: (id: string) => void }) {
  return <div className="editor-actions" role="group" aria-label="Open project in">
    <span className="editor-actions-label">Open in</span>
    {editors.map(editor => <button key={editor.id} className="editor-shortcut" disabled={disabled} aria-label={`Open in ${editor.name}`} title={`Open in ${editor.name}`} onClick={() => onOpen(editor.id)}><EditorIcon editor={editor}/></button>)}
    <button className="editor-shortcut" disabled={disabled} aria-label="Open in Finder" title="Open in Finder" onClick={() => onOpen("finder")}><Folder size={20} aria-hidden="true"/></button>
  </div>;
}
