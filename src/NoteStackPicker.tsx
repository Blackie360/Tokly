import type { CSSProperties } from "react";
import { activeNote, projectNotes, noteColors, type Project } from "./model";
export function noteStackStyle(project:Project):CSSProperties {
  const active=activeNote(project);
  const underneath=projectNotes(project).filter(n=>n.id!==active.id).slice(0,2);
  return {background:noteColors[active.color]?.value || noteColors[0].value,boxShadow:underneath.map((n,i)=>`${(i+1)*5}px ${(i+1)*6}px 0 ${noteColors[n.color]?.value || noteColors[0].value}`).join(',') || undefined};
}
export function NoteStackPicker({project,busy,compact=false,onSelect}:{project:Project;busy:boolean;compact?:boolean;onSelect:(id:string)=>void}) {
  const notes=projectNotes(project),active=activeNote(project);
  return <div className={compact?"sticky-picker compact":"sticky-picker"} role="group" aria-label={`Sticky notes for ${project.name}`}>
    {notes.map((note,i)=><button key={note.id} type="button" className="sticky-tab" aria-pressed={note.id===active.id} aria-label={`Open note ${i+1}, ${noteColors[note.color]?.name || 'Peach'}`} title={note.text || `Empty note ${i+1}`} disabled={busy} onClick={()=>onSelect(note.id)} style={{background:noteColors[note.color]?.value || noteColors[0].value}}><span>Note {i+1}</span>{!compact && <span className="sticky-preview">{note.text || "A fresh next step…"}</span>}</button>)}
  </div>;
}
