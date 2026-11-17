# NONCE test results — 17 November 2026

**Status:** local engineering validation complete for the changed code.
Desktop and mobile browser E2E pass. Live Base Sepolia transaction validation
remains blocked.

This is not an independent audit. A pass means the command passed in this
workspace at this time; it does not prove contract safety.

## 1. Frontend and backend

| Command | Result |
| --- | --- |
| `bun tsc -b --noEmit` | Exit 0 |
| `bun run build` | Exit 0; Vite transformed 4,020 modules |
| `bun run lint` | Exit 0; **0 errors, 19 warnings** |
| `bun convex dev --once` | Exit 0; functions/codegen pushed |
| `bunx playwright test --list` | 24 tests in 4 files |
| `bunx playwright test` | **24 passed, 0 failed** in 1.4m; Chromium + Pixel 7 projects |
| `bun test tests/policyRules.test.ts tests/wallet.test.ts tests/testnetConfig.test.ts tests/testnetWallet.test.ts tests/intelligence.test.ts` | **37 passed, 0 failed**, 76 expectations |

The 19 lint warnings are Fast Refresh export-shape warnings in existing
shadcn/AppShell/main files and unused generated-file directives. They are not
errors and were not suppressed. No `eslint-disable` was added to source to make
the run pass.

## 2. Backend/unit test coverage

### Policy accounting and classification — 8 tests

`tests/policyRules.test.ts` covers:

- pending reservations remain counted until finalization;
- completed spend is counted for 24 hours from finalization;
- cancelled/blocked/failed requests do not consume budget;
- USDC units do not contaminate an ETH budget;
- one weakening field makes an entire policy change weakening;
- lowering limits/lengthening delay is strengthening;
- delay below the contract minimum is rejected;
- threshold above the per-transaction limit is rejected.

### Wallet error handling and address validation — 6 tests

`tests/wallet.test.ts` covers:

- plain-object EIP-1193 `4001` rejection;
- `Error` rejection;
- missing wallet;
- wrong chain;
- preservation of an actionable wallet error;
- valid and invalid EVM addresses.

This suite found the `[object Object]` error-rendering defect recorded as W-01
in [`NONCE_CURRENT_AUDIT.md`](./NONCE_CURRENT_AUDIT.md).

### Testnet configuration — 4 tests

`tests/testnetConfig.test.ts` covers:

- missing configuration returns blockers, not a fake deployment;
- a complete Base Sepolia configuration is accepted;
- a malformed deployment hash is rejected;
- a non-84532 chain is rejected.

### Wallet network behavior — 4 tests

`tests/testnetWallet.test.ts` covers:

- absent injected wallet;
- already on Base Sepolia;
- rejected `wallet_switchEthereumChain`;
- a withdrawal write blocked before submission on the wrong chain.

### P1 intelligence — 15 tests

`tests/intelligence.test.ts` covers:

- compliant payment preflight;
- allowlist, per-transaction and rolling-limit failures;
- guardian threshold detection;
- unknown-recipient warnings without falsely blocking;
- locked-vault and invalid-address blocking;
- Copilot sandbox labelling and no-signing-authority disclaimer;
- incident-driven risk and evidence references;
- missing-guardian findings and recommendations;
- Passport sandbox, verified and at-risk states;
- privacy-safe address masking;
- feature-flag defaults and explicit opt-out parsing.

## 3. Contract tests

Commands:

```bash
export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
forge build
forge test -vv
```

Actual result:

- **52 unit/invariant tests passed** in `NONCEVault.t.sol`.
- **1 fork test passed** in `NONCEVault.fork.t.sol`.
- **53 total passed, 0 failed, 0 skipped.**
- Invariants: **3 properties, 256 runs, 128,000 calls, 0 reverts**.
- Fuzz: **2 tests at 256 runs each**.

New edge-case tests added in this pass:

- `testOldWithdrawalCannotBeApprovedAfterRecovery`
- `testExpiredCleanupRejectsAnUnexpiredRequest`
- `testZeroValueDepositReverts`

The pre-existing suite already covers role separation, duplicate approvals,
cross-request replay, cross-nonce recovery replay, epoch invalidation, rolling
limits, reservation accounting, policy timelocks, allowlist removal, guardian
rotation, restoration, recovery cancellation and reentrancy.

## 4. Static analysis

```bash
slither . --filter-paths "lib|test|script"
```

Actual result:

- 82 contracts analyzed, 102 detectors.
- **13 results: 10 Low/Medium-confidence timestamp findings and 3 informational
  findings.**
- No High or Medium severity finding.
- Slither exits nonzero when findings exist; the finding set was reviewed rather
  than treating the nonzero exit as a pass.

The timestamp findings concern the intentional delay/expiry comparisons.
Validator timestamp manipulation can move execution by seconds, not bypass the
minimum delays. This remains an accepted design trade-off, not a proof of
correctness.

## 5. Browser E2E

Playwright is installed and configured. The suite was discovered successfully:

```bash
bunx playwright test --list
# 24 tests in 4 files
```

Coverage checked in:

- public landing and auth;
- protected-route `returnTo`;
- sandbox sign-in to dashboard;
- onboarding sandbox-signer path;
- undeployed testnet honesty;
- wallet rejection;
- wrong-chain connection;
- Copilot, Finance, Firewall, Notifications and Passport empty-state honesty;
- mobile project (`Pixel 7`).

**Run result:** `bunx playwright test` executed against a Playwright-owned Vite
server on `127.0.0.1:4319` and passed **24/24 tests** in 1.4 minutes. Both the
desktop Chromium project and the Pixel 7 mobile project passed all 12 cases.

Observed during this pass:

- The suite grew from 3 to 4 intelligence cases; the no-vault navigation case
  now verifies a visible Passport entry point on mobile.
- The mobile landing CTA is **“Protect my wallet”**; the public test locator was
  corrected to match the shipped copy rather than a generic label.
- The pass covers page rendering, routes, empty-state copy, auth redirects and
  visible wallet-error handling. It does **not** connect a MetaMask extension,
  create a funded vault, execute a withdrawal or exercise recovery.
- Automated screenshots were captured for the landing, auth and no-vault P1
  pages at desktop and mobile widths. A human visual review of those screens,
  and a populated-vault visual review, were **not** performed.

## 6. Deployment validation

- Base Sepolia public RPC chain ID: **84532**.
- Convex testnet variables: **absent**.
- Deployment address/hash: **none**.
- Local Foundry keystores: **none**.
- Broadcasts: **none**.
- Live reads: **not possible without configuration**.

See [`NONCE_DEPLOYMENT_VERIFICATION.md`](./NONCE_DEPLOYMENT_VERIFICATION.md).

## 7. Commands not run

- `forge script ... --broadcast` — requires an explicit approval, a funded
  keystore and role addresses.
- Basescan source verification — requires a real deployment and API key.
- Real testnet deposits, withdrawals, approvals, freeze and recovery — require a
  deployed contract and wallet.
- MetaMask/browser-extension E2E — the passing suite uses sandbox auth and no
  injected wallet.
- Populated-vault visual review — the captured pages are public/auth/no-vault
  states only.
- Accessibility audit, physical-device matrix, load/soak testing and independent
  audit.

## 8. Reproduction

```bash
bun tsc -b --noEmit
bun run lint
bun run build
bun convex dev --once
bun test tests/policyRules.test.ts tests/wallet.test.ts tests/testnetConfig.test.ts tests/testnetWallet.test.ts tests/intelligence.test.ts

export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
forge build
forge test -vv
slither . --filter-paths "lib|test|script"
```

For browser tests against an already-running preview:

```bash
PLAYWRIGHT_BASE_URL=https://your-preview-host \
  bunx playwright test
```
