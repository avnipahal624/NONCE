import { expect, test } from "@playwright/test";

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

    await page.goto("/auth");
    await page.getByRole("button", { name: /continue with sandbox access/i }).click();
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

    await page.goto("/auth");
    await page.getByRole("button", { name: /continue with sandbox access/i }).click();
    await page.goto("/testnet");
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByRole("alert")).toContainText(/Base Sepolia|84532|chain/i);
  });
});
