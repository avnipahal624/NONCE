import { expect, test } from "@playwright/test";

/**
 * Sandbox sign-in must be observed to finish before navigating away. Leaving the
 * auth page mid-request cancels it, which previously made these tests fail on a
 * sign-in screen instead of on the wallet behaviour they describe.
 */
async function signInWithSandbox(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /continue with sandbox access/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("wallet failure paths", () => {
  test("wallet rejection is surfaced without claiming success", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts") throw new Error("User rejected the request");
          if (method === "eth_chainId") return "0x14a34";
          throw new Error("unexpected request");
        },
      };
    });

    await signInWithSandbox(page);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /connect browser wallet/i }).click();
    await expect(page.getByRole("alert")).toContainText(/rejected/i);
    await expect(page.getByText(/ownership verified by signature/i)).toHaveCount(0);
  });

  test("wrong chain is named before a testnet write", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"];
          if (method === "eth_chainId") return "0x1";
          if (method === "wallet_switchEthereumChain") throw new Error("Chain switch rejected");
          throw new Error("unexpected request");
        },
      };
    });

    await signInWithSandbox(page);
    await page.goto("/testnet");
    await page.getByRole("button", { name: /^connect wallet$/i }).first().click();
    await expect(page.getByRole("alert")).toContainText(/Base Sepolia|84532|chain/i);
  });
});
