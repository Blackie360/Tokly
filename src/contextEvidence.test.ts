import {describe,it,expect} from 'vitest';
import {contextChanges} from './contextComparison';
const before={branch:'main',headSha:'a'.repeat(40),changedFiles:['one.ts','two.ts'],observedAt:1};
describe('observed context',()=>{
 it('does not mistake order or scan time for changed work',()=>expect(contextChanges(before,{...before,changedFiles:['two.ts','one.ts'],observedAt:10})).toEqual([]));
 it('reports diverged and detached HEAD without inferring intent',()=>expect(contextChanges(before,{branch:'detached bbbbbbb',headSha:'b'.repeat(40),changedFiles:['two.ts','three.ts'],observedAt:2})).toEqual(['Branch: main → detached bbbbbbb','HEAD: aaaaaaa → bbbbbbb','Changed-file list: 1 added, 1 no longer listed']));
 it('handles unborn HEAD',()=>expect(contextChanges(before,{...before,headSha:null})).toContain('HEAD: aaaaaaa → no commit'));
});
