import {useState} from 'react';
import {call} from './api';
interface Preview {total:number;duplicates:number;projects:{name:string;projectId:string;count:number}[];}
export function RestoreNotes({onRestored}:{onRestored:()=>Promise<void>}) {
  const [content,setContent]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function choose(file?:File) {
    setContent('');setPreview(null);setError('');setMessage('');if(!file)return;
    setBusy(true);
    try {if(file.size>10*1024*1024)throw new Error('Choose a backup smaller than 10 MB.');const text=await file.text();const plan=await call<Preview>('preview_restore',{content:text});setContent(text);setPreview(plan);}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <section className="restore-notes" aria-label="Restore note backup">
    <h3>Restore a note backup</h3>
    <p className="small">Choose a Tokly JSON backup to preview. Restore adds non-empty notes to their original projects; existing notes, selected notes and unsaved drafts stay intact. Duplicate text is skipped, keeping its existing color and context. Colors are reassigned only when already used. Missing projects or stacks exceeding 12 notes stop the entire restore.</p>
    <label className="button secondary">Choose backup<input aria-label="Choose note backup" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/></label>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {preview && <div className="restore-preview" role="region" aria-label="Backup restore preview">
      <p>{preview.total} notes to add · {preview.duplicates} duplicates skipped</p>
      <ul>{preview.projects.map(p=><li key={p.projectId}>{p.name}: {p.count} notes <small>{p.projectId}</small></li>)}</ul>
      <p className="small">Saved text and differing recovery drafts are restored as separate notes. No workspace folders will be opened or added. Empty notes are omitted.</p>
      <button className="button primary" disabled={busy || preview.total===0} onClick={async()=>{setBusy(true);setError('');try{const result=await call<Preview>('restore_notes',{content});setPreview(null);setContent('');setMessage(`Restored ${result.total} notes. Existing notes were preserved.`);await onRestored();}catch(e){setError(String(e));}finally{setBusy(false);}}}>Restore {preview.total} notes</button>
      <button className="button secondary" disabled={busy} onClick={()=>{setPreview(null);setContent('');}}>Cancel restore</button>
    </div>}
  </section>;
}
