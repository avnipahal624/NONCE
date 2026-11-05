# Known limitations

This document lists what this build does **not** do, what is simulated, and
which checks were not run. It is intentionally blunt. Do not describe NONCE as
audited, production-ready or fully tested.

## 1. Contract status

- **Unaudited.** `contracts/NONCEVault.sol` has had an internal source review,
  not an independent security audit.
- **Not deployed.** There is no Base Sepolia address or deployment transaction
  from this repository.
- **Foundry tests not executed.** `contracts/test/NONCEVault.t.sol` contains
  adversarial, fuzz and invariant tests, but `forge`/`cast` are unavailable in
  this environment. The test file is not evidence that the contract passes.
- **Compiled only.** The contract compiles with solc 0.8.24 with the optimizer
  (200 runs), runtime size approximately 19.5 KB. Compilation is not dynamic
  verification.
- **ETH only.** No ERC-20, NFT, upgrade, module, multi-sig or cross-chain logic.
- **No formal verification.** No Certora, Halmos, Kani, SMTChecker or equivalent
  proof was run.
- **No external audit of the deploy script.** It is a straightforward script but
  has not been executed or reviewed independently.
- **Fixed guardian count.** Three guardians, two required. There is no
  configurable threshold, guardian set larger than three, or social-recovery
  module.
- **No emergency sweep.** The owner cannot bypass policy to rescue funds. Test
  funds can be stranded if the policy and roles are configured badly.
- **No upgradeability.** A bug requires deploying a new contract and migrating
  funds through the policy. There is no proxy admin.
- **No transaction batching.** Approvals and proposals are one transaction at a
  time; a multisig wallet would need to batch externally.
- **Amounts are capped at `uint96`** for rolling reservations. The rolling limit
  must fit in `uint96`.
- **Reservation ring is 64 slots.** If 64 live reservations exist, a new request
  reverts with `RollingWindowFull` even if the rolling limit would allow it.
  This is a deliberate gas bound; a high-frequency vault can hit it.
- **Pending charges block allowance.** A pending withdrawal
  counts against the rolling budget until it executes, is cancelled or expires.
  This is intentional to prevent old requests from bypassing the budget, but it
  can make a fully queued vault wait for cleanup.
- **Executed spend is windowed from execution.** A charge counts for 24 hours
  after the transfer executes; the request's original timestamp is replaced.
- **A pending slot is never reused.** With 64 pending reservations the ring is
  full and new requests revert; there is no keeper in this build to expire them.
- **Expiry cleanup is manual or scheduled by the caller.** The contract exposes
  `cancelExpired`, but nothing in this repository runs a keeper.
- **Policy changes do not retroactively cancel pending requests.** A request
  valid at request time can still execute after a policy tightening or allowlist
  removal unless the vault is frozen, recovery occurs, the request is cancelled,
  or it expires. Response procedures should cancel affected pending requests.
- **A recipient contract can reject ETH.** The transfer reverts and the request
  remains unexecuted; there is no alternate pull-payment path.
- **No allowlist bulk import or pagination.** Entries are added one at a time.
- **`approveWithdrawal` reverts with `ApprovalIncomplete`** when called on a
  request that does not need approvals. It is a clarity issue, not an
  authorization bypass, but the error name is misleading.
- **No event indexing in the app.** The testnet console reads current state and
  one latest withdrawal; it does not reconstruct full history from logs.
- **No reorg/finality policy.** The console reports the receipt's block and
  confirmations as observed; it does not enforce a confirmation depth.

## 2. Demo mode

- **All balances and transfers are simulated.** No RPC connection is used for
  demo deposits or withdrawals. No transaction hash is produced.
- **Guardian approvals are simulated.** Sandbox guardians have no keys and no
  accounts. Clicking approve writes a `SIMULATED` approval record. It cannot
  satisfy a real signature requirement.
- **Recovery is simulated.** The demo mirrors the contract's ordering, epoch
  increment and pending-action cancellation, but there is no on-chain owner
  change.
- **Demo policy timelock is two minutes.** The contract minimum is one day. The
  UI labels the compression; do not mistake the demo timing for the deployed
  rule.
- **Demo recovery delay is two minutes.** The contract minimum is two days.
- **Demo withdrawal delay is at least ten minutes.** This matches the contract's
  small-withdrawal delay but makes the demo slow by design.
- **Demo USDC is not a token.** It is a ledger row with six decimals and a
  separate 2,500 / 10,000 / 500 token-unit policy. No ERC-20 contract exists.
- **Demo policy changes after funding are blocked.** The direct update path is
  initial-setup only; later changes must use the timelocked proposal flow.
- **Guardian set changes after funding are blocked in the demo.** Initial setup
  can add/confirm/remove. Full post-funding rotation is implemented in the
  contract, not in the demo backend/UI.
- **No real monitor.** Decoy signals are produced by a sandbox control. There is
  no block indexer, mempool watcher, signature verification of chain events or
  reorg handling.
- **No email, push or SMS.** Notifications are in-app only; there is no delivery
  receipt from an external provider.
- **Protection scoring is heuristic.** It checks stored demo state and refused to
  call demo mode "Protected", but it is not a guarantee.
- **Evidence is integrity-oriented.** SHA-256 plus canonical JSON can detect
  changes; it is not legal proof, external timestamping or chain-of-custody.
- **Audit records are database rows.** An operator with database access could
  alter them. There is no external anchoring or write-once storage.
- **Demo sessions are not vault keys.** A stolen NONCE login can perform demo
  actions and read records, but cannot sign testnet transactions without the
  wallet.

## 3. Testnet console and integration

- **No deployment is configured.** The `/testnet` page shows environment
  blockers rather than an address or state. This is intentional.
- **Global, not per-user.** The console observes one contract configured by
  environment variables. There is no TESTNET vault row linked to a NONCE
  account, and no ownership check on the observed contract.
- **No backend writes.** Allowlist changes and guardian rotation are available
  in the contract ABI but not exposed as console forms. The console supports
  freeze, deposit, withdrawal request/approve/execute/cancel, policy
  propose/approve/execute/cancel, recovery propose/approve/execute and
  restoration propose/approve/execute.
- **No guardian signature collection app.** Guardians must use a wallet and the
  console or another contract UI. There is no notification, approval link,
  hardware-wallet flow or transaction simulation before signing.
- **No automated monitor.** Nothing calls `freeze()` from observed chain events.
  The console's freeze button is manual and requires the monitor or owner key.
- **No backend signing.** The backend cannot submit transactions. All writes are
  wallet-signed in the browser.
- **RPC trust.** The server-side read trusts the configured RPC. A malicious or
  stale RPC can return wrong state; the console cannot independently prove it.
- **No chain other than Base Sepolia.** `NONCE_CHAIN_ID` must be `84532`; the app
  does not support mainnet or another testnet.
- **No wallet connection persistence.** Refreshing the page requires connecting
  the wallet again.
- **No gas estimation UX.** The wallet estimates gas; a revert may only appear
  after submission.
- **No transaction replacement/cancel UI.** Use the wallet.
- **No explorer API key in the app.** Explorer links are plain Basescan URLs.

## 4. Authentication, accounts and privacy

- **No NONCE account recovery.** Losing access to the sign-in email and all
  sessions means starting a new account. Vault recovery is separate.
- **Wallet ownership proof is optional.** A sandbox signer is `DEMO_SIGNER`, not
  a verified signature, and the UI says so.
- **Domain allowlist configuration is deployment-dependent.** If
  `NONCE_ALLOWED_DOMAINS` / `SITE_URL` is missing, the challenge domain check is
  weaker. The message still binds the domain but phishing resistance is reduced.
- **No anonymity.** On-chain addresses and transactions are public.
- **No fiat values.** The app does not display prices or portfolio values it
  cannot verify.
- **No NFT, swap, yield, staking or fiat on-ramp.**
- **Single vault per account in the demo.** There is no multi-vault workspace.
- **No team roles or shared accounts.** One NONCE account owns one demo vault.
- **No email verification guarantee.** The auth implementation follows the
  template; production identity policy is out of scope.

## 5. Operational limitations

- **Scheduler timing is best effort.** Convex scheduled functions can run late;
  the UI shows stored timestamps and does not claim earlier execution.
- **No on-call rotation, alerting or incident-response integration.** The
  monitoring runbook is documentation, not an operated service.
- **No load, soak, chaos or browser end-to-end tests.** No browser interaction
  was performed for this work; visual and responsive behaviour was not verified
  in a running preview.
- **No accessibility audit.** Labels and non-colour status cues exist, but no
  screen-reader or WCAG audit was run.
- **No mobile device testing.** Layout is responsive by construction, not
  device-verified.
- **No dependency or supply-chain audit.** `viem`, Convex, React, Vite and the
  shadcn/Radix tree are used as installed.
- **No backup/restore drill.** Convex data loss would lose demo history and
  evidence.
- **No cost model.** RPC, Convex and gas costs are not estimated.

## 6. Verification actually performed

- `bun tsc -p tsconfig.app.json --noEmit` and `bun tsc -b --noEmit` — passed
  at the end of this work.
- `bun convex dev --once` — passed; functions and generated types pushed
  successfully to the development deployment.
- `bunx solc@0.8.24 --optimize --optimize-runs 200` — compiled the final
  contract successfully; no Foundry tests were run.
- `bun test tests/policyRules.test.ts` — 8 passed, 0 failed, covering backend
  rolling-reservation accounting and policy validation.
- Source inspection of the schema, backend guards, recovery cancellation rules,
  testnet config/read/verify actions and the new console.

**Not run:** Foundry build/tests/fuzz/invariants, deployment, Basescan
verification, RPC reads against a real contract, wallet transaction tests,
browser end-to-end tests, load tests, accessibility audit and visual review.

## 7. Before any real-value use

1. Independent audit and executed invariant/fuzz suite.
2. A monitored deployment with a real watcher, alerting, on-call and a rehearsed
   freeze/restoration drill.
3. A separate guardian approval application with transaction decoding,
   out-of-band verification and key custody procedures.
4. A tested recovery and guardian-availability plan (what happens if one or two
   guardians are unreachable).
5. Policy values based on real usage, not demo defaults; documented rationale
   for limits, delays and thresholds.
6. External evidence anchoring and retention.
7. Legal, regulatory and insurance review appropriate to the jurisdiction.
8. A mainnet deployment plan that is separate from this Base Sepolia reference;
   this repository does not authorize or support mainnet.
