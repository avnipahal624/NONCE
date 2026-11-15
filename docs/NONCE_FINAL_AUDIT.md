# NONCE final audit — 15 November 2026

**Verdict:** **not signed off as a fully validated Base Sepolia prototype.**
The local application, contract test suite and safety fixes are in good shape,
but deployment evidence, real testnet transactions and browser E2E are still
missing. Those are acceptance blockers, not documentation details.

No transaction was broadcast, no contract was deployed, no testnet ETH was
spent, and no browser test was executed in this pass.

## 1. Acceptance criteria

| Criterion | Status | Evidence / blocker |
| --- | --- | --- |
| Build passes | **PASS** | `bun run build`, exit 0, 4,020 modules |
| TypeScript passes | **PASS** | `bun tsc -b --noEmit`, exit 0 |
| Lint passes | **PASS with warnings** | exit 0, 0 errors, 19 Fast Refresh/generated directives |
| Contract tests pass | **PASS** | 53/53 (52 unit/invariant + 1 fork), 0 failed |
| Fuzz/invariant expansion | **PASS** | 2 fuzz tests at 256 runs; 3 invariants, 256 runs, 128k calls |
| Static analysis reviewed | **PASS with findings** | Slither: 10 Low, 3 Informational, 0 High/Medium |
| Browser E2E passes | **BLOCKED** | 16 tests discovered; run failed at browser launch (missing Chromium, install `ENOSPC`), so no app assertion ran |
| Deployment evidence verified | **BLOCKED** | no address, receipt, bytecode, source or role read |
| Real testnet transactions validated | **BLOCKED** | no deployed contract or funded keystore |
| Decoy-to-freeze demonstrated with authentic evidence | **BLOCKED** | sandbox pipeline exists; no on-chain freeze receipt |
| Guardian recovery works under constraints | **PARTIAL** | contract and sandbox paths tested locally; no live recovery |
| Every claim backed by test/receipt/state | **PARTIAL** | local commands and source hashes recorded; chain claims absent |
| Limitations documented | **PASS** | `NONCE_SECURITY_LIMITATIONS.md` and deployment verification |

## 2. What is genuinely complete

- Full repository audit and measured baseline.
- Fixes for 10 ESLint errors without disabling rules.
- Wallet EIP-1193 error handling and tests.
- RPC chain-ID validation for reads, receipt verification and the indexer.
- Deployment hash validation and honest configuration blockers.
- Incident evidence attachment when a second signal arrives during an open
  incident.
- Three new contract edge-case tests.
- Testnet reads now include immutable policy/recovery delays, guardian count and
  threshold, allowlist count, and both freeze sources.
- Corrected misleading testnet labels for epoch and withdrawal delay.
- Playwright configuration and 16 tests checked in.
- Six audit/validation documents with exact measured results.

## 3. What is not complete

### Deployment and live transactions

There is no `NONCE_VAULT_ADDRESS` or deployment transaction in the active Convex
environment. The fixed deployment-panel owner has Base Sepolia ETH but nonce `0`;
no local keystore exists. Consequently there is nothing to verify at an address,
nothing to read in `/testnet`, and no evidence for:

- deposit;
- withdrawal request and delay enforcement;
- guardian approval;
- execution or cancellation;
- monitor freeze;
- recovery proposal, quorum, execution or cancellation;
- policy change and restoration.

The UI correctly refuses to pretend otherwise.

### Browser E2E

`bunx playwright test --list` finds 16 tests, but no browser executable could be
installed. A run attempt failed all 16 tests at `browserType.launch` because the
Chromium headless shell is absent. The workspace had roughly 196 MB free;
Chromium and the headless shell downloads both failed with `ENOSPC`. No
browser/MetaMask interaction was viewed or tested.

### Decoy-to-freeze

The sandbox incident pipeline is implemented and now attaches a second signal as
evidence. It remains a **sandbox** demonstration. There is no authorized live
signal source, no monitor signing key, and no on-chain freeze receipt. The
contract deliberately excludes automated freezing from this backend.

### Independent assurance

The contract is unaudited. Slither found only Low/Informational issues, but
Slither is not a substitute for an audit or formal verification. No bug bounty,
penetration test, legal review or production key-custody review exists.

## 4. Security review summary

### Fixed in this pass

| ID | Severity | Issue | Fix |
| --- | --- | --- | --- |
| W-01 | Low/UX | Wallet rejection rendered as `[object Object]` | Parse EIP-1193 object errors; tests |
| I-01 | Medium (integrity) | Second signal was not actually attached to incident evidence | Insert evidence, extend `eventIds`, recompute hash, audit |
| R-01 | Medium (trust) | RPC chain was not checked before reads | Compare `eth_chainId` to 84532; reject mismatch |
| C-01 | Low (config) | Malformed deployment hash treated as valid | 32-byte hash validation and blocker |
| U-01 | Low (truthfulness) | Epoch/delay labels were inaccurate | Corrected labels |
| Q-01 | Quality | 10 lint errors | Removed sync effects/unused state; deterministic render |

### Reviewed and left unchanged

- Freeze is monitor-only and freeze-only; no monitor unfreeze path.
- Restoration cannot clear a guardian recovery freeze.
- Recovery increments the epoch and invalidates old withdrawals and proposals.
- Two distinct guardian approvals are required for weakening policy, recovery,
  rotation and allowlist removal.
- Rolling spend counts pending reservations and executed spend for 24 hours.
- Balance is reserved at request time; cancellation releases it.
- Reentrancy is guarded on execution; a rejecting recipient reverts.
- Timestamp comparisons are intentional and bounded by policy delays.
- Contract behavior was not changed because no regression failure justified a
  behavior change.

## 5. Product experience status

Existing NONCE visual identity is preserved. The dashboard, security response
center, withdrawal timeline, guardian recovery and testnet console remain in
place. This pass prioritized truthful state over visual polish:

- `/testnet` distinguishes configured vs blocked;
- sandbox mode stays explicit;
- testnet metrics now expose immutable delays and both freeze sources;
- no live status is fabricated when configuration is absent.

A visual review was not possible without a browser. Treat the UI as
compile-verified and source-reviewed, not visually verified.

## 6. Required next actions

To move from **local prototype** to **validated Base Sepolia prototype**:

1. Approve creation/import of a funded Base Sepolia deployer keystore.
2. Supply distinct owner, monitor and guardian addresses.
3. Approve broadcast and testnet spend.
4. Deploy and verify source on Basescan.
5. Configure Convex testnet values.
6. Run the read-only role/policy checks in
   `NONCE_DEPLOYMENT_VERIFICATION.md`.
7. Execute the testnet sequence with real wallets and store receipts.
8. Run Playwright on a host with browser storage, including the mobile project.
9. Update this document with actual hashes, block numbers and screenshots.

## 7. Approval requests

Approval is required before any of the following:

- deploying or broadcasting on Base Sepolia;
- spending testnet ETH;
- creating/importing a signing keystore;
- changing contract security behavior;
- supplying a Basescan API key;
- presenting the sandbox demonstration as live protection.

Until then, the correct status is: **local code and contract tests validated;
on-chain and browser validation outstanding.**
