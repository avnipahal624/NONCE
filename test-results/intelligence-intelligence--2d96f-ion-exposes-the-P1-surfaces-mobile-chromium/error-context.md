# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: intelligence.spec.ts >> intelligence surfaces without a vault >> navigation exposes the P1 surfaces
- Location: tests/e2e/intelligence.spec.ts:10:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /passport/i }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('link', { name: /passport/i }).first() with timeout 10000ms
  - waiting for getByRole('link', { name: /passport/i }).first()

```

```yaml
- banner:
  - link "NONCE home":
    - /url: /dashboard
    - text: NONCE.
  - button "Notifications"
  - button "Account menu": V
  - text: Sandbox environment Balances, transfers, monitoring and lockdown execution are simulated. No on-chain transaction is submitted and no real funds are involved.
- main:
  - paragraph: Start here
  - heading "No vault is configured on this account" [level=2]
  - paragraph: NONCE will not show a protection claim until the vault, withdrawal rules, guardian quorum and monitoring state actually exist. The onboarding flow creates a sandbox environment first; live Base Sepolia actions stay separate.
  - link "Create a sandbox vault":
    - /url: /onboarding
  - link "See how the safeguards fit together":
    - /url: /how-it-works
  - text: "01"
  - paragraph: Create the vault
  - paragraph: Attach the signer you control. The sandbox never asks for a private key or seed phrase.
  - text: "02"
  - paragraph: Set the rules
  - paragraph: Choose withdrawal limits, a mandatory delay and the guardian quorum for large transfers.
  - text: "03"
  - paragraph: Add recovery
  - paragraph: Confirm three guardians so two can replace a lost or compromised signer after the delay.
  - text: "04"
  - paragraph: Watch for signals
  - paragraph: Decoys and monitor health turn suspicious activity into an explicit response workflow.
- navigation "Mobile navigation":
  - list:
    - listitem:
      - link "Dashboard":
        - /url: /dashboard
    - listitem:
      - link "Copilot":
        - /url: /copilot
    - listitem:
      - link "Finance":
        - /url: /finance
    - listitem:
      - link "Firewall":
        - /url: /firewall
    - listitem:
      - link "Vault":
        - /url: /vault
    - listitem:
      - link "Protection":
        - /url: /protection
    - listitem:
      - link "Response Center":
        - /url: /activity
- region "Notifications alt+T"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | async function signInWithSandbox(page: import("@playwright/test").Page) {
  4  |   await page.goto("/auth");
  5  |   await page.getByRole("button", { name: /continue with sandbox access/i }).click();
  6  |   await expect(page).toHaveURL(/\/dashboard/);
  7  | }
  8  | 
  9  | test.describe("intelligence surfaces without a vault", () => {
  10 |   test("navigation exposes the P1 surfaces", async ({ page }) => {
  11 |     await signInWithSandbox(page);
  12 |     await expect(page.getByRole("link", { name: /copilot/i }).first()).toBeVisible();
  13 |     await expect(page.getByRole("link", { name: /finance/i }).first()).toBeVisible();
  14 |     await expect(page.getByRole("link", { name: /firewall/i }).first()).toBeVisible();
> 15 |     await expect(page.getByRole("link", { name: /passport/i }).first()).toBeVisible();
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  16 |   });
  17 | 
  18 |   test("copilot does not invent findings", async ({ page }) => {
  19 |     await signInWithSandbox(page);
  20 |     await page.goto("/copilot");
  21 |     await expect(
  22 |       page.getByRole("heading", { name: /no vault is configured on this account/i }),
  23 |     ).toBeVisible();
  24 |     await expect(page.locator("body")).not.toContainText(/live protection/i);
  25 |   });
  26 | 
  27 |   test("finance, firewall and passport stay explicit without a vault", async ({ page }) => {
  28 |     await signInWithSandbox(page);
  29 |     await page.goto("/finance");
  30 |     await expect(
  31 |       page.getByRole("heading", { name: /no vault is configured on this account/i }),
  32 |     ).toBeVisible();
  33 |     await page.goto("/firewall");
  34 |     await expect(
  35 |       page.getByRole("heading", { name: /no vault is configured on this account/i }),
  36 |     ).toBeVisible();
  37 |     await page.goto("/passport");
  38 |     await expect(
  39 |       page.getByRole("heading", { name: /no vault is configured on this account/i }),
  40 |     ).toBeVisible();
  41 |   });
  42 | });
  43 | 
```