# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public.spec.ts >> public experience >> landing page renders without the preview crash screen
- Location: tests/e2e/public.spec.ts:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /enter|sign in|get started/i }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('link', { name: /enter|sign in|get started/i }).first() with timeout 10000ms
  - waiting for getByRole('link', { name: /enter|sign in|get started/i }).first()

```

```yaml
- banner:
  - link "NONCE home":
    - /url: /
    - text: NONCE. Your crypto security bank
  - button "Open menu"
- main:
  - text: Sandbox preview · Base Sepolia No real funds. No audited mainnet vault.
  - heading "Your crypto. One step ahead." [level=1]
  - paragraph: A smarter way to protect digital assets with decoy-powered intrusion detection, enforced withdrawal safeguards, and guardian-assisted recovery. Self-custody, with a security layer that acts before a breach becomes a loss.
  - link "Protect my wallet":
    - /url: /auth?returnTo=%2Fonboarding
  - link "See how it works":
    - /url: "#how-it-works"
  - paragraph: 2-of-3
  - paragraph: guardian recovery
  - paragraph: 10 min
  - paragraph: minimum withdrawal delay
  - paragraph: "0"
  - paragraph: private keys held
  - paragraph: Withdrawal guard
  - paragraph: Delay armed
  - paragraph: The NONCE loop
  - heading "Detect the breach. Defend the vault." [level=2]
  - paragraph: Three independent layers, engineered so that no single failure removes your protection. Each layer is useful on its own; together they cover the gap between a stolen key and an executed transfer.
  - text: "01"
  - heading "Detect" [level=3]
  - paragraph: Decoy addresses watch for signatures, nonce changes and contract calls that should never happen. Evidence is hashed and preserved before anyone acts.
  - link "Read the flow":
    - /url: /how-it-works
  - text: "02"
  - heading "Defend" [level=3]
  - paragraph: "A verified high-risk signal can lock the vault: withdrawals and dangerous permission changes are blocked, and queued withdrawals are cancelled."
  - link "Read the flow":
    - /url: /how-it-works
  - text: "03"
  - heading "Recover" [level=3]
  - paragraph: Two of three guardians approve a replacement signer. After the recovery delay, the compromised key is revoked and normal operation resumes.
  - link "Read the flow":
    - /url: /how-it-works
  - paragraph: The problem
  - heading "A stolen key is a signed blank cheque." [level=2]
  - paragraph: Most wallet security stops at the moment of signing. By then, the attacker already has everything they need. NONCE is built around the window between suspicious access and irreversible settlement.
  - heading "One key, total control" [level=3]
  - paragraph: A stolen wallet key can move everything immediately. There is no second opinion and no waiting period unless the wallet enforces one.
  - heading "Irreversible by design" [level=3]
  - paragraph: Confirmed transfers cannot be clawed back. Security has to happen before execution, not after the loss.
  - heading "Silent until it is over" [level=3]
  - paragraph: A normal wallet has no concept of an intrusion. You usually learn about a compromise from the missing balance.
  - paragraph: Smart vault security
  - heading "Rules that live with the assets, not just in the interface." [level=2]
  - paragraph: Withdrawal limits, delays and guardian thresholds belong in the vault, where an attacker with a stolen session cannot quietly switch them off. The interface explains them; the contract enforces them.
  - list:
    - listitem: Per-transaction limits and recipient restrictions
    - listitem: Every withdrawal held in a cancellable pending state
    - listitem: Lockdown blocks withdrawals and dangerous permission changes
    - listitem: A monitoring outage never silently widens access
  - paragraph: "Honest limitation: in this sandbox, vault state and transfers are simulated. Enforced enforcement requires deploying and auditing the reference contract with a real signer architecture."
  - paragraph: Withdrawal lifecycle
  - paragraph: 0.35 ETH to an external wallet
  - text: Held under guard
  - paragraph: Request signed by vault signer
  - text: Done
  - paragraph: Authorization checked before policy evaluation.
  - paragraph: Policy evaluated inside the vault
  - text: Done
  - paragraph: Every request has a delay; at or above 0.1 ETH, two guardian approvals also apply.
  - paragraph: Security window · policy delay
  - text: Active
  - paragraph: You can cancel. Monitoring continues. A confirmed lockdown also cancels it.
  - paragraph: Guardian threshold reached · release
  - text: Pending
  - paragraph: Only when every required condition is satisfied at execution time.
  - text: Monitoring continues during the delay SIM-EXAMPLE
  - paragraph: Signal log
  - text: "Inbound transfer to Decoy #2 Low"
  - paragraph: Recorded as spam. No vault action. Public addresses receive unsolicited tokens.
  - paragraph: 09:41 · simulated
  - text: "Outbound signature from Decoy #2 High"
  - paragraph: Policy forbids signing. Two independent conditions verified before response.
  - paragraph: 09:44 · simulated
  - text: Lockdown requested Action
  - paragraph: Submission tracked separately from confirmation. Latency measured.
  - paragraph: 09:44 · simulated
  - text: Vault locked down Confirmed
  - paragraph: Queued withdrawals cancelled. Guardians notified. Evidence hash stored.
  - paragraph: 09:44 · simulated
  - paragraph: Decoy wallet monitoring
  - heading "An alarm the attacker does not know is ringing." [level=2]
  - paragraph: Decoys are isolated addresses with no role in your vault. Using one is inconsistent with any legitimate workflow, which makes unexpected signatures meaningful evidence rather than noise.
  - list:
    - listitem: Unsolicited token transfers are recorded, never escalated
    - listitem: Signed transactions and nonce changes are the strong signals
    - listitem: Duplicate suppression and cooldowns stop lockout spam
    - listitem: Decoys do not attract every attacker, and are never marketed that way
  - paragraph: Detection is not proof of theft. Every alert shows what happened, why it was flagged, what evidence exists, and whether the response is pending or confirmed.
  - paragraph: Guardian-assisted recovery
  - heading "A way back in that does not trust the stolen key." [level=2]
  - paragraph: If a signer is compromised, recovery must not require that signer's permission. Two of three independent guardians approve replacing it, after a delay, with the vault still locked.
  - list:
    - listitem: Guardian approvals are bound to the exact proposal, nonce and chain
    - listitem: Duplicate and replayed approvals are rejected
    - listitem: Signer replacement is narrow; guardians cannot withdraw your funds
    - listitem: Three compromised guardians are a real remaining risk. NONCE does not claim guaranteed protection.
  - link "Walk through recovery":
    - /url: /how-it-works
  - paragraph: Recovery threshold
  - text: 2 of 3 required Guardian — Ledger (cold) Approved Guardian — Family vault Approved Guardian — Advisor Awaiting key
  - paragraph: Guardians approve replacing a signer. They cannot move funds on their own in this custody model.
  - paragraph: Security architecture
  - heading "Layered by design, honest by default." [level=2]
  - paragraph: NONCE separates observation, authorization and asset control. The monitoring backend can raise a verified signal and request a constrained action. It cannot move your funds.
  - paragraph: Your wallet
  - text: Custody
  - paragraph: Holds keys. Signs authentication messages and withdrawals locally.
  - paragraph: Watchdog + risk engine
  - text: Observation
  - paragraph: Ingests events, correlates signals, scores risk, preserves evidence.
  - paragraph: Vault contract
  - text: Enforcement
  - paragraph: Holds assets. Enforces delays, thresholds, lockdown and recovery.
  - paragraph: Guardians
  - text: Recovery
  - paragraph: Independent approvals for signer replacement. No unilateral fund access.
  - paragraph: What this build actually does
  - list:
    - listitem: Server-enforced authorization and ownership checks
    - listitem: Wallet ownership proven by one-time signature or labelled demo signer
    - listitem: Full incident, lockdown and recovery state machine with evidence
  - paragraph: What it explicitly does not do
  - list:
    - listitem: Deploy or audit a mainnet contract
    - listitem: Read live chain balances or submit real transactions
    - listitem: Reverse settled transfers or guarantee recovery
  - paragraph: Simple onboarding
  - heading "Guarded in four short steps." [level=2]
  - paragraph: No seed phrases. No private keys sent anywhere. Non-technical labels first, with technical detail available when you want it.
  - text: "01"
  - heading "Attach your wallet" [level=3]
  - paragraph: Sign a message to prove ownership. The address alone is never accepted.
  - text: "02"
  - heading "Create the vault" [level=3]
  - paragraph: A sandbox vault record with clear separation from your ordinary wallet.
  - text: "03"
  - heading "Set the rules" [level=3]
  - paragraph: Limits, delay, allowlist, three guardians and decoy sensors.
  - text: "04"
  - heading "Verify everything" [level=3]
  - paragraph: Protection stays incomplete until each safeguard is actually configured.
  - paragraph: Questions
  - heading "The answers that matter." [level=2]
  - paragraph: Including the ones about what NONCE cannot do.
  - heading "01 Does NONCE ever hold my private keys or seed phrase?" [level=3]:
    - button "01 Does NONCE ever hold my private keys or seed phrase?"
  - heading "02 Can NONCE reverse a transaction that already confirmed?" [level=3]:
    - button "02 Can NONCE reverse a transaction that already confirmed?"
  - heading "03 What is a decoy wallet?" [level=3]:
    - button "03 What is a decoy wallet?"
  - heading "04 Is the vault running on mainnet with real money?" [level=3]:
    - button "04 Is the vault running on mainnet with real money?"
  - heading "05 What happens if I lose access to my wallet?" [level=3]:
    - button "05 What happens if I lose access to my wallet?"
  - heading "06 What if the monitoring service goes down?" [level=3]:
    - button "06 What if the monitoring service goes down?"
  - heading "Put a security layer between an attacker and your assets." [level=2]
  - paragraph: Configure a sandbox vault in minutes. No real funds, no audited mainnet contract, no false promises.
  - link "Protect my wallet":
    - /url: /auth?returnTo=%2Fonboarding
  - link "Read the security model":
    - /url: /security
- contentinfo:
  - link "NONCE home":
    - /url: /
    - text: NONCE. Your crypto security bank
  - paragraph: A self-custodial vault that separates what you protect from what attackers can find. Detect the breach. Defend the vault.
  - paragraph: Sandbox preview · no mainnet deployment · no real funds
  - paragraph: Product
  - list:
    - listitem:
      - link "How NONCE works":
        - /url: /how-it-works
    - listitem:
      - link "Security architecture":
        - /url: /security
    - listitem:
      - link "Features":
        - /url: /features
    - listitem:
      - link "FAQ":
        - /url: /faq
    - listitem:
      - link "Launch app":
        - /url: /dashboard
  - paragraph: Honest by design
  - list:
    - listitem: Blockchain transactions are irreversible. NONCE never claims to reverse them.
    - listitem: Decoy sensors raise evidence, not proof of theft.
    - listitem: Nothing here is audited, insured, or a guarantee of safety.
  - paragraph: © 2026 NONCE. Demonstration software, provided as-is.
  - paragraph: Self-custody means you keep responsibility for your keys.
- region "Notifications alt+T"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test.describe("public experience", () => {
  4  |   test("landing page renders without the preview crash screen", async ({ page }) => {
  5  |     await page.goto("/");
  6  |     await expect(page.locator("body")).not.toContainText("Preview runtime error");
  7  |     await expect(page.getByRole("heading").first()).toBeVisible();
> 8  |     await expect(page.getByRole("link", { name: /enter|sign in|get started/i }).first()).toBeVisible();
     |                                                                                          ^ Error: expect(locator).toBeVisible() failed
  9  |   });
  10 | 
  11 |   test("auth page offers email and explicit sandbox access", async ({ page }) => {
  12 |     await page.goto("/auth");
  13 |     await expect(page.getByRole("heading", { name: /sign in or create an account/i })).toBeVisible();
  14 |     await expect(page.getByLabel(/email address/i)).toBeVisible();
  15 |     await expect(
  16 |       page.getByRole("button", { name: /continue with sandbox access/i }),
  17 |     ).toBeVisible();
  18 |     await expect(page.getByText(/cannot prove wallet ownership/i)).toBeVisible();
  19 |   });
  20 | 
  21 |   test("protected route preserves returnTo when signed out", async ({ page }) => {
  22 |     await page.goto("/dashboard");
  23 |     await expect(page.getByRole("heading", { name: /sign in to continue/i })).toBeVisible();
  24 |     await page.getByRole("button", { name: /^sign in$/i }).click();
  25 |     await expect(page).toHaveURL(/\/auth\?returnTo=%2Fdashboard/);
  26 |   });
  27 | });
  28 | 
```