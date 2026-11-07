# NONCE UI redesign — P1 implementation record

## 1. Audit snapshot

The repository already had a working, honest security model. The redesign did
not replace it.

- Routes: `/`, `/how-it-works`, `/security`, `/features`, `/faq`, `/auth`,
  `/onboarding`, `/dashboard`, `/vault`, `/protection`, `/activity`,
  `/activity/:incidentId`, `/recovery`, `/testnet`, `/settings`.
- Frontend: React 19, Vite, Tailwind v4, shadcn/Radix, Framer Motion, viem,
  Convex React.
- Backend: Convex Auth plus the `src/convex/nonce/*` domain modules.
- Contract: `contracts/NONCEVault.sol`, ETH-only, unaudited, not deployed by this
  repository. It already enforces withdrawal limits, rolling reservations,
  minimum delays, freeze, timelocked policy changes, guardian quorum, recovery
  epochs and restoration.
- Sandbox: balances, transfers, freeze execution and guardian approvals are
  simulated Convex records.
- Live: `/testnet` reads a globally configured Base Sepolia contract through a
  server-side RPC action and submits wallet-signed writes. It stays separate from
  the sandbox.
- No schema, contract or backend behavior was changed in this pass.

### Important audit findings

1. The old dashboard already labelled simulated balances, but its composition
   made the security status, assets and testnet index compete for attention.
2. Incident detail had good evidence but no explicit response-stage timeline.
3. Withdrawal rows had status and an execution timestamp, but no visual journey
   from request to delay to quorum to execution.
4. Recovery had the full sandbox workflow but did not put the guardian approval
   state and delay at the top of the screen.
5. The testnet page had a deployment panel and blockers, but the distinct
   address, read, verification and indexer states were spread across panels.
6. The phrase “live” could be ambiguous. The redesign explicitly separates
   `Sandbox`, `Live workspace` and `Unverified` and never calls a demo vault
   protected.

## 2. Design system

- Updated the global emerald/ivory token set in `src/index.css` to the premium
  NONCE palette: `#071912`, `#102B22`, `#16382B`, `#305647`, `#56D6A4`,
  `#ADC8BA`, `#F2F5EE`, `#E9B45E`, `#EF7777`.
- Kept the existing Inter / Instrument Serif / JetBrains Mono system.
- Added a shared `Timeline` primitive with horizontal desktop and vertical
  mobile layouts. Each stage carries text, not colour alone, and has a
  screen-reader state label.
- Added `useNow` for display-only countdowns. The backend or contract timestamp
  remains authoritative.
- Reduced the amount of glowing gradient treatment; the primary visual emphasis
  is now hierarchy, status and evidence.
- Existing `prefers-reduced-motion` handling remains in place.

## 3. P1 screens

### Dashboard — `/dashboard`

Before: balances, posture, quick links, assets, activity and testnet index were
all visible, but the opening screen did not answer “what is my current security
status and what should I do next?” quickly enough.

After:

- A data-derived security status hero. It handles lockdown, recovery, open
  incident, incomplete setup, offline/degraded monitoring, sandbox-configured
  and live contract-confirmed states separately.
- The hero states the reason and the next recommended action.
- Four primary metrics: vault ETH balance, pending withdrawals, active alerts and
  guardian configuration.
- Five quick actions: deposit, request withdrawal, review alerts, manage
  guardians and view policy. Withdrawals are disabled while the vault is locked.
- Assets, withdrawals in flight and recent activity are visibly separated.
- Protection coverage, guardian quorum and the live testnet index have their own
  panels.
- The no-vault state is now an explanatory onboarding surface rather than an
  empty card.
- Demo balances and the lack of on-chain enforcement are stated in the hero,
  assets panel and risk note.

### Security Response Center — `/activity`

Before: a timeline-first activity page with tabs for incidents and audit.

After:

- The route opens on the Response queue.
- A response-status panel shows the active incident, severity, detection time,
  source, evidence count and required next action.
- The queue distinguishes open and closed incidents and shows whether a freeze
  request is confirmed, failed or still pending.
- A protocol panel explains Detect → Verify → Respond → Recover.
- An authority-boundary panel states that incident classification is a Convex
  record, while freeze state and guardian approvals must come from the contract
  or a confirmed receipt.
- The activity timeline and audit log remain available, with their existing
  filters and data.

### Incident detail — `/activity/:incidentId`

Before: evidence, lockdown attempts, signals and review actions were present.

After:

- Added a response timeline: detection, alert generation, response request,
  freeze submission, freeze confirmation and review. A step is complete only
  when its record or timestamp exists.
- Added a distinct “Detection source” field and on-chain transaction links only
  for `ONCHAIN` evidence.
- Added a response-authority card explaining that review does not unfreeze a
  vault and the testnet monitor must sign its own freeze transaction.
- Existing acknowledge, freeze-request, retry and false-positive actions are
  preserved.

### Withdrawal journey — `/vault`

Before: pending rows listed status, approvals and an execution timestamp.

After:

- Added a shared withdrawal timeline with:
  - request submitted,
  - ledger/transaction confirmation (sandbox is explicitly “no chain
    transaction”),
  - waiting period with a live display countdown,
  - guardian approvals only when the request actually requires them,
  - eligibility and completion, cancellation, block or failure.
- The countdown is display-only; the stored `executeAfter` remains the gate.
- The request dialog now shows freeze status, available balance, policy, the
  sandbox-only gas explanation and validates the amount against the selected
  asset before submitting.
- Existing cancel and simulated guardian approval paths remain, with their
  limitations stated.

### Guardian recovery — `/recovery`

Before: the page contained the full proposal, approval and execution workflow.

After:

- Added a recovery command panel with approval progress, delay countdown,
  proposed signer, execution window and next action.
- The active proposal now has a clear anchor for review actions and a live
  delay countdown.
- Guardian approval is explicitly marked “Sandbox · simulated”.
- The page links to the testnet console for the real guardian-wallet path and
  states that NONCE never impersonates a guardian.
- Owner-initiated cancellation, guardian-initiated two-guardian cancellation,
  duplicate approval rejection and execution gating remain server-enforced.

### Testnet console — `/testnet`

Before: deployment panel, configured state, indexer and write actions were
available, with environment blockers.

After:

- Added a deployment/read state rail: wallet, contract address, live read,
  source verification and indexer are separate stages.
- A configured address with a blocked read is explicitly shown as “Address
  present · read blocked”, not “not deployed”.
- Source verification is “not recorded” unless the environment says it is
  verified.
- Added a compact withdrawal timeline for the latest on-chain withdrawal read.
- Existing deploy panel, wallet connection, freeze, deposits, withdrawals,
  policy, recovery and restoration actions are preserved.
- No transaction is broadcast automatically.

## 4. Source-of-truth matrix

| Fact | Source used by the redesign |
| --- | --- |
| Sandbox balance | `vaultAssets` ledger, labelled simulated |
| Live vault state | `testnet.readVault` server action |
| Incident classification | Convex incidents/evidence/signals |
| Freeze state | Contract read or recorded sandbox state, never inferred from a request |
| Withdrawal eligibility | Stored `executeAfter` plus required approvals |
| Guardian approval count | Convex sandbox approvals or contract read |
| Transaction confirmed | Receipt/verification result only |
| Notification preference | Convex user preference |
| Deployment verification | Explicit environment flag, never inferred |

## 5. What is sandbox-only, live or planned

- **Sandbox:** dashboard balances, withdrawal requests, incident drills,
  freeze requests, policy proposals, guardian approvals and recovery execution.
- **Live:** `/testnet` reads and wallet-signed writes when environment variables
  are configured.
- **Planned, not implemented:** full notification history/filters, ERC-20
  custody, multi-vault UI, WalletConnect, external delivery channels.
- **Not changed:** Solidity contract, Foundry tests, Convex schema, auth.

## 6. Files changed in this pass

- `src/index.css`
- `src/lib/nonce.ts`
- `src/hooks/use-now.ts` (new)
- `src/components/nonce/AppShell.tsx`
- `src/components/nonce/Timeline.tsx` (new)
- `src/components/nonce/WithdrawalTimeline.tsx` (new)
- `src/components/nonce/AssetActions.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Activity.tsx`
- `src/pages/IncidentDetail.tsx`
- `src/pages/Vault.tsx`
- `src/pages/Recovery.tsx`
- `src/pages/Testnet.tsx`
- `docs/P2_ARCHITECTURE.md` (new)
- `docs/UI_REDESIGN.md` (new)
- `README.md` (new documentation links and route labels)
- `docs/NONCE.md` (route and flow labels)
- `docs/KNOWN_LIMITATIONS.md` (current lint/test counts)

## 7. Verification and limitations

- `bun tsc -b --noEmit` — passed.
- Focused ESLint on the changed files — passed with one existing Fast Refresh
  warning in `AppShell.tsx` (the file already exported `NoVaultYet` and a helper).
- `bun run lint` — still fails on 10 pre-existing errors in template/legacy files
  (`PolicyDialog`, carousel, sidebar, `use-mobile`, Onboarding, Settings) and 19
  warnings. No new lint error was introduced by this pass.
- `bun run build` — passed; Vite produced the production bundle and the 217 KB
  compiled artifact asset.
- `bun convex dev --once` — passed; functions and generated types are current.
- `bun test tests/policyRules.test.ts` — 8 passed, 0 failed.
- `forge test -vv test/NONCEVault.t.sol` — 49 passed, 0 failed. The contract was
  not modified.
- No browser E2E, MetaMask signing, responsive device or accessibility audit was
  performed in this environment.
- No screenshots were captured because this environment has no browser driver.
  The redesigned routes are `/dashboard`, `/activity`, `/activity/:incidentId`,
  `/vault`, `/recovery` and `/testnet`.
- The live testnet path still requires a deployed contract and configured RPC.
- The sandbox cannot prove a real guardian signature; it labels those approvals
  as simulated.
- The contract remains unaudited and ETH-only. ERC-20 and multi-vault work are
  architecture proposals in `docs/P2_ARCHITECTURE.md`, not implemented features.
