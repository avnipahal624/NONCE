import { expect, test } from "@playwright/test";

async function signInWithSandbox(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /continue with sandbox access/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("intelligence surfaces without a vault", () => {
  test("navigation exposes the P1 surfaces", async ({ page }) => {
    await signInWithSandbox(page);
    await expect(page.getByRole("link", { name: /copilot/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /finance/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /firewall/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /passport/i }).first()).toBeVisible();
  });

  test("copilot does not invent findings", async ({ page }) => {
    await signInWithSandbox(page);
    await page.goto("/copilot");
    await expect(
      page.getByRole("heading", { name: /no vault is configured on this account/i }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/live protection/i);
  });

  test("finance, firewall and passport stay explicit without a vault", async ({ page }) => {
    await signInWithSandbox(page);
    await page.goto("/finance");
    await expect(
      page.getByRole("heading", { name: /no vault is configured on this account/i }),
    ).toBeVisible();
    await page.goto("/firewall");
    await expect(
      page.getByRole("heading", { name: /no vault is configured on this account/i }),
    ).toBeVisible();
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { name: /no vault is configured on this account/i }),
    ).toBeVisible();
  });
});
