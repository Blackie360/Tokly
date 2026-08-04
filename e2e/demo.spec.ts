import { expect, test } from "@playwright/test";

test("demo dashboard exposes the operational overview", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /monthly guardrails/i })).toBeVisible();
  await expect(page.getByText(/month-to-date spend/i)).toBeVisible();
  await expect(page.getByText(/pricing coverage/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /budget alert history/i })).toBeVisible();
  await expect(page.getByText(/platform monthly reached 50%/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /create workspace/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /create workspace/i }).first()).toHaveAttribute("href", "/sign-in?mode=sign-up");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.getByRole("link", { name: /usage/i }).click();
  await expect(page).toHaveURL(/#usage$/);
  await expect(page.getByRole("link", { name: /usage/i })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
});

test("dark theme remains available and persists on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await page.getByRole("button", { name: /switch to dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("account creation mode is deep-linkable", async ({ page }) => {
  await page.goto("/sign-in?mode=sign-up");
  await expect(page.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByRole("tab", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
});
