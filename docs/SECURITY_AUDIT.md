# NONCE security audit — internal pre-hardening review

**Scope:** `contracts/NONCEVault.sol`, Foundry tests and deploy script,
`src/convex/nonce/*`, `src/convex/schema.ts`, and the vault, protection,
recovery, onboarding and incident interfaces.

**Review date:** 5 November 2026. **Reviewer:** NONCE engineering (internal).
**Status of this document:** point-in-time findings. It is not an independent
audit and must not be presented as one.

## Executive summary

The original build had a reasonable separation of roles and honest sandbox
labelling, but its on-chain security model did not match the product story.
The owner could instantly weaken every meaningful control, small withdrawals
had no cumulative budget, and recovery could only be started by the owner whose
key might be lost. The backend replicated those weaknesses in demo mode while
still scoring some configurations as “Protected”.

Those are architectural problems, not UI defects. The hardening work replaces
the policy model, adds reservation-based rolling limits, makes recovery
guardian-initiable, and separates monitor freeze from the false-positive
restoration path.

## Findings

### Critical

| ID | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| C-01 | `setPolicy()` applied limits, delays, large-withdrawal thresholds and allowlist disabling instantly with only the owner signature. | A compromised owner raises the threshold above the per-transaction limit and performs an immediate withdrawal. Guardian approval and delay are bypassed. | Policy changes are now always timelocked; every weakening field requires 2-of-3 guardian approvals. The delay is immutable. |
| C-02 | Withdrawals were checked only against a per-transaction limit; there was no window budget. | A stolen key splits a drain into transactions just below the large threshold. Each executes immediately. | Request-time reservations against a 24-hour rolling limit, plus a cumulative large-withdrawal trigger and a mandatory minimum delay on every withdrawal. |
| C-03 | `proposeRecovery()` required `onlyOwner`. | If the owner key is lost, the guardians cannot initiate the one process designed for that scenario. | Owner or guardian may propose. A guardian proposal cannot be cancelled by the owner and starts with the proposer's approval. |
| C-04 | The backend policy mutation (`withdrawals.updatePolicy`) applied security-reducing changes immediately and allowed `guardianApprovalRequired: false`. | Demo mode demonstrated a policy bypass while presenting the vault as protected. | Demo policy changes now go through proposals, delay and guardian quorum, mirroring the contract. |
| C-05 | Backend withdrawals were immediate below the large threshold with no rolling limit or reservation. | Demonstration contradicted the product’s core protection claim. | Demo withdrawals reserve balance and rolling allowance at request time, enforce the same minimum delay, and release reservations on cancel/failure. |

### High

| ID | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| H-01 | Recovery accepted a guardian or the monitor as the new owner. | Role collapse: a guardian could become owner and retain guardian powers; the monitor could own the vault. | New owner must be distinct from the current owner, monitor and every guardian, at proposal and execution. |
| H-02 | The owner could cancel a recovery proposal at any time, including after guardian approval. | A compromised owner could veto legitimate recovery indefinitely. | Owner cancellation is limited to owner-initiated proposals. Guardian-initiated recovery can only be cancelled by two guardians. |
| H-03 | Guardian set changes were immediate, owner-only and had no replay or rotation semantics. | A stolen owner key replaces all guardians, defeating recovery. | Guardian rotation is timelocked, needs two current guardian approvals, rejects duplicates/zero/owner/monitor, and is invalidated by recovery. |
| H-04 | Removing an allowlisted recipient was immediate; disabling allowlisting was immediate. | A compromised owner removes the constraint before draining. | Recipient removal is timelocked with 2-of-3 approvals; disabling allowlisting is classified as a weakening policy change. |
| H-05 | Monitor `freeze()` was not idempotent and was the only freeze state; any false positive required replacing the owner via recovery. | Operational noise escalated into signer replacement, and a naive retry reverted. | Freeze is idempotent and split into `monitorFrozen`/`recoveryFrozen`. Guardian-controlled, timelocked restoration clears a monitor freeze without changing the owner. |
| H-06 | Demo withdrawal policy comparisons used 18 decimals for every asset. | USDC limits were compared in the wrong unit, so displayed limits did not mean what they said. | Limit comparisons are asset-aware; ETH policy applies to ETH, and non-ETH assets use a separate USD-denominated limit with their own decimals. |
| H-07 | Backend protection scoring treated any positive delay as sufficient and ignored whether guardian approval was disabled. | The dashboard could show “Protected” for a policy that had no guardian gate. | Mandatory checks include guardian quorum, cumulative budget, verified ownership, monitoring health and contract mode; demo scores are explicitly labelled simulated. |
| H-08 | Recovery required a confirmed backend lockdown, not the contract's frozen state, and only the signed-in owner could act. | Lost-owner recovery was impossible in the product flow; on-chain and backend conditions diverged. | Demo recovery can start from guardians without owner access, freezes the vault, and requires two distinct confirmed guardians. Testnet reads the contract state. |

### Medium

| ID | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| M-01 | Multiple queued withdrawals could each pass the balance check without reserving funds. | Later executions fail; users see queued withdrawals that can never all settle. | Balance is reserved at request time and released on cancel, expiry or recovery. |
| M-02 | No withdrawal expiry or permissionless cleanup. | Stale approvals and reservations could live indefinitely. | Requests expire seven days after their execution window; anyone can cancel an expired request and release its reservation. |
| M-03 | Guardian approvals were not cryptographically verified in any mode. | “2-of-3” reflected backend bookkeeping, not signatures. | Still simulated and labelled in demo. Live guardian signatures are required before testnet withdrawal/recovery execution; see limitations. |
| M-04 | Decoy signal ingestion is owner-triggered in the sandbox. | A user can manufacture a “detection”; nothing is independently observed. | The interface labels signals as synthetic; automatic lockdown requires a verified live event source. Protection never depends on a decoy. |
| M-05 | Wallet challenge domain allowlist is empty by default when `NONCE_ALLOWED_DOMAINS`/`SITE_URL` is unset. | Any hostname can request a signature. The message still binds the domain, but users may be phished. | Deployment requires `NONCE_ALLOWED_DOMAINS`; verification reports the domain. Missing configuration is documented and visible. |
| M-06 | Audit and evidence records are ordinary database rows. | A database administrator can alter history; no external anchoring. | Evidence includes hashes and simulated/on-chain source; external anchoring is listed as production work. |
| M-07 | Monitor health is global per network, not per vault. | One unhealthy worker downgrades every vault’s displayed protection; one owner can refresh a sandbox heartbeat. | Protection text says monitoring is shared; production requires per-deployment worker identity and signed heartbeats. |
| M-08 | Guardian removal was blocked forever if the guardian had ever approved a proposal. | Rotation could become impossible. | Rotation is explicit and timelocked; historical rows are retained for audit instead of blocking removal semantics. |
| M-09 | The frontend said “Protected” in demo mode while no on-chain contract existed. | Users could mistake simulation for enforceable protection. | Demo protection is labelled as simulated at every level; testnet status is separate and requires a verified deployment. |

### Low

| ID | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| L-01 | `receive()` rejected deposits while frozen. | Availability only; a freeze prevented top-ups. | Deposits remain allowed unless the recipient is the zero address; freeze blocks exits, not entries. |
| L-02 | Backend allowlist silently truncated at 20 entries. | Could produce an unexpected policy. | Inputs are validated and the cap is explicit and reported. |
| L-03 | Unused imports and a dead incident block. | Maintenance noise. | Removed during hardening. |
| L-04 | Test suite covered happy paths and a few access checks only. | No invariant or adversarial coverage. | Expanded Foundry suite; 49 unit/invariant tests and one fork test pass locally. This remains bounded testing, not an audit. |

## Post-remediation adversarial review

A second source-level pass over the hardened contract found one additional
accounting flaw introduced by the first reservation design.

| ID | Finding | Impact | Resolution |
| --- | --- | --- | --- |
| H-09 | A pending withdrawal's rolling charge was counted only by its request timestamp, and `_freeChargeSlot` could reuse a slot once that timestamp was older than 24 hours even though the request was still executable. | An old queued request could execute after its allowance appeared to expire while a new request reused the same allowance, and its reservation slot could be overwritten. Both break the rolling-budget invariant and can overstate available balance protection. | Pending charges now count against the rolling budget until the request executes, cancels or expires. Execution re-timestamps the charge so the 24-hour window starts at actual spend. Pending slots are never reused. Regression tests were added and now pass in the local Foundry suite. |

This finding is a reminder that the tests and review are not a substitute for an
executed invariant suite. It was found by reading the accounting paths, not by a
tool.

## What was actually enforced on-chain before hardening

- Owner-only withdrawals, with a per-transaction cap.
- Large withdrawals required two guardian approvals and a delay.
- Guardians could approve but not initiate recovery.
- Monitor could freeze but not withdraw, unfreeze or change policy.
- Recovery incremented the epoch, invalidating old withdrawals.

Everything else — decoy detection, monitoring, guardian confirmations,
incident response, backend recovery approvals, balances and “protected”
status — was simulated or backend-enforced.

## Trust assumptions

- Owner key compromise is the primary threat. After hardening it can still
  submit withdrawals up to the rolling limit and minimum delays, but cannot
  change policy, allowlists or guardians without 2-of-3 approval and a timelock.
- Two colluding guardians can replace the owner after the recovery delay. This
  is inherent to 2-of-3 recovery and is not preventable without a higher
  threshold or additional signer.
- The monitor can deny service by freezing. It cannot steal, unfreeze, change
  policy or approve recovery. Restoration requires guardians.
- The Convex backend authorizes users, classifies demo events and stores
  records. It cannot sign vault transactions. A backend compromise can alter
  displayed history and trigger demo actions, not move testnet funds.
- Gas price spikes, chain reorganisation and RPC outages can delay detection
  and confirmation. Neither the contract nor the UI may claim a freeze is
  confirmed before the receipt is observed.

## Verification limits at review time

The source review above was followed by local dynamic checks: `forge build`, 49
unit/invariant tests, a Base Sepolia fork test, a no-broadcast deploy-script
simulation and a Slither run. The full suite passes (50 including the fork test)
and Slither reports only informational findings; see [`TEST_REPORT.md`](./TEST_REPORT.md).
No contract is deployed or verified, and none of this is an independent audit.
The findings above remain source-review findings, not a proof of safety.
