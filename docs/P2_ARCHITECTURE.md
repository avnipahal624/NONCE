# NONCE P2 architecture

This document is a design proposal, not a claim that the features below are
implemented. The current reference contract is ETH-only, unaudited and not
deployed from this repository. Do not deploy or modify it as part of this plan
without an explicit review and approval step.

## 1. Guardrails

- The contract remains the source of truth for balances, freeze state, limits,
  delays, allowances, guardian approvals and recovery epochs.
- Convex is the source of truth for application incidents, evidence, audit rows,
  notification preferences and user-scoped metadata.
- A sandbox record never overrides a confirmed contract state.
- No feature in this plan may request a seed phrase or private key.
- No contract deployment, migration or transaction broadcast is automatic.

## 2. Notifications

### What already exists

- `notifications` rows are user-scoped, written by `notify`, and exposed through
  `notifications.list`, `markRead` and `markAllRead`.
- `users.notifyInApp` and `users.notifyEmail` preferences exist.
- Adding an activity item or acknowledgement should not create duplicate
  notifications; each write path must remain idempotent where retries are
  possible.
- The app shell already renders an in-app popover and unread count.

### P2 application-layer work

1. Add a full notification history route with filters for severity and category.
2. Add explicit read/unread handling per row, not only “mark all read”.
3. Add a dedupe key to notification writes (incident reference + event, recovery
   proposal + approval count, withdrawal + stage).
4. Add preferences UI for in-app and future email categories.
5. Keep pending transactions labelled pending. A submitted hash is not success.
6. Do not add browser, email or push delivery until credentials, consent,
   unsubscribe behavior and delivery receipts are configured.

### Future delivery channels

- **Browser notifications:** permission request is user-initiated only; fall back
  to in-app when denied.
- **Email:** requires a transactional provider, verified sender domain, retry and
  bounce handling. No provider is configured in this repository.
- **Mobile push:** requires an app registration and device-token table. Out of
  scope for the current web build.

## 3. ERC-20 support

### Current contract boundary

`contracts/NONCEVault.sol` is an ETH vault. It has no ERC-20 transfer,
allowance, token registry or decimal handling. The sandbox's USDC row is a
simulated ledger entry and must not be presented as a real token balance.

### Options

1. **Separate token vault contract (recommended for a future phase).**
   Reuse the policy, delay, freeze and guardian machinery with a token address
   and token-specific accounting. This keeps the ETH contract unchanged.
2. **Multi-asset vault extension.** Materially larger change: token registry,
   per-token reservations, token-specific decimals, allowance flow and new
   invariant tests. Requires a new deployment and migration plan.
3. **UI-only token labels.** Rejected: it would imply real custody that does not
   exist.

### Required engineering before any token implementation

- Define supported-token admission (allowlist, proxy/mint risk, fee-on-transfer,
  rebasing and pause behavior).
- Handle token decimals without floating-point arithmetic.
- Decide pull-payment versus direct transfer and the allowance lifecycle.
- Model malicious or reverting tokens; never leave a withdrawal in a partially
  reserved state.
- Add unit, fuzz and invariant tests for token transfers, allowances and
  reservations.
- Run static analysis and an independent review.
- Document migration, deployment and rollback. No mainnet path is approved.

## 4. Multi-vault management

### Current boundary

The schema has a `vaults` table with a `userId`, but `getVaultForUser` selects a
single workspace vault. The demo UI therefore has one vault per account.

### Proposed application architecture

- `vaultMembers`: `vaultId`, `userId`, role (`OWNER`, `MONITOR`, `GUARDIAN`,
  `VIEWER`), status and verification timestamp.
- `vaultProfiles`: user-defined label, color/tag, created time. Labels are
  presentation only, never a security guarantee.
- Read models must be scoped by both `userId` and `vaultId`; no query may mix
  balances or incidents from different vaults.
- A vault selector belongs in the app shell and must preserve the selected
  vault across route changes.
- On-chain role checks remain authoritative. A Convex role row is an application
  permission, not proof that a wallet is the contract owner, monitor or guardian.
- Account switching must invalidate the selected vault and any balance/state
  cache. Chain switching must show an explicit unsupported-network state.

### Contract sequencing

Multi-vault tracking does not require changing the existing vault contract. It
does require a new deployment/read model, a network-aware RPC configuration and
a migration plan for existing users. Do not create additional contracts until
the role model and read isolation are reviewed.

## 5. Web3 integrations

- **WalletConnect:** useful for mobile and non-injected wallets. Requires a
  project ID and a connection lifecycle that handles pairing, expiry, chain
  switching and disconnects. It must not replace MetaMask as the only tested path
  until the full signing flow is exercised.
- **Explorer APIs:** optional; plain Basescan links work without an API key.
  Any indexed API must be treated as a cache, not chain truth.
- **Monitoring/event sources:** keep the existing separation between the sandbox
  classifier and the Base Sepolia indexer. A new source needs evidence
  provenance, deduplication and a health checkpoint.
- **Security monitoring services:** do not add paid infrastructure without a
  documented budget, data-sharing review and an explicit owner.

## 6. Delivery order

1. P1 visual and interaction work (complete in this change set).
2. Notification history and preferences on the existing Convex tables.
3. Multi-vault read model and vault selector, still using the existing single
   contract per vault.
4. ERC-20 architecture spike with tests only; no deployment.
5. WalletConnect after the MetaMask write path has browser E2E coverage.
6. Any contract change requires a separate approval, audit scope and migration
   plan.

## 7. Verification still required

- Browser E2E for wallet connect, chain switch, account switch and rejection.
- Actual Base Sepolia reads against a deployed contract.
- Notification deduplication under retries and concurrent mutations.
- Multi-vault isolation tests once the schema changes.
- Token fuzz/invariant tests and static analysis before any ERC-20 deployment.
