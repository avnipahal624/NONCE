# NONCE current audit — 17 November 2026

**Scope:** current repository baseline, contract, Foundry suite, Convex backend,
frontend routes, `/testnet` read/write layer, lint, build and testnet
configuration. This is an internal engineering audit, not an independent
security audit.

**Status:** local prototype validated; **no deployed Base Sepolia contract is
configured** and no on-chain transaction was broadcast in this pass. Desktop and
mobile browser E2E now pass locally.

Git commands are blocked by this execution host, so this audit identifies source
by SHA-256 rather than a Git commit.

## 1. Baseline commands and results

| Check | Command | Actual result |
| --- | --- | --- |
| TypeScript | `bun tsc -b --noEmit` | **Passed**, exit 0 |
| Production build | `bun run build` | **Passed**, 4,020 modules transformed |
| ESLint | `bun run lint` | **Passed**, exit 0: 0 errors, 19 Fast Refresh warnings |
| Convex codegen/typecheck | `bun convex dev --once` | **Passed**, functions ready |
| Backend/unit tests | `bun test tests/policyRules.test.ts tests/wallet.test.ts tests/testnetConfig.test.ts tests/testnetWallet.test.ts tests/intelligence.test.ts` | **37 passed, 0 failed** after the P1 expansion |
| Contract build | `cd contracts && forge build` | **Passed** |
| Contract tests | `cd contracts && forge test -vv` | **53 passed, 0 failed** (52 unit/invariant + 1 fork) |
| Invariants | `forge test -vv` | 3 properties, 256 runs, 128,000 calls, 0 reverts |
| Fuzz | `forge test -vv` | 2 fuzz tests, 256 runs each |
| Slither | `slither . --filter-paths "lib|test|script"` | 13 results: **10 Low, 3 Informational, no High/Medium**; process exits 255 because findings exist |
| RPC chain check | `cast chain-id --rpc-url https://sepolia.base.org` | **84532** |
| Deployment config | `bunx convex env get ...` | **Not found** for all five testnet keys |
| Browser E2E | `bunx playwright test` | **24 passed, 0 failed**; desktop Chromium and Pixel 7 projects |

The lint warnings are Fast Refresh export-shape warnings in the existing
shadcn/AppShell/main files and unused generated-file directives. No rule was
disabled and no error was suppressed.

## 2. Contract source identity

```text
b75741a27a40ef2aa936411a469445dc400b477088aef76fdf90ff43521ecfce  contracts/NONCEVault.sol
4536c865918c956cddc96ec60987658531da0c5d025c9ce7cc409fe08e0c0dd8  contracts/script/Deploy.s.sol
a10bf0845c79af63cba1ab4d4f31d39711beb4bb7e10247b6117137ab3665262  contracts/test/NONCEVault.t.sol
a00e2d54157178c429d88f21fe370621c365eb63e0fd101545b20000c8263fc6  contracts/test/NONCEVault.fork.t.sol
1552b56a73d8d11260865fe1a3ac610b3f31e4472f34319447f1f1b8447e2606  contracts/foundry.toml
```

Artifact facts:

- Runtime bytecode: **18,321 bytes**
- Creation bytecode: **19,801 bytes**
- ABI entries: **130**
- Solidity: `0.8.24`, optimizer enabled, 200 runs
- Contract behavior was **not changed** in this pass.

## 3. Deployment truth

The documentation’s older “not deployed” statement is still correct for this
workspace, but it was re-tested rather than assumed.

- `NONCE_VAULT_ADDRESS`, `NONCE_CHAIN_ID`, `NONCE_DEPLOYMENT_TX_HASH`,
  `NONCE_CONTRACT_VERIFIED` and `BASE_SEPOLIA_RPC_URL` are **not set** on the
  active Convex development deployment.
- There is no configured contract address, deployment receipt, source
  verification result or live balance to read.
- `cast wallet list` returned no keystores.
- The fixed owner address used by the browser deployment panel
  (`0x7f81CB31C2AE4Fa70360c503232674D09d098C54`) has **0.0001 Base Sepolia
  ETH** and **nonce 0** at audit time. Nonce 0 means it has not sent a
  transaction; this audit cannot prove no other deployer exists, but there is no
  configured deployment or receipt evidence.
- No broadcast, deployment, verification, or testnet spend occurred.

The detailed read-only procedure and blocker list are in
[`NONCE_DEPLOYMENT_VERIFICATION.md`](./NONCE_DEPLOYMENT_VERIFICATION.md).

## 4. What is implemented and working

- Existing Convex Auth and protected-route behavior.
- Sandbox vault, policy, withdrawal, guardian, decoy, incident and recovery
  state machines.
- Explicit `DEMO` / `TESTNET` mode separation.
- Testnet console reads through a server-side RPC action; browser writes use the
  injected wallet.
- Contract-enforced withdrawal delay, rolling reservation accounting, policy
  timelock, guardian quorum, freeze/restoration and recovery epoch.
- Incident evidence, audit records and in-app notifications.
- Testnet log indexer with bounded ranges, deduplication, reorg rewind and
  rule-based alerts.
- Reference deployment panel that prepares a MetaMask deployment but does not
  automatically broadcast.

## 5. Issues found and repaired in this pass

### W-01 — EIP-1193 errors rendered as `[object Object]`

`humanizeWalletError` only read `Error.message`. Wallet extensions commonly
throw a plain object with `code: 4001` and `message`. The UI could therefore show
a meaningless error or fail to name a rejected signature.

**Repair:** extract `message` and `code` from object errors, map `4001` to the
explicit rejection message, and cover the behavior with unit tests.

### I-01 — Additional signal claimed to be attached but was not

When a signal arrived while an incident was already open, `triggerDecoySignal`
returned “attached as supporting evidence” but only created the event, signal
and assessment. The incident's `eventIds` and evidence list were unchanged.

**Repair:** insert `incidentEvidence`, extend `eventIds`, recompute the incident
evidence hash and write an audit record before returning. The timeline now
reflects the additional signal.

### R-01 — RPC chain was not checked before trusting reads

`readVault`, `verifyTransaction` and the indexer created a Base Sepolia client
but did not read the RPC's actual chain ID before trusting state.

**Repair:** call `getChainId()` and reject a mismatch. `readVault` also returns
`rpcChainId` for observability. No contract state is trusted from a mismatched
RPC.

### C-01 — Malformed deployment hash was accepted as configured

A non-empty but malformed `NONCE_DEPLOYMENT_TX_HASH` was passed to the indexer's
receipt lookup.

**Repair:** validate 32-byte hash shape in `testnetConfig`; malformed values are
null and produce an explicit blocker.

### U-01 — Misleading testnet labels

The console called the withdrawal delay “Policy delay” and said the epoch
increments on restoration. The contract only increments the epoch on recovery.

**Repair:** labels now say “Withdrawal delay” and “Increments only when recovery
replaces the owner.”

### Q-01 — Ten real ESLint errors

The state-sync effects in `PolicyDialog`, `Onboarding`, `Settings`,
`use-mobile` and the carousel called `setState` synchronously; the sidebar
skeleton used `Math.random()` during render; Onboarding had unused symbols.

**Repair:** deterministic skeleton width, event/subscription-driven state,
deferred server-state hydration, and removal of unused symbols. Lint now exits
0 with no errors.

## 6. What remains unresolved

1. **No live deployment.** No address, deployment transaction, receipt,
   bytecode comparison, source verification, role read or live policy read can
   be performed yet.
2. **No funded deployer keystore and no broadcast approval.** The existing owner
   address has no outgoing nonce.
3. **No wallet-extension or populated-vault browser test.** The 24 passing
   Playwright cases use sandbox auth and no-vault states. MetaMask interaction,
   a funded vault, withdrawal execution and recovery remain unexercised in a
   browser, and no human visual review of a populated vault was performed.
4. **No real testnet transaction validation.** Wallet-signed deposits,
   withdrawals, guardian approvals, freeze and recovery have not been exercised
   against a deployed contract.
5. **No independent audit.** The contract remains unaudited; local tests and
   Slither are engineering evidence, not an audit.
6. **No true live decoy source.** The incident pipeline's only signal source is
   the owner-triggered sandbox simulator. The testnet indexer is observation-only
   and holds no monitor key.
7. **No external notification delivery, ERC-20 custody, multi-vault association,
   or allowlist/rotation forms in the console.** These remain documented gaps.

## 7. Files changed in this pass

Code and tests:

- `src/components/nonce/PolicyDialog.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/sidebar.tsx`
- `src/hooks/use-mobile.ts`
- `src/pages/Onboarding.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Testnet.tsx`
- `src/lib/wallet.ts`
- `src/convex/nonce/monitor.ts`
- `src/convex/nonce/testnet.ts`
- `src/convex/nonce/testnetConfig.ts`
- `src/convex/nonce/testnetIndexer.ts`
- `contracts/test/NONCEVault.t.sol`
- `package.json`, `bun.lock`
- `playwright.config.ts` (new)
- `tests/e2e/*.spec.ts` (new)
- `tests/wallet.test.ts` (new)
- `tests/testnetConfig.test.ts` (new)
- `tests/testnetWallet.test.ts` (new)
- `tests/intelligence.test.ts` (new P1 tests)
- `tests/e2e/intelligence.spec.ts` (new browser cases)
- `src/lib/intelligence.ts`, `src/lib/features.ts` (new pure P1 helpers)
- `src/convex/nonce/intelligence.ts`, `src/convex/nonce/addresses.ts` (new
  owner-scoped P1 backend; `addressBookEntries` schema table)
- `src/pages/Copilot.tsx`, `src/pages/Finance.tsx`, `src/pages/Firewall.tsx`,
  `src/pages/Passport.tsx`, `src/pages/Notifications.tsx` (new protected routes)
- `src/components/nonce/FirewallPanel.tsx` (shared preflight result panel)
- `src/components/nonce/AssetActions.tsx` (pre-submit firewall and address-book
  quick picks), `src/components/nonce/AppShell.tsx`, `src/main.tsx` (feature-gated
  navigation/routes)

Documentation:

- `docs/NONCE_CURRENT_AUDIT.md` (this file)
- `docs/NONCE_FINAL_AUDIT.md` (new)
- `docs/NONCE_TEST_RESULTS.md` (new)
- `docs/NONCE_DEPLOYMENT_VERIFICATION.md` (new)
- `docs/NONCE_SECURITY_LIMITATIONS.md` (new)
- `docs/NONCE_DEMO_SCRIPT.md` (new)
- `docs/NONCE_PLATFORM_EXPANSION.md` (new P1 audit/status)
- Earlier P1/UI and legacy audit docs are being reconciled with the new counts.

## 8. Approval gates

The following require explicit user approval and cannot be completed safely in
this pass:

1. Creating/importing a funded Base Sepolia deployer keystore.
2. Broadcasting the deployment transaction and spending testnet ETH.
3. Supplying a Basescan API key or changing the deployment environment.
4. Running a real wallet transaction sequence against a deployed vault.
5. Any change to `NONCEVault.sol` security behavior.
