import { expect, test } from "@playwright/test";

test("landing page exposes clipboard controls and provider examples", async ({ page }) => {
  await page.goto("/");

  const installCopy = page.getByRole("button", { name: "Copy install command" });
  await expect(installCopy).toBeVisible();
  await expect(installCopy.locator("svg")).toBeVisible();
  await installCopy.click();
  await expect(page.getByRole("button", { name: "Copied to clipboard" }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("npm install tokly-sdk");

  await expect(page.getByRole("heading", { name: "Choose your provider example." })).toBeVisible();
  await expect(page.getByRole("tab", { name: "OpenAI" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Anthropic" }).click();
  const highlightedExample = page.getByTestId("integration-example");
  await expect(highlightedExample).toContainText("fromAnthropicResponse");
  await expect(highlightedExample.locator("pre.shiki")).toHaveCSS("background-color", "rgb(30, 30, 30)");
  const tokenColors = await highlightedExample.locator('span[style*="color"]').evaluateAll((tokens) => (
    [...new Set(tokens.map((token) => getComputedStyle(token).color))]
  ));
  expect(tokenColors.length).toBeGreaterThan(3);

  const exampleCopy = page.getByRole("button", { name: "Copy Anthropic example" });
  await expect(exampleCopy.locator("svg")).toBeVisible();
  await exampleCopy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("fromAnthropicResponse");
});
