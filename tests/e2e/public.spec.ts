import { expect, test } from "@playwright/test";

test.describe("public experience", () => {
  test("landing page renders without the preview crash screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText("Preview runtime error");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /protect my wallet|enter|sign in|get started/i }).first(),
    ).toBeVisible();
  });

  test("auth page offers email and explicit sandbox access", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: /sign in or create an account/i })).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with sandbox access/i }),
    ).toBeVisible();
    await expect(page.getByText(/cannot prove wallet ownership/i)).toBeVisible();
  });

  test("protected route preserves returnTo when signed out", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /sign in to continue/i })).toBeVisible();
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/auth\?returnTo=%2Fdashboard/);
  });
});
