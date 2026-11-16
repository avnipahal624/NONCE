import { expect, test } from "@playwright/test";

async function signInWithSandbox(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /continue with sandbox access/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("sandbox experience", () => {
  test("sandbox sign-in reaches the dashboard", async ({ page }) => {
    await signInWithSandbox(page);
    await expect(page.getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Preview runtime error");
  });

  test("onboarding exposes the sandbox signer path", async ({ page }) => {
    await signInWithSandbox(page);
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: /use a sandbox signer/i })).toBeVisible();
    await expect(page.getByText(/never asks for a private key|private key or seed phrase/i).first()).toBeVisible();
  });

  test("testnet is honest when no deployment is configured", async ({ page }) => {
    await signInWithSandbox(page);
    await page.goto("/testnet");
    await expect(
      page.getByText(/live console is waiting for a deployment/i),
    ).toBeVisible();
    // The missing variable is reported twice: once in a responsive-only summary
    // row and once in the deployment checklist. Assert on the copy the reader
    // actually sees rather than whichever node comes first in the DOM.
    await expect(page.getByText(/no nonce_vault_address/i).filter({ visible: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/0x[a-fA-F0-9]{40}/);
  });
});
