# NONCE — build and operations notes

NONCE is a self-custodial crypto security vault: a consumer interface around
withdrawal rules, decoy-based intrusion evidence, an explicit lockdown state
machine, and two-of-three guardian recovery. The hardened reference contract is
the authority for enforceable rules; the demo backend mirrors those rules with
compressed timings.

**Status: hardened sandbox + read/write testnet console.** No contract is
deployed from this repository, the reference contract is unaudited, and the demo
ledger is simulated. The `/testnet` console reads a configured Base Sepolia
contract and signs writes with the user's wallet, but it has no configured
contract in this environment. No mainnet path exists.

Related documents:

- [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) — original findings and remediation
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) — enforcement boundaries
- [`THREAT_MODEL.md`](./THREAT_MODEL.md) — actors, threats, residual risk
- [`TESTNET_DEPLOYMENT.md`](./TESTNET_DEPLOYMENT.md) — deploy, verify, configure
- [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) — what is not done or tested

---

## 1. Architecture

```
┌──────────────────────────── Browser (Vite + React 19) ────────────────────────────┐
│  Marketing pages           Auth (email OTP / sandbox)      Protected app shell      │
│  /  /how-it-works          /auth                           /dashboard /vault ...    │
│  /security /features /faq                                  RequireAuth + sidebar    │
│                                                            /testnet (wallet writes) │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ Convex React client + injected EVM wallet
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│                              Convex deployment                                     │
│  identity & access        demo vault domain          testnet reads                 │
│  wallets / walletVerify   policy / withdrawals       testnet.readVault (Node/viem) │
│                           guardians / recovery       testnet.verifyTransaction     │
│                           monitor / decoys           testnetConfig.status          │
│  append-only audit + notifications + scheduler (delayed requests, expiry)          │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ HTTPS RPC (server-side, URL never sent to browser)
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│  NONCEVault.sol on Base Sepolia (when deployed) — owner, monitor, 3 guardians,     │
│  timelocked policy/allowlist/rotation, rolling reservations, epoch, recovery,      │
│  guardian restoration. Reference only until audit + deployment.                     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Trust boundaries:

- **Browser** authenticates the NONCE account and may prove wallet ownership.
  For testnet writes it asks the injected wallet to sign contract calls. It
  never receives a guardian or monitor private key.
- **Convex backend** authorizes every demo action by `userId`, mirrors contract
  rules, stores evidence and audit records, and performs read-only RPC calls. It
  holds no vault signing key and cannot submit transactions.
- **Contract** enforces limits, delays, rolling reservations, allowlists, freeze,
  guardian quorum, timelocked policy/rotation and recovery epochs.
- **Monitor** is immutable and freeze-only. It cannot withdraw, unfreeze, change
  policy, rotate guardians or approve recovery.

### Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | public | Marketing home and demo framing |
| `/how-it-works`, `/security`, `/features`, `/faq` | public | Product, architecture, capabilities, honest answers |
| `/auth` | public | Email OTP or sandbox access; `returnTo` preserved |
| `/onboarding` | protected | Nine-step sandbox vault setup |
| `/dashboard` | protected | Balances, posture, shortcuts, recent activity |
| `/vault` | protected | Assets, policy proposals, pending withdrawals, history |
| `/protection` | protected | Checklist, decoy network, signal simulation, monitor health |
| `/activity` | protected | Security Response Center: incident queue, timeline, audit log, service health |
| `/activity/:incidentId` | protected | Evidence, response timeline, lockdown attempts, review actions |
| `/recovery` | protected | Guardians, owner/guardian proposals, approvals, cancellation, execution |
| `/testnet` | protected | Live Base Sepolia contract state, wallet writes, receipt verification |
| `/settings` | protected | Profile, notifications, wallets, environment |

All protected routes use `RequireAuth`, which sends signed-out users to
`/auth?returnTo=…`. The auth page's fallback destination is `/dashboard`.

### File structure

```
src/
  main.tsx                     routes, providers, error boundaries
  index.css                    dark-emerald tokens, vault utilities, motion
  pages/                       Landing, HowItWorks, SecurityArchitecture, Features, Faq,
                               Auth, Onboarding, Dashboard, Vault, Protection, Activity,
                               IncidentDetail, Recovery, Testnet, Settings, NotFound
  components/nonce/            AppShell, Logo, VaultDial, StatusPill, Address, PageHeader,
                               MarketingShell, MarketingBlocks, AssetActions, PolicyDialog,
                               PolicyProposals
  components/RequireAuth.tsx   existing route guard (unchanged)
  hooks/use-workspace.ts       reactive demo workspace snapshot
  lib/nonce.ts                 formatting, tones, status vocabulary
  lib/wallet.ts                EIP-1193 connect / personal_sign / Base Sepolia switch
  lib/testnet.ts               viem wallet client + contract ABI for console writes
  convex/schema.ts             auth tables + NONCE domain tables
  convex/nonce/                backend modules listed in §3
contracts/                     NONCEVault.sol, Foundry tests, deploy script, README
docs/                          this document, audit, architecture, threat model, deployment,
                               limitations
```

---

## 2. Frontend summary

- **Theme.** Deep green-black surfaces, mint primary, ivory text, sage secondary,
  hairline borders. Inter, Instrument Serif italic accents and JetBrains Mono for
  addresses and references. Tailwind v4 tokens plus existing shadcn variables.
- **Marketing.** Every claim is paired with its limitation; testnet-only,
  unaudited and sandbox status are visible.
- **App shell.** Sidebar: Dashboard, Vault, Protection, Response Center,
  Guardians, Testnet, Settings. Live protection card, explicit Sandbox/Live
  indicator, connected wallet, notification popover, account menu and mobile
  bottom navigation.
- **Data flow.** `useWorkspace` subscribes to `vaults.workspace`; pages read
  vault, assets, policy, proposals, decoys, guardians, monitoring and protection
  from that snapshot. Every demo write is a Convex mutation. The testnet page
  uses independent read actions.
- **Honesty.** No fiat values. Demo balances are labelled as ledger entries.
  Simulated objects carry `SIMULATED`, `DEMO_SIGNER` or `SIM-…` references.
  Testnet confirmation appears only with an observed receipt. Missing config is
  a blocker, not a zero balance.
- **Accessibility.** Status is never colour-only; icon buttons have labels; focus
  rings remain; motion respects `prefers-reduced-motion`.

### Key client flows

- **Wallet proof.** `wallets.createChallenge` issues a one-time EIP-4361-style
  message bound to domain, chain, address and nonce. A Node action recovers the
  address with viem and rejects wrong signers, expired or reused challenges. A
  sandbox signer is stored as `DEMO_SIGNER`, not as proof.
- **Withdrawals.** React Hook Form + Zod validate amount and destination. Every
  request is queued for at least 10 minutes, reserves balance and rolling
  allowance, and expires after seven days. Large or cumulative requests need two
  guardian approvals (simulated in demo). Pending requests can be cancelled.
  `/vault` renders a data-derived request journey; its countdown is display-only
  and never overrides the stored `executeAfter` timestamp.
- **Policy proposals.** `/vault` creates a timelocked proposal with conservative
  weakening classification. The demo timelock is 2 minutes. Approvals appear as
  simulated guardian actions. Execution recomputes classification and revalidates
  the policy at execution time, not just at proposal time.
- **Incident drill.** `/protection` produces a decoy signal. Verification runs
  on the scheduler, creates an incident and, for high-risk types, a lockdown
  request. The Activity detail page exposes evidence hashes, signals, rationale,
  attempts and review actions.
- **Recovery.** `/recovery` allows owner- or guardian-initiated proposals without
  requiring a prior lockdown. Opening recovery freezes the demo vault. Two
  distinct approvals and the delay are required. A guardian-initiated proposal
  can only be cancelled by two guardians; an owner-initiated proposal by the
  owner. Execution revokes the old signer, advances the epoch, cancels pending
  withdrawals and invalidates pending policy proposals.
- **Testnet.** `/testnet` shows config blockers or live contract state, links to
  Basescan, connects an injected wallet on chain 84532, and submits freeze,
  deposit, withdrawal request/approve/execute/cancel, policy
  propose/approve/execute/cancel, recovery and restoration calls. A submitted
  hash is shown as pending until `verifyTransaction` observes a receipt.

---

## 3. Backend summary

All modules live in `src/convex/nonce/`. Queries and mutations resolve the user
from the Convex Auth session, then resolve the vault by `userId`;
`requireVaultOwner` is used for every demo vault write. Backend testnet writes do
not exist.

| Module | Responsibility |
| --- | --- |
| `wallets.ts` | Challenge creation, demo-signer registration, primary wallet, revocation, one-time challenge consumption |
| `walletVerify.ts` | `"use node"` action; viem `verifyMessage`, domain/chain/expiry/replay checks |
| `vaults.ts` | Workspace snapshot, protection scoring, sandbox vault creation, demo funding, rename, simulated sync |
| `policyRules.ts` | Policy normalization, conservative weakening classification, asset-aware ETH/USDC rules, rolling/reserved math |
| `policy.ts` | Timelocked policy proposals, guardian approvals, cancellation, execution, expiry |
| `withdrawals.ts` | Initial policy setup only, queued requests, reservations, guardian approval, expiry, cancellation, scheduled finalization |
| `decoys.ts` | Decoy CRUD, pause/activate, per-decoy monitoring policy |
| `monitor.ts` | Signal ingestion, classification, verification, lockdown submit/confirm/failure/retry, manual lockdown, health controls |
| `incidents.ts` | Incident list/detail, evidence, acknowledge, false-positive review |
| `recovery.ts` | Owner/guardian proposals, simulated approvals, two-guardian cancellation, execution, epoch increment |
| `guardians.ts` | Initial add/confirm/remove; blocks post-funding changes and role conflicts |
| `testnetConfig.ts` | Reads deployment environment and reports blockers; never returns the RPC URL |
| `testnet.ts` | Node action: live vault read, receipt verification, guardian set lookup; no fake values |
| `activity.ts` | Unified feed and audit/security log |
| `notifications.ts` | In-app notification list, read state, preferences |
| `demo.ts` | One-call demo seeding |
| `hash.ts`, `shared.ts`, `db.ts` | SHA-256, constants/validators, ownership guards, notifications, audit, ledger helpers |

### Demo state machines

Vault: `NORMAL → RESTRICTED → LOCKDOWN → RECOVERY → RESTORED`, with transitions
validated server-side and recorded with a source (`SIMULATED` in this build).

Incident: `DETECTED → VERIFIED → RESPONSE_PENDING → LOCKDOWN_CONFIRMED → RECOVERY →
RESOLVED`, plus `FALSE_POSITIVE` and `FAILED`.

Lockdown request: `PENDING → SUBMITTED → CONFIRMED`, with `FAILED` and
`CANCELLED`. Confirmation is a separate observation; nothing is called locked
before it.

Withdrawal: `QUEUED` or `AWAITING_GUARDIANS → READY → COMPLETED`, with
`CANCELLED`, `BLOCKED` and `FAILED`. Every accepted request has an
`executeAfter` at least 10 minutes in the future.

Policy proposal: `PENDING → EXECUTED`, with `CANCELLED` and `EXPIRED`. Quorum
is tracked in `approvals` rather than a separate `APPROVED` status.

Recovery: `AWAITING_GUARDIANS → APPROVED → EXECUTING → COMPLETED`, with
`REJECTED` and `EXPIRED`.

### Policy semantics (demo mirrors contract)

- Every policy change is proposed; there is no instant post-funding setter.
- The demo timelock is **2 minutes**, compressed from the contract's 1-day
  minimum. The UI labels it.
- A single weakening field makes the whole proposal weakening. Weakening needs
  two distinct confirmed guardians.
- Fields: per-transaction limit, rolling 24-hour limit, large-withdrawal
  threshold, withdrawal delay (10 minutes–24 hours in demo), guardian threshold
  (2–3), allowlist and allowlist-only.
- Execution revalidates the policy and recomputes weakening classification.
- Only one active proposal per vault. Recovery cancels pending proposals.
- Initial setup is the only direct policy path, and only before balances or
  withdrawal history exist.

### Detection rules

- `UNSOLICITED_TRANSFER` is low risk: recorded, never escalates on its own, never
  freezes.
- `CONTRACT_CALL` is medium risk.
- `SIGNED_TX` and `NONCE_CHANGE` are high risk and require corroboration before a
  lockdown request.
- Duplicate events are suppressed by unique key; incident creation is rate
  limited and cooled down.
- Verification is skipped when the monitor checkpoint is not `ACTIVE`; a vault is
  not reported as protected by a monitor that is down.

### Scheduling

Convex scheduler performs withdrawal finalization, request expiry, signal
verification and the lockdown submit/confirm pipeline. Timings are best effort;
the UI shows recorded timestamps and never claims earlier execution than the
stored `executeAfter`.

---

## 4. Data model

`schemaValidation: false` is retained, with validators used for all domain
writes.

- **Identity**: `users` (auth), `walletIdentities`, `authChallenges`.
- **Vault**: `vaults` (mode `DEMO` / `TESTNET`, `securityEpoch`,
  `monitorAddress`), `vaultAssets`, `withdrawalPolicies`, `withdrawalRequests`,
  `vaultTransactions`.
- **Policy**: `securityProposals`.
- **Detection**: `decoys`, `decoyPolicies`, `monitorCheckpoints`,
  `blockchainEvents`, `threatSignals`, `threatAssessments`.
- **Response**: `incidents`, `incidentEvidence`, `lockdownRequests`.
- **Recovery**: `guardians`, `recoveryProposals`, `guardianApprovals`.
- **Operations**: `notifications`, `auditEvents`, `systemHealth`.

Notable field choices:

- `vaults.deploymentStatus` separates `SIMULATED`, `PENDING`, `CONFIRMED`,
  `FAILED`.
- `vaults.mode` separates `DEMO` from `TESTNET`. The schema accepts `TESTNET`,
  but this build does not create a per-user TESTNET vault; the console observes a
  globally configured contract.
- `withdrawalRequests` stores `executeAfter`, `expiresAt`, `epoch`,
  `requiresGuardians`, optional `txHash`, `blockNumber` and `confirmations`.
- `blockchainEvents.txHash` is optional: simulated events must not invent a hash.
- `lockdownRequests` records `attempt`, `latencyMs`, `failureReason` and
  `simulatedFailure`.
- `guardianApprovals.messageHash` binds an approval to the proposal; the approval
  mode is `SIMULATED` in demo.
- `recoveryProposals` stores `initiatedBy`, `proposerGuardianId`,
  `cancelApprovals`, `priorState` and `epoch`.
- Notifications are `IN_APP` only with a real `deliveredAt`.
- Evidence and audit records are append-only from the application's perspective;
  there is no client-facing delete.

---

## 5. Contract summary

`contracts/NONCEVault.sol` is a hardened, unaudited ETH vault.

- Immutable `monitor`, three guardians, two-of-three threshold.
- `MIN_WITHDRAWAL_DELAY` and `SMALL_WITHDRAWAL_DELAY` are both 10 minutes.
- Immutable `policyDelay` (1–30 days) and `recoveryDelay` (2–90 days); bounds are
  constructor-validated.
- Every withdrawal is queued. Guardian approval is required when the request is
  at/above the large threshold **or** cumulative 24-hour spend reaches it.
- Request-time reservations: 64-slot rolling charge ring plus
  `reservedBalance`. Pending charges count until they execute, cancel or expire;
  execution timestamps the charge so the 24-hour window measures actual spend.
  Cancellation/expiry releases both; a pending request's slot is not reused.
- Withdrawal expiry is 7 days after `executeAfter`; `cancelExpired` is
  permissionless.
- Policy changes are always timelocked. Weakening (higher limits, higher large
  threshold, shorter delay, allowlist disabled) needs two guardian approvals.
- Allowlist addition is immediate; removal is a separate timelocked 2-of-3
  proposal. The last entry cannot be removed while allowlisting is on.
- Guardian rotation is owner-proposed, timelocked, needs two approvals, rejects
  role collisions, and is blocked while frozen.
- Freeze is monitor- or owner-callable, idempotent, and has two sources:
  `monitorFrozen` and `recoveryFrozen`. Deposits and cancellation remain allowed.
- Guardian restoration clears only `monitorFrozen`, needs two approvals plus
  `policyDelay`; the monitor cannot initiate, approve or execute it.
- Owner **or guardian** may propose recovery. A proposal freezes exits,
  auto-approves a guardian proposer, and requires two approvals plus
  `recoveryDelay`. The owner can cancel only an owner-initiated proposal; two
  guardians can cancel a guardian-initiated one.
- Recovery increments `epoch`, clears both freezes, revokes old withdrawals by
  epoch, resets withdrawal accounting and invalidates active policy, allowlist,
  rotation and restoration proposals.
- ETH only. No upgrade, module, ERC-20, NFT or `selfdestruct`.

The app does not deploy or point its demo vault at this contract. The testnet
console is the only path that reads or writes a deployed contract, and only when
environment configuration exists.

---

## 6. Environment variables

Client (provisioned by the platform; do not edit `.env` files):

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | Convex deployment URL used by the React client |

Convex deployment:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Auth site URL and fallback signing domain allowlist |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth token signing/verification |
| `NONCE_ALLOWED_DOMAINS` | Optional comma-separated extra hosts allowed to request wallet signatures |
| `BASE_SEPOLIA_RPC_URL` | Server-side Base Sepolia RPC for testnet reads |
| `NONCE_VAULT_ADDRESS` | Deployed contract address |
| `NONCE_CHAIN_ID` | Must be `84532` |
| `NONCE_DEPLOYMENT_TX_HASH` | Deployment transaction hash |
| `NONCE_CONTRACT_VERIFIED` | `true` only after Basescan verification |
| `NONCE_EXPLORER_URL` | Optional explorer base URL |

Contract deployment only (shell environment, never committed):
`BASE_SEPOLIA_RPC_URL`, `VAULT_OWNER`, `NONCE_MONITOR`, `GUARDIAN_ONE`,
`GUARDIAN_TWO`, `GUARDIAN_THREE`, `PER_TX_LIMIT_WEI`, `LARGE_THRESHOLD_WEI`,
`ROLLING_LIMIT_WEI`, `WITHDRAWAL_DELAY_SECONDS`, `RECOVERY_DELAY_SECONDS`,
`POLICY_DELAY_SECONDS`, `BASESCAN_API_KEY`. Sign with a Foundry keystore
(`--account`); `DEPLOYER_PRIVATE_KEY` is for local simulation only.

Email delivery is **not configured**: `notifications.settings` reports
`emailDeliveryConfigured: false` and the interface says so.

---

## 7. Testnet deployment

No deployment exists in this environment. The full procedure is
[`TESTNET_DEPLOYMENT.md`](./TESTNET_DEPLOYMENT.md). Summary:

1. Use Foundry with the vendored `forge-std`, compile and run `forge test -vvv`.
   Do not deploy on a solc compile or a local test pass alone.
2. Choose distinct owner, monitor, deployer and three guardian accounts. Fund the
   deployer with Base Sepolia ETH only.
3. Set constructor parameters within immutable bounds.
4. Simulate `Deploy.s.sol`, confirm logged values, broadcast, verify on Basescan.
5. Record address, deployment transaction, block and constructor arguments.
6. Set `BASE_SEPOLIA_RPC_URL`, `NONCE_VAULT_ADDRESS`, `NONCE_CHAIN_ID=84532`,
   `NONCE_DEPLOYMENT_TX_HASH`, and only then `NONCE_CONTRACT_VERIFIED=true`.
7. Open `/testnet` and confirm live state. If the page shows blockers, the
   configuration is incomplete; do not invent values.
8. Run the negative checks in the deployment guide: early execution,
   insufficient approvals, rolling limit, reservation exhaustion, freeze,
   recovery cancellation, restoration, rotation and expiry.

The contract has no admin sweep. Test funds can only leave through the policy.

---

## 8. Monitoring runbook

**Health states**

| State | Meaning | Product behaviour |
| --- | --- | --- |
| `ACTIVE` | Checkpoint current, lag within bound | Signals verified; automated response allowed |
| `DEGRADED` | Watcher unhealthy or lagging | Health degraded; automated responses withheld |
| `OFFLINE` | No checkpoint / process stopped | Protection marked at risk; on-chain delays are the only safeguard |

**What to watch**

- `monitorCheckpoints`: `lastProcessedBlock`, `lagBlocks`, `lastProcessedAt`,
  `consecutiveFailures`, `health`.
- `lockdownRequests` stuck in `PENDING` or `SUBMITTED`: latency and failure
  reasons.
- `incidents` with status `FAILED` or unacknowledged high-risk records.
- `systemHealth` rows for monitor, indexer and notification service.
- Testnet indexer: `monitorCheckpoints` entry for `base-sepolia-testnet`,
  `testnetAlerts`, last indexed block and consecutive failures.
- Notification backlog: in-app delivery is real; email is not.
- Testnet: frozen state, epoch, rolling remaining, reserved balance, active
  proposals and receipt status.

**Failure handling**

1. If monitoring is degraded/offline, say so and do not claim protection.
   Existing withdrawal delays and guardian thresholds remain in force on-chain.
2. If a lockdown submission fails, inspect `failureReason`, use the bounded retry
   on the incident, and escalate to the owner. Never display the vault as locked.
3. If verification is delayed, the incident stays `DETECTED`; do not fabricate a
   confirmation.
4. If the database is lost, assets are unaffected on-chain, but evidence and
   audit continuity are lost. Export/escrow evidence outside the primary
   deployment for production.
5. If a false positive freezes the vault, guardian restoration is the release
   path; if the owner is also compromised, use recovery. These are deliberate
   separate paths.

Sandbox drills: `/protection` can set monitor health and produce each signal type,
including `failLockdown`. These controls exist only because no watcher is
configured.

---

## 9. Demo walkthrough

1. **Sign in** at `/auth` with email OTP, or choose sandbox access.
2. **Onboarding** at `/onboarding`: connect a browser wallet to verify ownership
   by signature, or attach a sandbox signer. A demo signer leaves ownership
   unverified and the checklist says so.
3. **Create the vault.** Deployment is recorded as `SIMULATED`; no address is
   invented.
4. **Set the policy** (e.g. 0.5 ETH per transaction, 2.5 ETH per 24h, 0.1 ETH
   large threshold, 30-minute delay). The minimum delay is 10 minutes. Save.
5. **Add three guardians** and confirm them. Confirmations are `SIMULATED`; no
   guardian keys exist.
6. **Enable three decoys.** They hold no funds and have no vault role.
7. **Verify safeguards.** Coverage, mandatory gaps and monitor health are computed
   from stored state, not from the wizard.
8. **Fund the ledger** from `/dashboard` or `/vault` (e.g. 2.4 ETH, 1,250 USDC).
   Balances are sandbox entries.
9. **Withdraw 0.05 ETH** to any address: below the threshold, but still queued for
   at least 10 minutes. **Withdraw 0.4 ETH**: it needs two simulated guardian
   approvals and the policy delay. Both can be cancelled before execution.
10. **Propose a policy change** on `/vault`: it is timelocked for 2 minutes and
    hardening changes still wait. A weakening change requires two approvals.
    Watch the countdown and execute after the delay.
11. **Produce a `SIGNED_TX` signal** at `/protection`. Verification runs on the
    scheduler (a few seconds). The incident appears in `/activity`, then a
    lockdown request moves `PENDING → SUBMITTED → CONFIRMED`; the vault state
    becomes `LOCKDOWN` and pending withdrawals are cancelled.
12. **Review evidence** at `/activity/:id`: evidence hash, block references,
    signals, risk rationale, lockdown attempts with latency, and review actions.
    A locked vault cannot be released from this screen.
13. **Recover** at `/recovery`: choose guardian- or owner-initiated, enter a
    distinct replacement signer, record two simulated guardian approvals, wait for
    the 2-minute delay, then execute. The old signer is revoked, the vault becomes
    `RESTORED`, and old withdrawals are invalid.
14. **Test cancellation rules:** open guardian-initiated recovery and try to
    cancel as owner (rejected); record two guardian cancel votes. Open an
    owner-initiated proposal and cancel it as owner.
15. **Drill failure paths** on a fresh sandbox vault: `failLockdown` must show a
    failed attempt, not a locked vault; set monitoring to `DEGRADED`/`OFFLINE` to
    see protection downgrade and automated response withheld; send
    `UNSOLICITED_TRANSFER` to confirm no incident or lockdown.

---

## 10. Verification performed

- `bun convex dev --once` — passed at the end of the work; functions, cron and
  generated types are current.
- `bun tsc -p tsconfig.app.json --noEmit` and `bun tsc -b --noEmit` — passed, exit 0.
- `forge build` — passed with Solidity 0.8.24 and the optimizer.
- `forge test -vv` — 50 passed, 0 failed; 3 invariants at 256 runs / 128,000
  calls / 0 reverts; fuzz runs at 256.
- `forge test --fork-url https://sepolia.base.org -vv` — 50 passed, 0 failed,
  including a local deploy/deposit on forked Base Sepolia state.
- Slither 0.11.6 — 13 informational findings, no high/medium findings.
- Deploy script dry-run on a Base Sepolia fork — succeeded; **no broadcast**.
- `bun test tests/policyRules.test.ts` — 8 passed, 0 failed. Covers aged pending
  reservations, executed-window accounting, status exclusions, asset separation
  and policy weakening/minimum-delay validation.
- Source inspection of schema, backend guards, recovery cancellation, policy
  execution, testnet config/read/verify/indexer and the console.

**Not run:** broadcast deployment, Basescan verification, live contract reads
against a deployed address, wallet transaction tests, browser end-to-end tests,
load tests and accessibility/visual review. See
[`TEST_REPORT.md`](./TEST_REPORT.md).

---

## 11. Known limitations

The full list is [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md). The main ones:

- No independent audit or deployment. Local contract tests pass, but remain
  bounded and are not a proof.
- Demo balances, transfers and guardian approvals are simulated.
- Demo policy and recovery delays are compressed to 2 minutes.
- The testnet indexer is a bounded polling worker, not a proven 24/7 watcher;
  decoy signals remain synthetic.
- Testnet console is a global view of one configured contract, not a per-user
  TESTNET vault. It can write policy proposals but not allowlist or
  guardian-rotation changes.
- No guardian approval app, notification or signature collection workflow.
- ETH-only contract; demo USDC is a ledger, not a token.
- Scheduler timing is best effort.
- Evidence is integrity-oriented, not legal proof.
- No account recovery for NONCE itself.
- No browser or visual verification was performed.

---

## 12. Security assumptions

- The user's wallet, browser and device are trusted to the extent that a
  compromised browser can sign malicious payloads. NONCE narrows impact but cannot
  prevent this.
- Convex Auth correctly authenticates sessions; every demo read/write is scoped by
  `userId`, never by a client-supplied vault id alone.
- The signing domain check prevents cross-site challenge reuse; challenges are
  one-time, short-lived and bound to chain, address and nonce.
- The monitor key is separate. Compromise allows denial of service (freezing), not
  theft.
- Guardian independence is assumed. Two colluding or compromised guardians can
  replace the signer; three is the recovery threshold, not a guarantee.
- The database is access-controlled. It holds no keys; a database compromise
  exposes records and evidence, not assets.
- Evidence hashes assume SHA-256 collision resistance; canonical JSON avoids
  ambiguity.
- Decoys are detection aids, not a guarantee.
- Blockchain finality and irreversibility are accepted. NONCE never claims to
  reverse a confirmed transfer.
- This is demonstration software with no warranty, audit, insurance or bug bounty.

---

## 13. Before production

1. Complete an independent audit and execute invariant/fuzz testing of the vault
   contract.
2. Replace the demo layer with a real chain adapter, confirmation depth, reorg
   handling and idempotent event ingestion.
3. Build a separate guardian approval application with real signatures, decoded
   transactions, quorum verification and out-of-band contact procedures.
4. Run the monitor as an isolated service with a separate freeze key, alerting,
   on-call rotation and a documented kill switch.
5. Add email/push delivery with provider receipts, retries and template review.
6. Anchor evidence externally and publish an incident-response policy.
7. Practise the full freeze, restoration and recovery drill on testnet with real
   independent guardians before any mainnet decision.
