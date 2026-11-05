import type { ProjectContext } from './model';
export function contextChanges(previous:ProjectContext,current:ProjectContext):string[] {
  const changes:string[]=[];
  if(previous.branch!==current.branch)changes.push(`Branch: ${previous.branch} → ${current.branch}`);
  if(previous.headSha!==current.headSha)changes.push(`HEAD: ${previous.headSha?.slice(0,7)||'no commit'} → ${current.headSha?.slice(0,7)||'no commit'}`);
  const before=new Set(previous.changedFiles),after=new Set(current.changedFiles);
  const added=[...after].filter(p=>!before.has(p));const removed=[...before].filter(p=>!after.has(p));
  if(added.length||removed.length)changes.push(`Changed-file list: ${added.length} added, ${removed.length} no longer listed`);
  return changes;
}
