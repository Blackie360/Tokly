import { expect, test } from "@playwright/test";

test("demo dashboard exposes the operational overview", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /monthly guardrails/i })).toBeVisible();
  await expect(page.getByText(/month-to-date spend/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /create workspace/i })).toBeVisible();
});

test("dark theme remains available and persists on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await page.getByRole("button", { name: /switch to dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
