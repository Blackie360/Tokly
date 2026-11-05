import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Explore a sample workspace/ })
    .click();
});
test("navigation, project search and weekly summary", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Continue working" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Find a project" }).fill("Piko");
  await expect(
    page.getByRole("button", { name: /Piko Pi Agent.*feat\/streaming/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Care Clarity.*feature\/ml/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Weekly progress", exact: true })
    .click();
  await expect(page.getByText("14 commits across 4 projects")).toBeVisible();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByText("0 commits across 0 projects")).toBeVisible();
});
test("next-step notes persist after reload", async ({ page }) => {
  await page.getByRole("button", { name: /Edit next step/ }).click();
  await page
    .getByRole("textbox", { name: "Where will you pick up next?" })
    .fill("Ship the detector evaluation");
  await page.getByRole("button", { name: "Save next step" }).click();
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ship the detector evaluation").first()).toBeVisible();
});
test("exclusion persists and can be restored", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Projects 4/ }).click();
  await page.getByRole("button", { name: "Exclude from tracking" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Excluded projects" }),
  ).toHaveCount(0);
});
test("native-only actions explain preview limitations", async ({ page }) => {
  await page.getByRole("button", { name: "Open in Visual Studio Code" }).first().click();
  await expect(page.getByRole("alert")).toContainText(
    "available in the desktop app",
  );
});
test("compact viewport has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  for (const name of ["Overview", "Projects", "Weekly progress", "Settings"]) {
    await page
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .first()
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("onboarding and relaunch have no pause controls", async ({ page }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(page.getByRole("button", { name: /Pause tracking|Resume tracking/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Background tracking" })).toHaveCount(0);
    await expect(page.getByText(/Your approved folders are monitored automatically/)).toBeVisible();
    await page.reload();
  }
});
test("background refresh preserves the default project's unsaved note", async ({ page }) => {
  await page.getByRole("button", { name: /Edit next step/ }).click();
  const editor = page.getByRole("textbox", { name: "Where will you pick up next?" });
  await editor.fill("Keep this draft during activity elsewhere");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("tokly-preview-v1")!);
    state.projects.reverse();
    localStorage.setItem("tokly-preview-v1", JSON.stringify(state));
  });
  await page.getByRole("button", { name: "Refresh Git status" }).click();
  await expect(editor).toHaveValue("Keep this draft during activity elsewhere");
  await page.getByRole("button", { name: "Save next step" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tokly-preview-v1")!).projects.find((p: {name: string}) => p.name === "Care Clarity").note);
  expect(saved).toBe("Keep this draft during activity elsewhere");
});

test("continue cards show context and pins survive relaunch", async ({ page }) => {
  const card = page.getByRole("article", {name: "Continue Piko Pi Agent", exact: true});
  await expect(card).toContainText("Test the WhatsApp task interruption flow.");
  await expect(card).toContainText("feat/streaming");
  await expect(card).toContainText("1 changed files");
  await card.getByRole("button", {name: "Pin Piko Pi Agent", exact: true}).click();
  await page.reload();
  await expect(page.getByRole("article").first()).toHaveAttribute("aria-label", "Continue Piko Pi Agent");
  await expect(page.getByRole("button", {name: "Unpin Piko Pi Agent"})).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {name: "Unpin Piko Pi Agent"}).click();
  await page.reload();
  await expect(page.getByRole("button", {name: "Pin Piko Pi Agent", exact: true})).toBeVisible();
});

test("history selection reveals older commits and persists", async ({page}) => {
  await page.getByRole("button", {name: /Projects 4/}).click();
  await page.getByRole("button", {name: "Tokly", exact: true}).click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("tokly-preview-v1")!);
    state.projects.find((p: {name:string}) => p.name === "Tokly").lastCommit = Date.now()/1000 - 20*86400;
    state.commits = state.commits.filter((c: {projectId:string,timestamp:number}) => !c.projectId.endsWith("/tokly") || c.timestamp < Date.now()/1000 - 7*86400);
    localStorage.setItem("tokly-preview-v1", JSON.stringify(state));
  });
  await page.getByRole("button", {name: "Refresh Git status"}).click();
  await expect(page.getByText(/outside the 7-day history window/)).toBeVisible();
  await page.getByLabel("Activity history window", {exact:true}).selectOption("30");
  await expect(page.getByText("Earlier desktop exploration")).toBeVisible();
  await page.reload();
  await page.getByRole("button", {name: /Projects 4/}).click();
  await expect(page.getByLabel("Activity history window", {exact:true})).toHaveValue("30");
  await page.getByRole("button", {name: "Settings", exact:true}).click();
  page.on("dialog", dialog => dialog.accept());
  await page.getByLabel("Keep activity for").selectOption("7");
  await page.getByRole("button", {name: /Projects 4/}).click();
  await expect(page.getByText(/7-day retention limits this history/)).toBeVisible();
});

test("editor choice persists and project actions follow it", async ({page}) => {
  await page.getByRole("button", {name: "Settings", exact:true}).click();
  await expect(page.getByText("Sample editor choices only.", {exact:false})).toBeVisible();
  await page.getByLabel("Preferred editor", {exact:true}).selectOption("dev.zed.Zed");
  await page.reload();
  await expect(page.getByRole("button", {name:"Open in Zed"}).first()).toBeVisible();
  await page.getByRole("button", {name: "Settings", exact:true}).click();
  await expect(page.getByLabel("Preferred editor", {exact:true})).toHaveValue("dev.zed.Zed");
  await page.getByLabel("Preferred editor", {exact:true}).selectOption("finder");
  await page.getByRole("button", {name:"Overview", exact:true}).click();
  await expect(page.getByRole("button", {name:"Open in Finder"}).first()).toBeVisible();
});
test("removed editor is explained and buttons fall back to Finder", async ({page}) => {
  await page.evaluate(() => {const s=JSON.parse(localStorage.getItem("tokly-preview-v1")!);s.preferredEditor="removed.editor";localStorage.setItem("tokly-preview-v1",JSON.stringify(s));});
  await page.reload();
  await expect(page.getByRole("button", {name:"Open in Finder"}).first()).toBeVisible();
  await page.getByRole("button", {name:"Settings", exact:true}).click();
  await expect(page.getByText(/Your saved editor is not installed/)).toBeVisible();
  await page.getByLabel("Preferred editor", {exact:true}).selectOption("auto");
  await page.getByRole("button", {name:"Overview", exact:true}).click();
  await expect(page.getByRole("button", {name:"Open in Visual Studio Code"}).first()).toBeVisible();
});

test("next-step sticky note stays compact beside a long project list", async ({page}) => {
  await page.evaluate(() => {
    const s=JSON.parse(localStorage.getItem("tokly-preview-v1")!);
    s.projects[0].note="A long saved next step. ".repeat(70);
    s.projects.push(...Array.from({length:12},(_,i)=>({...s.projects[1],id:`/sample/${i}`,name:`Project ${i}`})));
    localStorage.setItem("tokly-preview-v1",JSON.stringify(s));
  });
  await page.reload();
  for (const width of [1600,1000,600]) {
    await page.setViewportSize({width,height:900});
    const panel=page.locator(".continue-panel");
    const box=await panel.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(320);
    expect(box!.height).toBeLessThan(430);
    const note=page.getByLabel("Saved next step",{exact:true});
    expect(await note.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await expect(panel.getByRole("button", {name:/Open in/})).toBeVisible();
    await expect(panel.getByRole("button", {name:/Edit next step/})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test("each project offers installed editor shortcuts without changing its default", async ({page}) => {
  const card=page.locator('.resume-actions').first();
  await expect(card.getByRole('button',{name:'Open in Visual Studio Code',exact:true})).toHaveAttribute('title','Open in Visual Studio Code');
  await expect(card.getByRole('button',{name:'Open in Zed',exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Open in Cursor',exact:true})).toHaveCount(0);
  await card.getByRole('button',{name:'Open in Zed',exact:true}).click();
  await expect(page.getByText('Opening local projects is available in the desktop app.')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tokly-preview-v1')!).preferredEditor)).toBe('auto');
  await page.getByRole('button',{name:/Projects 4/}).click();
  await expect(page.locator('.detail-toolbar').getByRole('button',{name:'Open in Zed',exact:true})).toBeVisible();
});

test("all-history graph shows real subjects, merge parents, pagination and reduced motion", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.evaluate(() => {
    const s=JSON.parse(localStorage.getItem("tokly-preview-v1")!);
    const id=s.projects[0].id;
    const sha=(i:number)=>i.toString(16).padStart(40,"0");
    s.commits=Array.from({length:105},(_,i)=>({projectId:id,sha:sha(i),label:i===0?"Merge with a real long commit subject that remains completely readable without truncation — café 🚀 <script>alert(1)</script>":"Old commit "+i,timestamp:1000000000-i,parents:i===0?[sha(1),sha(2)]:i<104?[sha(i+1)]:[],missingParents:[]}));
    s.gitHistory=[{projectId:id,headSha:sha(0),shallow:true,truncated:false}];
    localStorage.setItem("tokly-preview-v1",JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole("button",{name:/Projects 4/}).click();
  await page.getByRole("tab",{name:"Git graph",exact:true}).click();
  await expect(page.getByText("Merge with a real long commit subject that remains completely readable without truncation — café 🚀 <script>alert(1)</script>")).toBeVisible();
  await expect(page.getByText(/Shallow checkout:/)).toBeVisible();
  await expect(page.getByLabel("Activity history window")).toHaveCount(0);
  await expect(page.locator('.commit-graph-row')).toHaveCount(50);
  await page.getByText("Merge · 2 parents",{exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".commit-message script")).toHaveCount(0);
  await expect(page.getByText(/Parent.*0000000000000000000000000000000000000001/)).toBeVisible();
  expect(await page.locator('.commit-graph-row').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button',{name:'Next commits',exact:true}).click();
  await expect(page.getByText('51–100 of 105')).toBeVisible();
  await page.getByRole('button',{name:'Next commits',exact:true}).click();
  await expect(page.locator('.commit-graph-row')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Next commits',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Previous commits',exact:true}).click();
  await expect(page.getByText('51–100 of 105')).toBeVisible();
  await page.setViewportSize({width:600,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("graph distinguishes missing parents and empty repositories", async ({page}) => {
  await page.evaluate(() => {
    const s=JSON.parse(localStorage.getItem("tokly-preview-v1")!);
    const id=s.projects[0].id;
    s.commits=[{projectId:id,sha:'a'.repeat(40),label:'Partial checkout',timestamp:1,parents:['b'.repeat(40)],missingParents:['b'.repeat(40)]}];
    localStorage.setItem("tokly-preview-v1",JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Git graph',exact:true}).click();
  await page.getByText('1 parent · history boundary',{exact:true}).click();
  await expect(page.getByText(/not traversed \(shallow boundary or missing local object\)/)).toBeVisible();
  await page.evaluate(() => {const s=JSON.parse(localStorage.getItem('tokly-preview-v1')!);s.commits=[];localStorage.setItem('tokly-preview-v1',JSON.stringify(s));});
  await page.getByRole('button',{name:'Refresh graph',exact:true}).click();
  await expect(page.getByText('No commits available from local references.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Next commits',exact:true})).toBeDisabled();
});

test("workspace scan reports explain missing repositories and folder access", async ({page}) => {
  await page.evaluate(() => {const s=JSON.parse(localStorage.getItem('tokly-preview-v1')!);s.scans=[{root:s.roots[0],scannedAt:Date.now()/1000,repositoriesFound:0,status:'complete',issues:[]}];localStorage.setItem('tokly-preview-v1',JSON.stringify(s));});
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByText(/No Git repositories found/)).toBeVisible();
  await expect(page.getByText(/database is not encrypted by Tokly/)).toBeVisible();
  await page.evaluate(() => {const s=JSON.parse(localStorage.getItem('tokly-preview-v1')!);s.scans[0].status='permission';s.scans[0].issues=['Permission denied'];localStorage.setItem('tokly-preview-v1',JSON.stringify(s));});
  await page.getByRole('button',{name:'Scan folders again',exact:true}).click();
  await expect(page.getByText('Folder access needed',{exact:true})).toBeVisible();
  await expect(page.getByText(/Tokly will not change permissions for you/)).toBeVisible();
});

test("note drafts recover after immediate reload and autosave after switching projects", async ({page}) => {
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Where will you pick up next?'}).fill('Recovery survives a relaunch');
  await page.reload();
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Where will you pick up next?'})).toHaveValue('Recovery survives a relaunch');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tokly-preview-v1')!).projects[0].note)).toBe('Recovery survives a relaunch');
  await page.getByRole('textbox',{name:'Where will you pick up next?'}).fill('Save this while I resume another project');
  await page.getByRole('button',{name:'Piko Pi Agent',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tokly-preview-v1')!).projects[0].note)).toBe('Save this while I resume another project');
  await page.getByRole('button',{name:'Care Clarity',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Where will you pick up next?'})).toHaveValue('Save this while I resume another project');
});

test("note export includes saved and recovery text without changing notes", async ({page}) => {
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Where will you pick up next?'}).fill('Backup this pending thought');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export note backup',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('Tokly-notes.json');
  const stream=await download.createReadStream();const chunks=[];for await (const chunk of stream!)chunks.push(chunk);
  const backup=JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.format).toBe('Tokly note backup');expect(backup.version).toBe(2);
  const note=backup.notes.find((n:{name:string})=>n.name==='Care Clarity');
  expect(note.recoveryDraft?.text || note.savedNote).toBe('Backup this pending thought');
  await expect(page.getByText('Note backup exported',{exact:true})).toBeVisible();
});

test("installed app icons render with accessible fallback and preserve editor launch targets", async ({page}) => {
  await page.addInitScript(() => {
    Object.assign(window,{isTauri:true,__TAURI_INTERNALS__:{invoke:async(command:string,args:Record<string,unknown>)=>{
      if(command==='snapshot')return JSON.parse(localStorage.getItem('tokly-preview-v1')!);
      if(command==='installed_editors')return [
        {id:'com.microsoft.VSCode',name:'Visual Studio Code',iconDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V0kAAAAASUVORK5CYII='},
        {id:'dev.zed.Zed',name:'Zed',iconDataUrl:'data:image/png;base64,invalid'}
      ];
      if(command==='open_project'){Object.assign(window,{lastEditorLaunch:args});return 'Opened in selected editor';}
      return false;
    }}});
  });
  await page.reload();
  const card=page.locator('.resume-actions').first();
  const vscode=card.getByRole('button',{name:'Open in Visual Studio Code',exact:true});
  await expect(vscode.locator('img')).toBeVisible();
  expect(await vscode.locator('img').evaluate((el:HTMLImageElement)=>el.complete && el.naturalWidth>0)).toBe(true);
  const zed=card.getByRole('button',{name:'Open in Zed',exact:true});
  await expect(zed.locator('.editor-monogram')).toHaveText('Z');
  await expect(zed).toHaveAttribute('title','Open in Zed');
  await zed.click();
  expect(await page.evaluate(()=>Reflect.get(window,'lastEditorLaunch').editorId)).toBe('dev.zed.Zed');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tokly-preview-v1')!).preferredEditor)).toBe('auto');
});


test("colored note stacks preserve legacy text, independent drafts, selection and backups", async ({page}) => {
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Where will you pick up next?'});
  await editor.fill('First peach thought');
  await page.getByRole('button',{name:'Add sticky note',exact:true}).click();
  await expect(editor).toHaveValue('');
  await editor.fill('Second lilac thought 🚀');
  const peach=page.getByRole('button',{name:'Open note 1, Peach',exact:true});
  await peach.focus(); await page.keyboard.press('Enter');
  await expect(editor).toHaveValue('First peach thought');
  await page.getByRole('button',{name:'Open note 2, Lilac',exact:true}).click();
  await expect(editor).toHaveValue('Second lilac thought 🚀');
  await page.getByRole('button',{name:'Piko Pi Agent',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open note 2, Lilac',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Care Clarity',exact:true}).click();
  await expect(editor).toHaveValue('Second lilac thought 🚀');
  await page.reload();
  await page.getByRole('button',{name:/Projects 4/}).click();
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await expect(editor).toHaveValue('Second lilac thought 🚀');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tokly-preview-v1')!).projects[0].notes.map((n:{text:string})=>n.text))).toEqual(['First peach thought','Second lilac thought 🚀']);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export note backup',exact:true}).click();
  const stream=await (await downloaded).createReadStream(); const chunks=[]; for await(const chunk of stream!)chunks.push(chunk);
  const backup=JSON.parse(Buffer.concat(chunks).toString());
  const project=backup.notes.find((n:{name:string})=>n.name==='Care Clarity');
  expect(project.stickyNotes.map((n:{text:string;color:number})=>[n.text,n.color])).toEqual([['First peach thought',0],['Second lilac thought 🚀',1]]);
  expect(project.activeNoteId).toBe(project.stickyNotes[1].id);
});

test('return context explains measurable changes and remembers Resume',async({page})=>{
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('tokly-preview-v1')!);const p=s.projects[0];p.currentContext={branch:'main',headSha:'b'.repeat(40),changedFiles:['new.ts'],observedAt:2};p.notes=[{id:`legacy:${p.id}`,text:p.note,color:0,position:0,context:{branch:'older',headSha:'a'.repeat(40),changedFiles:['old.ts'],observedAt:1}}];localStorage.setItem('tokly-preview-v1',JSON.stringify(s));});
  await page.reload();const card=page.getByRole('article',{name:'Continue Care Clarity'});
  await card.getByText('Context changed since this note was saved',{exact:true}).click();
  await expect(card.getByText('Branch: older → main',{exact:true})).toBeVisible();
  await expect(card.getByText(/This does not mean the note is wrong/)).toBeVisible();
  await card.getByRole('button',{name:'Resume project',exact:true}).click();
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await expect(card.getByText('Same observed context since your last Resume',{exact:true})).toBeVisible();
  await page.reload();await expect(card.getByText('Same observed context since your last Resume',{exact:true})).toBeVisible();
});
