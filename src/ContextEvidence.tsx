import type { ProjectContext } from './model';
import { contextChanges } from './contextComparison';
export function ContextEvidence({previous,current,label}:{previous?:ProjectContext|null;current?:ProjectContext|null;label:string}) {
  if(!previous)return <p className="context-caption">No saved context {label}. Future saves and Resume actions capture it.</p>;
  if(!current)return <p className="context-caption">Current Git context unavailable. Refresh this project before comparing.</p>;
  const changes=contextChanges(previous,current);
  return <details className={`context-evidence ${changes.length?'context-changed':''}`}>
    <summary>{changes.length?`Context changed ${label}`:`Same observed context ${label}`}</summary>
    {changes.length>0 && <ul>{changes.map(change=><li key={change}>{change}</li>)}</ul>}
    <p>Compared scans from {new Date(previous.observedAt*1000).toLocaleString()} and {new Date(current.observedAt*1000).toLocaleString()}. {changes.length?'This does not mean the note is wrong. ':''}Changed-file lists cannot detect further edits within the same files. Tokly does not read their contents.</p>
  </details>;
}
