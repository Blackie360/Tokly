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
  await expect(page.getByRole("status")).toContainText("Next step saved");
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
  await page.getByLabel("Git history", {exact:true}).selectOption("30");
  await expect(page.getByText("Earlier desktop exploration")).toBeVisible();
  await page.reload();
  await page.getByRole("button", {name: /Projects 4/}).click();
  await expect(page.getByLabel("Git history", {exact:true})).toHaveValue("30");
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
