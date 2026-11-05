import {expect,it} from 'vitest';
import {NoteDrafts,draftKey} from './noteDrafts';
const storage=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
it('recovers drafts immediately and serializes edits made during a save',async()=>{
  const disk=storage();const writes:string[]=[];let release!:()=>void;
  const manager=new NoteDrafts(disk,async(_id,text)=>{writes.push(text);if(writes.length===1)await new Promise<void>(r=>{release=r;});},()=>{},async()=>{});
  manager.update('one','First');
  const recovered=new NoteDrafts(disk,async()=>{},()=>{},async()=>{});
  expect(recovered.drafts.one.text).toBe('First');
  const saving=manager.save('one');manager.update('one','Newest');release();await saving;
  expect(writes).toEqual(['First','Newest']);expect(manager.drafts.one).toBeUndefined();expect(JSON.parse(disk.getItem(draftKey)!)).toEqual([]);
});
it('keeps failed drafts and saves each project independently on retry',async()=>{
  const disk=storage();let fail=true;const notes:Record<string,string>={};
  const manager=new NoteDrafts(disk,async(id,text)=>{if(fail)throw Error('Database locked');notes[id]=text;},()=>{},async()=>{});
  manager.update('one','Keep');manager.update('two','Also keep');await manager.save('one');
  expect(manager.errors.one).toContain('Database locked');expect(manager.drafts.one.text).toBe('Keep');
  fail=false;await Promise.all([manager.save('one'),manager.save('two')]);expect(notes).toEqual({one:'Keep',two:'Also keep'});
});
it('does not overwrite unreadable recovery data and reports storage failures',()=>{
  const disk=storage();disk.setItem(draftKey,'unreadable');
  const manager=new NoteDrafts(disk,async()=>{},()=>{},async()=>{});manager.update('one','New');expect(disk.getItem(draftKey)).toBe('unreadable');expect(manager.storageError).toContain('untouched');
  const failing=new NoteDrafts({getItem:()=>null,setItem:()=>{throw Error('quota');}},async()=>{},()=>{},async()=>{});failing.update('one','Keep');expect(failing.storageError).toContain('Could not store');expect(failing.drafts.one.text).toBe('Keep');
});
it('explicitly discarded drafts are removed from recovery storage',()=>{
  const disk=storage();const manager=new NoteDrafts(disk,async()=>{},()=>{},async()=>{});
  manager.update('one','Delete with workspace');manager.update('two','Keep other project');manager.discard('one');
  const recovered=new NoteDrafts(disk,async()=>{},()=>{},async()=>{});
  expect(recovered.drafts.one).toBeUndefined();expect(recovered.drafts.two.text).toBe('Keep other project');
});
