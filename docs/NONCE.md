# NONCE — build and operations notes

NONCE is a self-custodial crypto security vault: a consumer interface around
withdrawal rules, decoy-based intrusion evidence, an explicit lockdown state
machine, and two-of-three guardian recovery.

**Status: sandbox demonstration.** No contract is deployed, no RPC watcher is
running, no real funds are involved, and every execution path is labelled
`SIMULATED` in the product. Do not send real assets to any address shown.

---

## 1. Architecture

```
┌──────────────────────────── Browser (Vite + React 19) ────────────────────────────┐
│  Marketing pages           Auth (email OTP / sandbox)      Protected app shell      │
│  /  /how-it-works          /auth                           /dashboard /vault ...    │
│  /security /features /faq                                  RequireAuth + sidebar    │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ Convex React client (reactive queries, mutations)
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│                              Convex deployment                                     │
│                                                                                    │
│  identity & access        vault domain               detection                     │
│  wallets.createChallenge  vaults.workspace           monitor.triggerDecoySignal    │
│  walletVerify (Node,      withdrawals.request        monitor.verifyIncident        │
│   viem verifyMessage)     withdrawals.cancel         monitor.submitLockdown        │
│                           guardians / decoys         monitor.confirmLockdown       │
│                           recovery.proposals         monitor.retry / health        │
│                                                                                    │
│  append-only audit + notifications + scheduler (delayed withdrawals, verification) │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ future: RPC ingestion + scoped freeze key
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│  NONCEVault.sol (reference only)  — owner, monitor, 3 guardians, policy, epoch      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Trust boundaries:

- The **browser** proves account access and may prove wallet ownership with a
  signature. It never holds a private key for the vault.
- The **Convex backend** authorizes every vault action against the signed-in owner,
  classifies evidence and preserves audit records. It cannot move assets and holds no
  signing key.
- The **vault contract** (in production) enforces limits, delays, allowlists, freeze
  and guardian quorum. The sandbox emulates those rules in backend code and says so.
- The **monitor** holds a narrowly scoped freeze permission. It cannot withdraw,
  upgrade, change policy or approve recovery.

### Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | public | Marketing home and demo framing |
| `/how-it-works`, `/security`, `/features`, `/faq` | public | Product, threat model, capabilities, honest answers |
| `/auth` | public | Email OTP or sandbox access; `returnTo` preserved |
| `/onboarding` | protected | Nine-step vault setup |
| `/dashboard` | protected | Balances, posture, shortcuts, recent activity |
| `/vault` | protected | Assets, policy, pending withdrawals, history |
| `/protection` | protected | Checklist, decoy network, signal simulation, monitor health |
| `/activity` | protected | Timeline, incidents, audit log, service health |
| `/activity/:incidentId` | protected | Evidence, lockdown attempts, review actions |
| `/recovery` | protected | Guardians, proposals, approvals, execution |
| `/settings` | protected | Profile, notifications, wallets, environment |

All protected routes use `RequireAuth`, which redirects to `/auth?returnTo=…`. The
auth page's fallback destination is `/dashboard`, never the public landing page.

### File structure

```
src/
  main.tsx                     routes, providers, error boundaries
  index.css                    dark-emerald tokens, vault utilities, motion
  pages/                       Landing, HowItWorks, SecurityArchitecture, Features, Faq,
                               Auth, Onboarding, Dashboard, Vault, Protection, Activity,
                               IncidentDetail, Recovery, Settings, NotFound
  components/nonce/            AppShell, Logo, VaultDial, StatusPill, Address, PageHeader,
                               MarketingShell, MarketingBlocks, AssetActions, PolicyDialog
  components/RequireAuth.tsx   existing route guard (unchanged)
  hooks/use-workspace.ts       single reactive source for vault + protection state
  lib/nonce.ts                 formatting, tones, status vocabulary
  lib/wallet.ts                EIP-1193 connect / personal_sign / Base Sepolia switch
  convex/schema.ts             auth tables + NONCE domain tables
  convex/nonce/                backend modules listed in §3
contracts/                     NONCEVault.sol, Foundry test + deploy script, README
docs/NONCE.md                  this document
```

---

## 2. Frontend summary

- **Theme.** Deep green-black surfaces (`#071310`, `#081713`, `#10231D`, `#173229`),
  mint primary (`#57D5A5`), ivory text, sage secondary, hairline borders. Inter for UI,
  Instrument Serif italic for editorial accents, JetBrains Mono for addresses and refs.
  Tokens are shared through Tailwind `@theme` plus the existing shadcn CSS variables.
- **Marketing.** A complete landing page plus four substantive subpages. Every claim is
  paired with its limitation; the sandbox status is visible in the nav, footer and CTA.
- **App shell.** Fixed sidebar (Home, My Vault, Protection, Activity, Recovery, Settings),
  live protection card, top bar with network badge, persistent demo banner, in-app
  notification popover, account menu and a mobile bottom navigation.
- **Data flow.** `useWorkspace` subscribes once to `vaults.workspace`; pages read vault,
  assets, policy, decoys, guardians, monitoring and protection from that snapshot. Every
  write is a Convex mutation, so balances, pending withdrawals and incidents update
  without polling.
- **Honesty.** Fiat values are never shown. Token quantities are labelled as sandbox
  ledger entries. Simulated objects carry `SIMULATED`, `DEMO_SIGNER` or `SIM-…`
  references. Failed lockdowns render as failed, not locked.
- **Accessibility.** Status is never colour-only; icon buttons have labels; focus rings
  are preserved; motion respects `prefers-reduced-motion`.

### Key client flows

- **Wallet proof.** `wallets.createChallenge` issues a one-time EIP-4361-style message
  bound to domain, chain, address and nonce. The wallet signs it with `personal_sign`;
  a Node action recovers the address with viem and rejects wrong signers, expired or
  reused challenges. A sandbox signer is stored as `DEMO_SIGNER`, not as proof.
- **Withdrawals.** React Hook Form + Zod validate amount and destination. The mutation
  applies policy, queues the request, schedules finalization and returns an explicit
  status. Pending requests can be cancelled from `/vault`; a confirmed lockdown cancels
  them automatically.
- **Incident drill.** `/protection` produces a decoy signal. Verification runs on the
  scheduler, creates an incident and, for high-risk types, a lockdown request. The
  Activity detail page exposes evidence hashes, signals, rationale, attempts and review
  actions.
- **Recovery.** `/recovery` requires a locked vault, a distinct replacement signer, two
  distinct guardian approvals and the recovery delay. Execution revokes the old signer,
  clears pending withdrawals and lands in `RESTORED`.

---

## 3. Backend summary

All modules live in `src/convex/nonce/`. Queries and mutations resolve the user from the
Convex Auth session, then resolve the vault by `userId`; `requireVaultOwner` is used for
every vault-scoped write.

| Module | Responsibility |
| --- | --- |
| `wallets.ts` | Challenge creation, demo-signer registration, primary wallet, revocation, one-time challenge consumption |
| `walletVerify.ts` | `"use node"` action; viem `verifyMessage`, domain/chain/expiry/replay checks |
| `vaults.ts` | Workspace snapshot, protection scoring, sandbox vault creation, demo funding, rename, simulated sync |
| `withdrawals.ts` | Policy updates, request/cancel, simulated guardian approval, scheduled finalization |
| `decoys.ts` | Decoy CRUD, pause/activate, per-decoy monitoring policy |
| `monitor.ts` | Signal ingestion, classification, verification, lockdown submit/confirm/failure/retry, manual lockdown, health controls |
| `incidents.ts` | Incident list/detail, evidence, acknowledge, false-positive review |
| `recovery.ts` | Proposals, simulated approvals, execution, rejection |
| `guardians.ts` | Add, confirm, remove guardians |
| `activity.ts` | Unified feed and audit/security log |
| `notifications.ts` | In-app notification list, read state, preferences |
| `demo.ts` | One-call demo seeding |
| `hash.ts`, `shared.ts`, `db.ts` | SHA-256, constants/validators, ownership guards, notifications, audit, ledger helpers |

### State machines

Vault: `NORMAL → RESTRICTED → LOCKDOWN → RECOVERY → RESTORED`, with transitions
validated server-side and recorded with a source (`SIMULATED` in this build).

Incident: `DETECTED → VERIFIED → RESPONSE_PENDING → LOCKDOWN_CONFIRMED → RECOVERY →
RESOLVED`, plus `FALSE_POSITIVE` and `FAILED`.

Lockdown request: `PENDING → SUBMITTED → CONFIRMED`, with `FAILED` and `CANCELLED`.
Confirmation is a separate observation; nothing is called locked before it.

Withdrawal: `QUEUED` or `AWAITING_GUARDIANS → READY → COMPLETED`, with `CANCELLED`,
`BLOCKED` and `FAILED`.

Recovery: `AWAITING_GUARDIANS → APPROVED → EXECUTING → COMPLETED`, with `REJECTED` and
`EXPIRED`.

### Detection rules

- `UNSOLICITED_TRANSFER` is low risk: recorded, never escalates on its own, never freezes.
- `CONTRACT_CALL` is medium risk.
- `SIGNED_TX` and `NONCE_CHANGE` are high risk and require corroboration before a
  lockdown request.
- Duplicate events are suppressed by unique key; incident creation is rate limited and
  cooled down.
- Verification is skipped when the monitor checkpoint is not `ACTIVE`; the vault is not
  reported as protected by a monitor that is down.

### Scheduling

Convex scheduler performs withdrawal finalization, signal verification and the
lockdown submit/confirm pipeline. Timings are best effort; the UI shows the recorded
timestamps and never claims an earlier execution than the stored `executeAfter`.

---

## 4. Data model

`schemaValidation: false` is retained, with validators used for all domain writes.

- **Identity**: `users` (auth), `walletIdentities`, `authChallenges`.
- **Vault**: `vaults`, `vaultAssets`, `withdrawalPolicies`, `withdrawalRequests`,
  `vaultTransactions`.
- **Detection**: `decoys`, `decoyPolicies`, `monitorCheckpoints`, `blockchainEvents`,
  `threatSignals`, `threatAssessments`.
- **Response**: `incidents`, `incidentEvidence`, `lockdownRequests`.
- **Recovery**: `guardians`, `recoveryProposals`, `guardianApprovals`.
- **Operations**: `notifications`, `auditEvents`, `systemHealth`.

Notable field choices:

- `vaults.deploymentStatus` separates `SIMULATED`, `PENDING`, `CONFIRMED`, `FAILED`.
- `blockchainEvents.txHash` is optional: simulated events must not invent a hash.
- `lockdownRequests` records `attempt`, `latencyMs`, `failureReason` and
  `simulatedFailure`, so a failed submission is first-class data.
- `guardianApprovals.messageHash` binds an approval to the proposal.
- `notifications.channel` is `IN_APP` only, with a real `deliveredAt`.
- Evidence and audit records are append-only from the application's perspective; there
  is no client-facing delete.

---

## 5. Contract summary

`contracts/NONCEVault.sol` is a reference, unaudited ETH vault:

- owner queues withdrawals under `perTransactionLimit`;
- requests at or above `largeWithdrawalThreshold` wait `withdrawalDelay` and require two
  guardian approvals;
- optional allowlist;
- `monitor` can only `freeze()`;
- recovery needs two guardian approvals plus `recoveryDelay`, replaces the owner, clears
  the freeze and increments `epoch`, invalidating pre-containment withdrawals;
- ETH only; no upgradeability, modules, guardian rotation or ERC-20 support.

The app does **not** point at this contract. `vaults.deploymentStatus` remains
`SIMULATED`, no contract address is stored, and no transaction is broadcast.

---

## 6. Environment variables

Client (already provisioned by the platform; do not edit `.env.local`):

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | Convex deployment URL used by the React client |

Convex deployment:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Auth site URL and fallback signing domain allowlist |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth token signing/verification |
| `NONCE_ALLOWED_DOMAINS` | Optional comma-separated extra hosts allowed to request wallet signatures |

Contract deployment only (shell environment, never committed):

`BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `VAULT_OWNER`, `NONCE_MONITOR`,
`GUARDIAN_ONE`, `GUARDIAN_TWO`, `GUARDIAN_THREE`, `PER_TX_LIMIT_WEI`,
`LARGE_THRESHOLD_WEI`, `WITHDRAWAL_DELAY_SECONDS`, `RECOVERY_DELAY_SECONDS`,
`BASESCAN_API_KEY`.

Email delivery is **not configured**: `notifications.settings` reports
`emailDeliveryConfigured: false`, and the interface says so.

---

## 7. Testnet deployment

1. Install Foundry and `forge-std`, then `cd contracts && forge build && forge test -vvv`.
2. Choose a fresh deployer key, a vault owner signer, a monitor key held by the future
   watcher, and three genuinely independent guardians.
3. Export the variables from §6. Confirm the values with `cast` before broadcasting.
4. Simulate with `forge script script/Deploy.s.sol:DeployNONCEVault --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY"`.
5. Broadcast with `--broadcast --verify` and record the address and block.
6. Fund only with testnet ETH. Verify `freeze()`, the delay, allowlist and guardian
   quorum manually, including a failed `executeWithdrawal` before the delay.
7. Do not wire the app to the contract until a real watcher exists. The current backend
   cannot submit a transaction and must not pretend to.

Full checklist: `contracts/README.md`.

---

## 8. Monitoring runbook

**Health states**

| State | Meaning | Product behaviour |
| --- | --- | --- |
| `ACTIVE` | Checkpoint is current, lag within bound | Signals verified; automated response allowed |
| `DEGRADED` | Watcher is unhealthy or lagging | Health shown as degraded; automated responses withheld |
| `OFFLINE` | No checkpoint / process stopped | Protection marked at risk; on-chain delays are the only safeguard |

**What to watch**

- `monitorCheckpoints`: `lastProcessedBlock`, `lagBlocks`, `lastProcessedAt`,
  `consecutiveFailures`, `health`.
- `lockdownRequests` stuck in `PENDING` or `SUBMITTED`: latency and failure reasons.
- `incidents` with status `FAILED` or unacknowledged high-risk records.
- `systemHealth` rows for the monitor, indexer and notification service.
- Notification backlog: in-app delivery is real; email is not.

**Failure handling**

1. If monitoring is degraded/offline, say so and do not claim protection. Existing
   withdrawal delays and guardian thresholds remain in force on-chain.
2. If a lockdown submission fails, inspect `failureReason`, use the bounded retry on
   the incident, and escalate to the owner. Never display the vault as locked.
3. If verification is delayed, the incident stays `DETECTED`; do not fabricate a
   confirmation.
4. If the database is lost, assets are unaffected on-chain, but evidence and audit
   continuity are lost. Escrow or export evidence outside the primary deployment for
   production.
5. If a false positive locks a vault, recovery is the release path. This is deliberate.

Sandbox drills: `/protection` can set monitor health and produce each signal type,
including `failLockdown`. These controls exist only because no watcher is configured.

---

## 9. Demo walkthrough

1. **Sign in** at `/auth` with email OTP, or choose sandbox access. Sandbox accounts are
   labelled anonymous/unverified.
2. **Onboarding** at `/onboarding`: connect a browser wallet to verify ownership by
   signature, or attach a sandbox signer. A demo signer leaves ownership unverified and
   the checklist says so.
3. **Create the vault.** Deployment is recorded as `SIMULATED`; no address is invented.
4. **Set the policy** (e.g. 1 ETH limit, 0.25 ETH threshold, 30-minute delay). Save.
5. **Add three guardians** and confirm them. Confirmations are `SIMULATED`; the UI says
   no guardian keys exist.
6. **Enable three decoys.** They hold no funds and have no vault role.
7. **Verify safeguards.** Coverage, mandatory gaps and monitor health are computed from
   stored state, not from the wizard.
8. **Fund the ledger** from `/dashboard` or `/vault` (2.4 ETH, 1,250 USDC). Balances are
   sandbox entries.
9. **Withdraw 0.1 ETH** to any address: with the default threshold it is small and
   completes as a simulated execution. **Withdraw 0.4 ETH**: it queues under guard and
   can be cancelled from `/vault`.
10. **Produce a `SIGNED_TX` signal** at `/protection`. Verification runs on the
    scheduler (a few seconds). The incident appears in `/activity`, then a lockdown
    request moves `PENDING → SUBMITTED → CONFIRMED`; the vault state becomes `LOCKDOWN`
    and pending withdrawals are cancelled.
11. **Review evidence** at `/activity/:id`: evidence hash, block references, signals,
    risk rationale, lockdown attempts with latency, and review actions. A locked vault
    cannot be released from this screen.
12. **Recover** at `/recovery`: enter a distinct replacement signer, record two
    simulated guardian approvals, wait for the 2-minute recovery delay, then execute.
    The old signer is revoked, the vault becomes `RESTORED`, and old withdrawals are
    invalid.
13. **Drill failure paths** on a fresh sandbox vault: `failLockdown` must show a failed
    attempt, not a locked vault; set monitoring to `DEGRADED`/`OFFLINE` to see protection
    downgrade and automated response withheld; send `UNSOLICITED_TRANSFER` to confirm no
    incident or lockdown.

---

## 10. Verification performed

- `bun convex dev --once` — succeeded; functions and generated types are current.
- `bun tsc -p tsconfig.app.json --noEmit` — passed, exit 0.
- `bun tsc -b --noEmit --force` — passed, exit 0.
- SHA-256 helper checked manually against Node `crypto` for several inputs during
  implementation (not retained as an automated test).
- Dependency added: `viem` (wallet signature recovery in the Node action).

**Not run:** browser/end-to-end interaction tests, Convex unit tests, Foundry build or
tests (toolchain unavailable), load tests, and any deployment. No claim is made that the
UI flows were exercised in a browser.

---

## 11. Known limitations

- **Everything executes in simulation.** No RPC client, no chain reads, no broadcasts,
  no real balances. Do not deposit real assets.
- **No live monitor.** Decoy signals are produced by a sandbox control. There is no
  block indexer, mempool watcher or reorg handling.
- **Guardian approvals are simulated.** No guardian account, signature collection or
  notification to guardians exists. The threshold logic is real; the signatures are not.
- **Recovery delay is two minutes** in the sandbox for demonstrability. Production should
  use hours or days; the reference contract defaults are configuration, not advice.
- **Single chain, ETH + USDC only**, no NFTs, no fiat valuation, no swaps or yield.
- **No email, push or SMS.** In-app only; no delivery receipts.
- **Contract is unaudited** and omits ERC-20 handling, upgradeability, guardian rotation
  and formal invariants. Its tests have not been executed here.
- **Scheduler timing is best effort.** Verification and finalization can be delayed.
- **Sandbox signer has no key.** It cannot satisfy any real signature requirement, and
  the protection score correctly refuses to treat it as verified ownership.
- **Evidence is integrity-oriented, not legal proof.** No chain-of-custody, timestamping
  authority or jurisdictional attestation.
- **No account recovery for NONCE itself.** Losing access to the sign-in email and all
  sessions means starting a new account; vault recovery is a separate on-chain process.

---

## 12. Security assumptions

- The user's wallet, browser and device are trusted to the extent that a compromised
  browser can sign malicious payloads. NONCE narrows impact but cannot prevent this.
- Convex Auth correctly authenticates sessions; every vault read/write is additionally
  scoped by `userId`, never by a client-supplied vault id alone.
- The signing domain check prevents cross-site challenge reuse; challenges are
  one-time, short-lived and bound to chain, address and nonce.
- The monitor's freeze key is held by a separate service identity. Compromise allows
  denial of service (freezing), not theft. That is a deliberate trade-off.
- Guardian independence is assumed. Two colluding or compromised guardians can replace
  the signer; three is the recovery threshold, not a guarantee.
- The database is assumed to be access-controlled. It holds no keys, so a database
  compromise exposes records and evidence, not assets.
- Evidence hashes assume SHA-256 collision resistance; canonical JSON is used to avoid
  ambiguity.
- Decoys are detection aids. They catch opportunistic attackers who touch addresses they
  should not, and they are not a guarantee of detection.
- Blockchain finality and irreversibility are accepted. NONCE never claims to reverse a
  confirmed transfer.
- This is demonstration software with no warranty, audit, insurance, or bug bounty.

---

## 13. Before production

1. Complete an independent audit and invariant testing of the vault contract.
2. Replace simulation with a real chain adapter, confirmations, reorg handling and
   idempotent event ingestion.
3. Build a separate guardian approval application with real signatures and quorum
   verification, plus out-of-band contact procedures.
4. Run the monitor as an isolated service with its own freeze key, alerting, on-call
   rotation and a documented kill switch.
5. Add email/push delivery with provider receipts, retries and template review.
6. Publish a threat model, incident-response policy and legal review of evidence claims.
7. Practise the full recovery drill on testnet with real independent guardians before
   any mainnet deployment.
