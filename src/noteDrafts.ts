export const draftKey = "tokly-note-drafts-v1";
export interface NoteDraft { id: string; text: string; revision: number; updatedAt: number; }
export interface DraftStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; }
export class NoteDrafts {
  drafts: Record<string,NoteDraft> = Object.create(null);
  errors: Record<string,string> = Object.create(null);
  storageError = "";
  private blocked = false;
  private revision = Date.now();
  private pending = new Map<string,Promise<void>>();
  constructor(private storage:DraftStorage, private saveNote:(id:string,text:string)=>Promise<void>, private changed:()=>void, private saved:()=>Promise<void>) {
    try {
      const raw=storage.getItem(draftKey);
      if(raw) {
        const parsed:unknown=JSON.parse(raw);
        if(!Array.isArray(parsed) || !parsed.every(d=>d && typeof d.id==='string' && typeof d.text==='string' && d.text.length<=2000 && typeof d.revision==='number' && typeof d.updatedAt==='number')) throw new Error('Invalid draft recovery data');
        for(const draft of parsed) this.drafts[draft.id]=draft;
      }
    } catch { this.blocked=true; this.storageError="Local draft recovery is unavailable. Existing recovery data was left untouched. Keep this window open until notes are saved."; }
  }
  private persist() {
    if(this.blocked) return;
    try {this.storage.setItem(draftKey,JSON.stringify(Object.values(this.drafts)));this.storageError="";}
    catch {this.storageError="Could not store a recovery draft on this device. Keep this window open until the note is saved, or export a backup.";}
  }
  update(id:string,text:string) {
    this.drafts[id]={id,text,revision:++this.revision,updatedAt:Date.now()};
    delete this.errors[id];this.persist();this.changed();
  }
  discard(id:string) {delete this.drafts[id];delete this.errors[id];this.persist();this.changed();}
  isSaving(id:string) {return this.pending.has(id);}
  save(id:string):Promise<void> {
    const existing=this.pending.get(id);if(existing)return existing;
    const run=async()=>{
      while(this.drafts[id]) {
        const sent=this.drafts[id];
        try {
          await this.saveNote(id,sent.text);
          await this.saved();
          if(this.drafts[id]?.revision===sent.revision) delete this.drafts[id];
          delete this.errors[id];this.persist();this.changed();
        } catch(e) {if(this.drafts[id])this.errors[id]=String(e);this.changed();break;}
      }
    };
    const task=run().finally(()=>{this.pending.delete(id);this.changed();});
    this.pending.set(id,task);this.changed();return task;
  }
}
