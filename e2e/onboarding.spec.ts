import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_DATABASE_URL, "E2E_DATABASE_URL must point to a migrated disposable PostgreSQL database.");

test("onboarding, ingestion, filters, budgets, and invitations", async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `owner-${suffix}@example.test`;
  const workspace = `E2E Workspace ${suffix}`;
  const project = `Assistant ${suffix}`;

  await page.goto("/");
  await page.getByRole("link", { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/sign-in\?mode=sign-up$/);
  await expect(page.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(`Safe-${suffix}-password`);
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page.getByRole("heading", { name: /set up your workspace/i })).toBeVisible();
  await page.getByLabel("Team or company name").fill(workspace);
  await page.getByLabel("App name").fill(project);
  await page.getByRole("button", { name: /create workspace and key/i }).click();

  await expect(page.getByText(/will not be shown again/i)).toBeVisible();
  const projectKey = (await page.getByLabel(new RegExp(`New ${project} write key`, "i")).textContent())?.trim();
  expect(projectKey).toMatch(/^tok_live_/);
  await page.getByRole("button", { name: /copy key/i }).click();
  await expect(page.getByRole("status")).toHaveText(/copied.*copy it again/i);
  await expect(page.getByRole("button", { name: /copy again/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(`connect ${project}`, "i") })).toBeVisible();
  const workspaceUrl = new URL(page.url());
  const workspaceBase = workspaceUrl.pathname.replace(/\/projects$/, "");

  await page.getByRole("button", { name: /check connection/i }).click();
  await expect(page.getByRole("status")).toHaveText(/no event yet/i);
  await expect(page.getByLabel(new RegExp(`New ${project} write key`, "i"))).toBeVisible();

  await page.goto(`${workspaceBase}/overview`);
  await expect(page.getByRole("heading", { name: /send your first usage event/i })).toBeVisible();
  await page.goto(`${workspaceBase}/usage`);
  await expect(page.getByRole("heading", { name: /there is no usage to explore yet/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /apply filters/i })).toHaveCount(0);

  const eventId = `evt_e2e_${suffix}`;
  const response = await request.post("/api/v1/events", {
    headers: { authorization: `Bearer ${projectKey}` },
    data: {
      events: [{
        id: eventId,
        timestamp: new Date().toISOString(),
        provider: "openai",
        model: "e2e-unpriced-model",
        operation: "generation",
        usage: { inputTokens: 1200, outputTokens: 240, cacheReadTokens: 300 },
        costUsd: "0.042",
        dimensions: { environment: "e2e", feature: "browser-test" },
      }],
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ accepted: 1, duplicates: 0 });

  await page.goto(`${workspaceBase}/projects?created=1`);
  await page.getByRole("button", { name: /open dashboard/i }).click();
  await expect(page).toHaveURL(new RegExp(`${workspaceBase}/overview$`));
  await expect(page.getByLabel("Key metrics").getByText("1.4K", { exact: true })).toBeVisible();
  await page.goto(`${workspaceBase}/usage?environment=e2e&feature=browser-test`);
  await expect(page.getByText(eventId)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cost velocity" })).toBeVisible();

  await page.goto(`${workspaceBase}/budgets`);
  await page.getByLabel("Budget name").fill(`E2E budget ${suffix}`);
  await page.getByLabel("Monthly target (USD)").fill("100");
  await page.getByRole("button", { name: /create budget/i }).click();
  await expect(page.getByRole("heading", { name: `E2E budget ${suffix}` })).toBeVisible();

  await page.goto(`${workspaceBase}/members`);
  const inviteEmail = `member-${suffix}@example.test`;
  await page.getByLabel("Email").fill(inviteEmail);
  await page.getByRole("button", { name: /send invitation/i }).click();
  await expect(page.getByText(new RegExp(inviteEmail))).toBeVisible();

  const disposableProject = `Disposable ${suffix}`;
  const disposableEvent = `evt_delete_${suffix}`;
  const disposableBudget = `Disposable budget ${suffix}`;
  await page.goto(`${workspaceBase}/projects`);
  const newProject = page.locator("details").filter({ hasText: "New app" });
  await newProject.getByText("New app", { exact: true }).click();
  await newProject.getByLabel("App name").fill(disposableProject);
  await newProject.getByLabel("Key type").selectOption("test");
  await newProject.getByRole("button", { name: /create app/i }).click();
  await expect(page.getByRole("heading", { name: disposableProject })).toBeVisible();
  const disposableKey = (await page.getByLabel(new RegExp(`New ${disposableProject} write key`, "i")).textContent())?.trim();
  expect(disposableKey).toMatch(/^tok_test_/);

  const disposableResponse = await request.post("/api/v1/events", {
    headers: { authorization: `Bearer ${disposableKey}` },
    data: {
      events: [{
        id: disposableEvent,
        timestamp: new Date().toISOString(),
        provider: "openai",
        model: "e2e-delete-model",
        operation: "generation",
        usage: { inputTokens: 100, outputTokens: 20 },
        dimensions: { environment: "e2e", feature: "delete-test" },
      }],
    },
  });
  expect(disposableResponse.status()).toBe(200);

  await page.goto(`${workspaceBase}/budgets`);
  await page.getByLabel("Budget name").fill(disposableBudget);
  await page.getByLabel("Budget applies to").selectOption("project");
  await page.getByLabel("App").selectOption({ label: disposableProject });
  await page.getByLabel("Monthly target (USD)").fill("25");
  await page.getByRole("button", { name: /create budget/i }).click();
  await expect(page.getByRole("heading", { name: disposableBudget })).toBeVisible();

  await page.goto(`${workspaceBase}/projects?created=1`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${disposableProject} app` }).click();
  await expect(page.getByRole("heading", { name: disposableProject })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /connect your first app/i })).toHaveCount(0);
  await page.goto(`${workspaceBase}/usage`);
  await expect(page.getByText(disposableEvent)).toHaveCount(0);
  await page.goto(`${workspaceBase}/budgets`);
  await expect(page.getByRole("heading", { name: disposableBudget })).toHaveCount(0);
});
