# NONCE platform expansion — P0/P1 audit and implementation record

**Date:** 16 November 2026  
**Status:** safe workspace implementation complete for the P1 slice below.
**No deployment, broadcast, paid integration, commit, push or GitHub change was
made.** Desktop and mobile browser E2E pass; live testnet validation remains
blocked.

This is an internal engineering record, not an independent audit. The existing
NONCE vault, Convex auth/domain layer, sandbox/testnet separation and contract
security invariants were preserved.

## 1. Audit result against the requested expansion

| Capability | Status | Where / truth |
| --- | --- | --- |
| Existing vault, policy, freeze, incident, guardian and recovery workflows | **Preserved** | Existing routes, Convex modules and `NONCEVault.sol`; no contract behavior changed |
| AI Security Copilot | **Implemented, local rules engine** | `/copilot`, `intelligence.copilot`, `src/lib/intelligence.ts` |
| AI transaction explanations | **Implemented** | Copilot findings and Transaction Firewall checks |
| Pre-signing simulation/risk | **Implemented, advisory** | `/vault` withdrawal dialog → `intelligence.analyzeWithdrawal`; backend mutation re-validates |
| Suspicious token allowance detection | **Planned / not connected** | Requires an allowance data source and reviewed ERC-20 path; no fake findings |
| Incident summarization | **Implemented from scoped records** | Copilot incident summaries with evidence counts |
| Threat correlation | **Limited local correlation** | Correlates open incident, pending payments, monitoring and policy; no external feed |
| Policy recommendations | **Implemented** | Local rules recommendations |
| Security posture explanations | **Implemented** | Copilot posture and Passport checks |
| Portfolio risk insights | **Implemented as backend-derived posture** | Finance risk card links to Copilot |
| Recovery guidance | **Implemented** | Copilot recovery steps, based on current state |
| AI-generated reports with evidence refs | **Implemented (Markdown export)** | Copilot export; local generation, no external model |
| AI signing / autonomous approval authority | **Explicitly absent** | No key access, no mutation, no signing endpoint |
| Unified portfolio dashboard | **Implemented** | `/finance` supported asset balances |
| Fiat value display | **Unavailable, labelled** | No verified price feed; no invented USD value or timestamp |
| Searchable financial activity | **Implemented** | Finance activity search |
| Protected payment flow | **Implemented via existing withdrawal request** | WithdrawDialog + firewall + address book + policy delay |
| Recipient address book | **Implemented** | New `addressBookEntries` table and `/finance` UI |
| QR payment requests | **Not implemented** | No QR dependency or scanned-recipient flow |
| Spending limits | **Existing policy enforced** | Per-transaction, rolling 24h, delay and guardian quorum |
| Savings vaults | **Planned** | Would require separate vault/product accounting; not faked |
| Scheduled payment proposals | **Existing queued withdrawals** | Pending requests with stored `executeAfter` |
| Transaction/fee analytics | **Partial** | Activity and status available; gas/fee history unavailable |
| Financial exports | **Implemented** | CSV activity export |
| Subscription/token approval manager | **Not connected** | Planned; no allowance source |
| ERC-20 protection modules | **Planned, contract unchanged** | No token custody added to `NONCEVault` |
| Multi-vault support | **Planned, not enabled** | Existing `getVaultForUser` resolves one vault; no unsafe partial migration |
| DeFi exposure monitoring | **Planned** | No verified position indexer |
| NFT/marketplace permission analysis | **Planned** | No operator/collection indexer |
| Cross-chain monitoring | **Planned** | Base Sepolia only |
| Transaction simulation | **Implemented for saved withdrawal policy** | Deterministic preflight; not a full EVM state simulation |
| Wallet permission manager | **Not implemented** | Requires allowance/operator data; planned |
| Account abstraction compatibility | **Research only** | Existing vault not migrated |
| Passkey smart accounts | **Research only** | No account implementation introduced |
| Gas sponsorship | **Research only** | No paymaster or funding model |
| Batched transactions | **Planned** | Requires smart-account execution path |
| Authenticated developer APIs/webhooks | **Not implemented** | No credential, rate-limit or signed-delivery service |
| AI Copilot interface | **Implemented** | `/copilot` |
| Transaction Firewall | **Implemented** | `/firewall` + preflight panel before withdrawal submission |
| Finance Overview | **Implemented** | `/finance` |
| Protected Payments | **Implemented as policy-held withdrawals** | No immediate send |
| DeFi Security Center | **Planned, explicitly unavailable** | Finance planned-capability panel |
| Wallet Permissions | **Planned, explicitly unavailable** | No approval indexer |
| Smart Account settings | **Not implemented** | No AA migration |
| Security Passport | **Implemented** | `/passport`, derived checks/milestones/coverage |
| Guardian Circle | **Existing recovery preserved; not expanded to real signatures** | Sandbox approvals remain `SIMULATED` |
| Advanced Security Analytics | **Partial** | Copilot + activity + passport; no external analytics |
| 3D/motion | **CSS-only premium passport motion** | No Three.js dependency added; reduced-motion class included |
| Feature flags | **Implemented** | `src/lib/features.ts`, backend `intelligence.featureFlags`; P2/P3 defaults off |
| Notification Center | **Implemented for in-app delivery** | `/notifications`; email/SMS/push remain unavailable |
| Authorization/data isolation | **Implemented for new backend** | Every new mutation/query resolves session and vault ownership |
| External API error handling | **Not applicable / no external AI or finance API added** | No paid service introduced |
| Background retries | **Existing indexer only** | No new background jobs |
| Monitoring/alert checks | **Existing in-app/testnet health** | No email/SMS provider |
| E2E tests | **Implemented and passing** | 24/24 desktop Chromium + Pixel 7; intelligence spec adds 4 cases |

## 2. What was added safely

### Backend

- `addressBookEntries` table with owner/vault scoping and duplicate prevention.
- `addresses.list`, `addresses.add`, `addresses.remove` with ownership checks and
  audit records.
- `intelligence.securityPassport` derives a passport from the same protection
  checklist used by the workspace.
- `intelligence.copilot` returns a scoped brief, evidence references, coverage
  and excluded-field disclosure.
- `intelligence.financeOverview` returns supported asset records, pending
  payments, activity, address book, risk posture and explicit unsupported
  capabilities.
- `intelligence.analyzeWithdrawal` evaluates a proposed withdrawal against the
  saved policy, balance reservation, rolling budget, allowlist, address book,
  freeze state and monitoring. It is read-only; the withdrawal mutation remains
  authoritative.
- `intelligence.featureFlags` documents enabled and disabled P1/P2/P3
  capabilities.

### Frontend

- `/copilot` — AI Security Copilot with findings, recommendations, incident
  summaries, recovery guidance, scope disclosure and Markdown export.
- `/finance` — portfolio, fiat-unavailable state, protected payment entry point,
  address book CRUD, activity search/export and planned-capability disclosures.
- `/firewall` — dedicated pre-signing policy simulator using the same
  `analyzeWithdrawal` query as the withdrawal dialog. It never submits.
- `/notifications` — in-app notification center with unread/critical filters, search,
  mark-read controls and explicit external-delivery limits.
- `/passport` — metallic Security Passport with backend-derived status, coverage,
  milestones, masked holder and privacy-safe copy text.
- Withdrawal dialog now shows a Transaction Firewall result before submission
  and quick-selects saved recipients.
- Navigation is feature-flag gated; P1 surfaces default on, P2/P3 capabilities
  default off. Frontend flags are explicit opt-outs via
  `VITE_FEATURE_<NAME>=false`; enabling a label alone does not create backend or
  contract coverage.
- Unsupported capabilities are labelled `PLANNED`, `NOT CONNECTED` or
  `UNAVAILABLE`. No fake fiat values, allowances, DeFi positions or NFT
  permissions are displayed.

## 3. Security and privacy boundaries

- The Copilot is not an LLM and has no external service. It is a deterministic
  rules engine over backend-scoped context.
- It cannot sign, submit, freeze, approve, execute, rotate guardians or change
  policy. All such actions remain wallet/contract operations.
- It excludes email, session tokens, private keys, seed phrases and RPC
  credentials from its context. The UI discloses the fields used and excluded.
- Address-book labels are owner-scoped; queries never accept a client-supplied
  user id.
- The firewall is advisory: a compromised client could skip it, so the backend
  mutation and contract remain authoritative.
- No contract was modified, no token custody was added and no account
  abstraction migration occurred.
- The existing sandbox still labels simulated guardian approvals and balances;
  no simulated signature is presented as real.

## 4. Compatibility and dependency notes

- **ERC-20:** `NONCEVault.sol` is ETH-only. It has no token transfer, allowance,
  decimal normalization or hostile-token path. ERC-20 custody must be a separate,
  reviewed module; the UI deliberately labels the USDC ledger entry as sandbox.
- **Multi-vault:** the schema can store more than one vault, but
  `getVaultForUser` returns the first and the UI assumes one active vault. A
  registry and per-vault routing require a migration/isolation review; no
  partial multi-vault UI was added.
- **Account abstraction:** the vault checks `msg.sender` against EOA roles and
  does not implement ERC-1271. A smart account could technically call as an
  owner, but passkey validation, batched execution, paymasters and recovery
  would need a separate account implementation and security review. The current
  vault was not migrated.
- **Cross-chain/DeFi/NFT:** no bridge, position indexer, marketplace operator
  indexer or price feed is connected. Those views are planned, not simulated as
  live intelligence.
- **Notifications:** in-app delivery is real; email/SMS/push require an approved
  provider, delivery receipts, retry policy and quiet-hour exceptions for
  critical security events.

## 5. Test evidence

Executed in this workspace after the expansion:

```text
bun convex dev --once       # passed; new schema indexes and functions pushed
bun tsc -b --noEmit         # passed
bun test ...                # 37 passed, 0 failed
bunx playwright test        # 24 passed, 0 failed
```

The 37 unit tests include 15 new tests for the firewall, Copilot brief, Passport
and feature flags. `tests/e2e/intelligence.spec.ts` adds 4 browser cases; the
full browser suite passes on both desktop Chromium and Pixel 7.

The full contract suite remains **53 passed** from the prior hardening pass; no
contract source changed in this expansion.

## 6. Remaining production risks / blockers

1. No deployed contract is configured; live passport/contract claims remain
   unavailable.
2. No real testnet transaction was executed; the protected payment path is
   sandbox-only in this workspace.
3. Browser E2E passes, but it covers public/auth/no-vault states only. A funded
   vault, injected wallet and human visual review of populated P1 screens remain
   unexercised.
4. No external AI model is connected. “AI Copilot” is honest local
   explainability, not a hosted model.
5. No verified fiat feed, allowance indexer, DeFi indexer, NFT operator indexer
   or cross-chain monitor exists.
6. No guardian signature collection or invitation email flow. Sandbox approvals
   remain simulated.
7. No QR, savings-vault, subscription-manager, developer-API or webhook product
   is implemented.
8. No accessibility/device audit was run.
9. No CI, secret scanning, dependency scanning or independent audit was added in
   this pass.
10. The address book is private application data, not an on-chain allowlist. A
    saved address is not automatically allowed when the policy is
    `allowlistOnly`.

## 7. Approval gates

Stop before any of the following:

- committing, pushing or opening a GitHub change;
- deploying or broadcasting on Base Sepolia;
- spending testnet funds;
- adding an external AI, price, notification, SMS or indexer service;
- changing `NONCEVault.sol` or introducing ERC-20/account-abstraction custody;
- presenting this P1 slice as production protection or a completed independent
  audit.

## 8. Recommended next dependency order

1. Deploy/verify the existing vault, then run live protected-payment and freeze
   evidence against it.
2. Extend the passing E2E suite with an injected-wallet flow and a funded-vault
   visual review.
3. Add a reviewed ERC-20 module in a separate contract, with hostile-token and
   decimal-normalization tests, before enabling the ERC-20 flag.
4. Add an address-book-to-allowlist proposal path that still requires the
   existing timelock/guardian rules; never bypass them.
5. Add a real guardian invitation/signature flow with replay-safe messages.
6. Add fiat/allowance/DeFi data only with a verified provider, source timestamp
   and explicit freshness/error states.
7. Evaluate account abstraction in a separate branch with a security review; do
   not migrate the current vault.
