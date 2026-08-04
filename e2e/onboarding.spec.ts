import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_DATABASE_URL, "E2E_DATABASE_URL must point to a migrated disposable PostgreSQL database.");

test("onboarding, ingestion, filters, budgets, and invitations", async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `owner-${suffix}@example.test`;
  const workspace = `E2E Workspace ${suffix}`;
  const project = `Assistant ${suffix}`;

  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Full name").fill("E2E Operator");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(`Safe-${suffix}-password`);
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await page.getByLabel("Workspace name").fill(workspace);
  await page.getByLabel("First project").fill(project);
  await page.getByRole("button", { name: /create workspace/i }).click();

  await expect(page.getByText(/will not be shown again/i)).toBeVisible();
  const projectKey = (await page.locator("[role=status] code").textContent())?.trim();
  expect(projectKey).toMatch(/^tok_live_/);
  const workspaceUrl = new URL(page.url());
  const workspaceBase = workspaceUrl.pathname.replace(/\/projects$/, "");

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

  await page.goto(`${workspaceBase}/overview`);
  await expect(page.getByText("1.4K", { exact: true })).toBeVisible();
  await page.goto(`${workspaceBase}/usage?environment=e2e&feature=browser-test`);
  await expect(page.getByText(eventId)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cost velocity" })).toBeVisible();

  await page.goto(`${workspaceBase}/budgets`);
  await page.getByLabel("Budget name").fill(`E2E budget ${suffix}`);
  await page.getByLabel("Monthly limit (USD)").fill("100");
  await page.getByRole("button", { name: /create budget/i }).click();
  await expect(page.getByRole("heading", { name: `E2E budget ${suffix}` })).toBeVisible();

  await page.goto(`${workspaceBase}/members`);
  const inviteEmail = `member-${suffix}@example.test`;
  await page.getByLabel("Email").fill(inviteEmail);
  await page.getByRole("button", { name: /send invitation/i }).click();
  await expect(page.getByText(new RegExp(inviteEmail))).toBeVisible();
});
