'use strict';
// Fictional, in-memory examples. No file access, persistence, or network calls.
const projects = {
  studio: {name: 'Studio', branch: 'feat/components', changes: '3 changed files', files: [['Button.tsx', 'Modified'], ['tokens.css', 'Modified'], ['Button.test.tsx', 'Added']], note: 'Finish the button states. Then make the little things feel good.', next: 'Right. The button states.', commits: ['Add the color tokens', 'Set up the component playground'], pinned: true},
  orbit: {name: 'Orbit', branch: 'main', changes: 'Working tree clean', files: [], note: 'Try the slower orbit animation. Keep the reduced-motion version simple.', next: 'Right. A slower orbit.', commits: ['Make the planets responsive', 'Add keyboard navigation'], pinned: false},
  notes: {name: 'Fieldnotes', branch: 'feat/journal', changes: '2 changed files', files: [['journal.css', 'Modified'], ['first-entry.md', 'Added']], note: 'Write the intro to the new journal page. One good paragraph is enough.', next: 'Right. One good paragraph.', commits: ['Create the journal layout', 'Refine the type scale'], pinned: false}
};
let current = 'studio';
const tabs = [...document.querySelectorAll('[data-project]')];
const byId = id => document.getElementById(id);
const setText = (id, value) => { byId(id).textContent = value; };
const result = byId('return-result');
const continueButton = byId('continue-button');
function renderPin() {
  const project = projects[current];
  const button = byId('pin-button');
  button.classList.toggle('is-pinned', project.pinned);
  button.setAttribute('aria-pressed', String(project.pinned));
  button.setAttribute('aria-label', `${project.pinned ? 'Unpin' : 'Pin'} ${project.name} in this demo`);
  button.querySelector('span').textContent = project.pinned ? 'Pinned' : 'Pin project';
}
function resetResult() {
  result.hidden = true;
  continueButton.setAttribute('aria-expanded', 'false');
  byId('return-studio').classList.remove('is-continued');
}
function selectProject(key, focus = false) {
  current = key;
  const project = projects[key];
  resetResult();
  tabs.forEach(tab => {
    const selected = tab.dataset.project === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  byId('project-panel').setAttribute('aria-labelledby', `tab-${key}`);
  setText('project-name', project.name);
  setText('project-branch', project.branch);
  setText('project-changes', project.changes);
  setText('project-note', project.note);
  setText('continue-heading', project.next);
  setText('commit-one', project.commits[0]);
  setText('commit-two', project.commits[1]);
  setText('result-title', `Back to ${project.name}.`);
  setText('result-note', project.note);
  const list = byId('changed-files');
  list.replaceChildren();
  if (project.files.length) {
    project.files.forEach(([name, state]) => {
      const row = document.createElement('li');
      const filename = document.createElement('span');
      const status = document.createElement('span');
      filename.textContent = name;
      status.textContent = state;
      row.append(filename, status);
      list.append(row);
    });
  } else {
    const row = document.createElement('li');
    row.className = 'clean-state';
    row.textContent = 'All changes committed. Room for the next idea.';
    list.append(row);
  }
  renderPin();
  setText('demo-status', `${project.name} example selected. ${project.changes}. Next step: ${project.note}`);
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectProject(tab.dataset.project));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectProject(tabs[next].dataset.project, true);
  });
});
byId('pin-button').addEventListener('click', () => {
  const project = projects[current];
  project.pinned = !project.pinned;
  renderPin();
  setText('demo-status', `${project.name} ${project.pinned ? 'pinned' : 'unpinned'} in this example only.`);
});
continueButton.addEventListener('click', () => {
  result.hidden = false;
  continueButton.setAttribute('aria-expanded', 'true');
  byId('return-studio').classList.add('is-continued');
  // Move focus to the newly revealed heading. No timed animations or forced scrolling.
  byId('result-title').focus();
});
byId('reset-demo').addEventListener('click', () => {
  resetResult();
  tabs.find(tab => tab.dataset.project === current).focus();
  setText('demo-status', 'Choose another example project to follow its thread.');
});
document.querySelectorAll('input[name="chip"]').forEach(input => input.addEventListener('change', () => {
  const name = input.value === 'silicon' ? 'Apple Silicon' : 'Intel';
  setText('chip-hint', `Have repository access? Choose the ${name} asset on GitHub.`);
}));

// Leave the static example honest and usable if JavaScript is unavailable.
document.querySelectorAll('[data-project], #pin-button, #continue-button, #reset-demo, input[name="chip"]').forEach(control => { control.disabled = false; });

const mobileTabs = window.matchMedia('(max-width: 560px)');
const orientTabs = () => document.querySelector('[role="tablist"]').setAttribute('aria-orientation', mobileTabs.matches ? 'vertical' : 'horizontal');
orientTabs();
mobileTabs.addEventListener('change', orientTabs);
