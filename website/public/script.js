'use strict';
// Fictional, in-memory examples. No project access, persistence, or network calls.
const projects = {
  studio: {name:'Studio',branch:'feat/components',changes:'3 changed files',files:[['Button.tsx','M'],['tokens.css','M'],['Button.test.tsx','A']],note:'Finish the button states.',commit:'Add the color tokens'},
  orbit: {name:'Orbit',branch:'main',changes:'Working tree clean',files:[],note:'Slow the orbit down.',commit:'Make the planets responsive'},
  notes: {name:'Fieldnotes',branch:'feat/journal',changes:'2 changed files',files:[['journal.css','M'],['first-entry.md','A']],note:'Write the journal intro.',commit:'Create the journal layout'}
};
const byId = id => document.getElementById(id);
const text = (id,value) => { byId(id).textContent=value; };
const tabs = [...document.querySelectorAll('[data-project]')];
const range=byId('thread-range'), scene=byId('desk-scene'), ticket=byId('return-ticket');
const continueButton=byId('continue-button');
let current='studio';
let assembled=false;
let continued=false;
function resetContinuation(){continued=false;byId('continue-result').hidden=true;continueButton.hidden=false;continueButton.setAttribute('aria-expanded','false');text('ticket-state','CONTEXT REASSEMBLED');}
function setProgress(value,announce=false){
  const progress=Math.max(0,Math.min(100,Number(value)||0));
  range.value=String(progress);
  scene.style.setProperty('--p',String(progress/100));
  text('progress-label',`${String(progress).padStart(2,'0')} / 100`);
  const nowAssembled=progress===100;
  ticket.hidden=!nowAssembled;
  range.setAttribute('aria-valuetext',nowAssembled?`${projects[current].name} context reassembled. Continue working is available above.`:`${progress}% reassembled. Move right to bring the context together.`);
  text('restore-label',nowAssembled?(continued?'Start again':'Continue working'):'Bring it back');
  scene.classList.toggle('is-assembled',nowAssembled);
  document.querySelectorAll('.artifact').forEach(artifact=>{artifact.setAttribute('aria-hidden',String(nowAssembled));artifact.inert=nowAssembled;});
  if(!nowAssembled)resetContinuation();
  if(nowAssembled&&!assembled)text('demo-status',`${projects[current].name} context reassembled. Branch, changes and next step are together. Continue working is now available.`);
  else if(announce)text('demo-status',nowAssembled?'Context reassembled.':'Context scattered. Use the slider or Bring it back to reassemble.');
  assembled=nowAssembled;
}
function selectProject(key,focus=false){
  current=key;const p=projects[key];
  tabs.forEach(tab=>{const selected=tab.dataset.project===key;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus();});
  byId('project-panel').setAttribute('aria-labelledby',`tab-${key}`);
  text('branch-name',p.branch);text('branch-project',`${p.name} / your local project`);text('change-count',p.changes);text('project-note',p.note);text('recent-commit',p.commit);text('ticket-project',`${p.name}.`);text('ticket-branch',`${p.branch} · ${p.changes}`);text('ticket-note',p.note);
  const list=byId('changed-files');list.replaceChildren();
  if(p.files.length){for(const [name,state]of p.files){const row=document.createElement('li'),file=document.createElement('span'),status=document.createElement('span');file.textContent=name;status.textContent=state;row.append(file,status);list.append(row);}}
  else{const row=document.createElement('li');row.textContent='All changes committed.';list.append(row);}
  setProgress(0);resetContinuation();
  text('demo-status',`${p.name} example selected. Pull the slider to bring its context together.`);
}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectProject(tab.dataset.project));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectProject(tabs[next].dataset.project,true);});});
range.addEventListener('input',()=>setProgress(range.value));
function continueProject(){continued=true;byId('continue-result').hidden=false;continueButton.setAttribute('aria-expanded','true');continueButton.hidden=true;text('ticket-state','YOUR THREAD, PICKED UP');text('restore-label','Start again');byId('continue-title').focus();}
byId('restore-button').addEventListener('click',()=>{if(continued){setProgress(0,true);range.focus();}else if(assembled){continueProject();}else{setProgress(100,true);continueButton.focus();}});
continueButton.addEventListener('click',continueProject);
document.querySelectorAll('input[name="chip"]').forEach(input=>input.addEventListener('change',()=>text('chip-hint',`On GitHub, choose the ${input.value==='silicon'?'Apple Silicon':'Intel'} asset.`)));
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
scene.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType!=='mouse')return;const rect=scene.getBoundingClientRect();scene.style.setProperty('--mx',String((event.clientX-rect.left)/rect.width-.5));scene.style.setProperty('--my',String((event.clientY-rect.top)/rect.height-.5));});
const clearParallax=()=>{scene.style.setProperty('--mx','0');scene.style.setProperty('--my','0');};
scene.addEventListener('pointerleave',clearParallax);reduced.addEventListener('change',clearParallax);
document.querySelectorAll('[data-project], #thread-range, #restore-button, #continue-button, input[name="chip"]').forEach(control=>{control.disabled=false;});
