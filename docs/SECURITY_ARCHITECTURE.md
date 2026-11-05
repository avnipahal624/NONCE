# NONCE security architecture

**Status:** hardened reference build, 5 November 2026. The contract is not
deployed, not independently audited, and its Foundry suite has not been executed
in this environment. This document describes what the code is intended to
enforce, where that enforcement lives, and which parts remain simulated.

## 1. Design rule

Security decisions are made at the lowest layer that can enforce them:

1. **The vault contract** is the authority for funds, withdrawal limits,
   delays, freezing, guardian quorum, policy changes, recovery and guardian
   membership.
2. **The Convex backend** authenticates users, records evidence, mirrors the
   contract's demo rules, and reads live chain state. It holds no vault signing
   key and cannot move testnet funds.
3. **The browser** holds a wallet connection and request intent. It never holds
   a guardian or monitor key. A wallet signature is authorization; a backend
   record is not.

A UI label is never treated as proof. A withdrawal is complete only when a
receipt is observed; a vault is frozen only when the frozen state is read from
the contract or the demo state machine says so; a guardian approval is real only
when it is an on-chain transaction from that guardian.

## 2. Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Owner | Deposit, request and cancel withdrawals, add allowlist entries, propose policy/allowlist-removal/guardian-rotation/recovery/restoration, execute proposals after delay, call `freeze()` as a panic button | Withdraw while frozen, skip the minimum delay, weaken policy without 2 guardian approvals and a timelock, cancel guardian-initiated recovery, unfreeze alone |
| Monitor | Call `freeze()` | Withdraw, unfreeze, restore, change policy, rotate guardians, approve recovery, become owner |
| Guardian (one of three) | Approve withdrawals that require quorum, approve policy weakening, allowlist removal, guardian rotation, recovery and restoration; initiate recovery or restoration | Move funds alone, approve the same proposal twice, become owner, unilaterally cancel recovery (two guardian cancel votes are required), freeze |
| Backend | Authenticate, validate ownership, ingest demo evidence, read RPC, verify receipts, store audit records, trigger demo lockdown requests | Sign a vault transaction, hold a guardian key, pretend a simulated event is on-chain, mark a transaction confirmed without a receipt |
| Browser/wallet | Sign user intent and contract calls | Satisfy a guardian or monitor role without holding that key |

`monitor` is immutable after construction. The owner and guardians cannot
silently become each other: recovery and rotation reject role collisions.

## 3. Enforcement matrix

| Property | Contract | Demo backend | Testnet console |
| --- | --- | --- | --- |
| No withdrawal is immediate | Always at least 10 minutes | 10-minute minimum | Read from contract |
| Large withdrawal needs 2-of-3 | At/above threshold, or cumulative window spend reaches it | Same, asset-aware | Contract call |
| Rolling 24-hour budget | 64-slot reservation ring; request-time reservation | Reserved at request, released on cancel/expiry | Read `getRollingSpent` / `getRollingRemaining` |
| Balance cannot be double-committed | `reservedBalance` checked and incremented | Pending withdrawals reserve balance | Read `reservedBalance` |
| Policy changes timelocked | `policyDelay`, immutable bounds 1–30 days | 2-minute compressed timelock, labelled | Read proposal, execute from contract |
| Weakening needs guardians | 2-of-3 approvals, conservative field classification | Same classification, simulated approvals | Real guardian transactions |
| Allowlist removal is protected | Timelocked + 2 approvals | Through policy proposal | Contract ABI |
| Guardian rotation | Timelocked + 2 approvals; role checks | Initial setup only; post-funding edits blocked | Contract ABI |
| Monitor freeze only | `freeze()` is idempotent and blocks exits | Demo lockdown state machine | Wallet call |
| False-positive release | Guardian timelocked restoration | Modelled as recovery / documented gap | Wallet call |
| Recovery without owner | Guardian may propose | Guardian-initiated path, simulated | Contract call |
| Old authorizations die | Epoch increments; pending proposals cancelled | Epoch increments; pending withdrawals/policies cancelled | Read epoch |
| Confirmation is observed | N/A on-chain | Simulated completion has a `SIMULATED` reference | Receipt status + confirmations |

## 4. Withdrawal lifecycle

### Contract

1. Owner calls `requestWithdrawal(amount, recipient)`.
2. The contract rejects frozen vaults, zero addresses, zero/oversized amounts,
   per-transaction-limit breaches and disallowed recipients.
3. It computes `spent = _rollingSpent()`. Guardian approval is required when
   `amount >= largeWithdrawalThreshold` **or** `spent + amount >= threshold`.
   This closes the splitting attack: many small requests cannot stay below the
   guardian gate once their cumulative total reaches it.
4. `executeAfter` is `now + withdrawalDelay` for guardian-gated requests and
   `now + 10 minutes` for small requests. There is no path with no delay.
5. `_reserve` checks both the rolling limit and unreserved balance, writes a
   charge into a fixed 64-slot ring, and increments `reservedBalance`.
6. Guardians approve distinct requests. Duplicate approvals revert.
7. `executeWithdrawal` is permissionless. It checks epoch, delay, expiry,
   guardian threshold, frozen state and actual balance. It releases the balance
   reservation but keeps the rolling charge, timestamped at execution so the
   24-hour window measures actual spend. Pending reservations count against the
   budget until they execute, cancel or expire, so an old queued request cannot
   free allowance for a new one. The transfer is a `call` behind `nonReentrant`.
8. Owner cancellation or permissionless `cancelExpired` releases both the
   balance reservation and the rolling charge. Requests expire seven days after
   their execution window opens. Expired charges are cleared by permissionless
   `cancelExpired`; a pending request's slot is never reused while it remains
   executable.

### Demo

The backend mirrors the ordering with millisecond timestamps and per-asset
decimals. ETH uses the configured policy; USDC uses a separate token-unit policy
(2,500 per transaction, 10,000 per 24 hours, guardian approval from 500). This
prevents an 18-decimal ETH limit from being applied to a 6-decimal token.
Demo execution is scheduled, then finalization re-checks state, epoch, expiry,
approvals and reservations. A confirmed lockdown cancels pending requests.

## 5. Policy lifecycle

Policy fields are `perTransactionLimit`, `largeWithdrawalThreshold`,
`rollingLimit`, `withdrawalDelay` and `allowlistOnly`.

- Every change is proposed. There is no instant `setPolicy`.
- `policyDelay` is immutable and bounded between 1 and 30 days.
- `withdrawalDelay` is bounded between 10 minutes and 30 days.
- `rollingLimit >= perTransactionLimit`, `largeThreshold <= perTransactionLimit`,
  and the rolling limit fits in `uint96`.
- A change is weakening if **any** field raises a limit, lowers the delay, raises
  the large threshold, or disables allowlisting. One weakening field makes the
  entire proposal weakening, even if other fields strengthen.
- Weakening proposals need two distinct guardian approvals. Strengthening
  proposals do not, but still wait out the timelock.
- Only one policy proposal can be active. A proposal expires seven days after
  its ETA. Recovery invalidates active policy, allowlist, guardian and
  restoration proposals.
- Enabling `allowlistOnly` requires at least one allowlisted recipient. Adding a
  recipient is immediate and strengthening; removing one requires a separate
  timelocked proposal with two guardian approvals.

The demo compresses the timelock to **two minutes** so the lifecycle can be
demonstrated. The UI labels this as a demo compression; the contract's one-day
minimum is the reference.

## 6. Freeze, restoration and recovery

### Freeze

`freeze()` may be called by the monitor or the owner. Repeated calls are no-ops.
A freeze blocks withdrawals, policy execution/proposal, allowlist changes,
guardian rotation and recovery-restoration execution, but **not** deposits,
withdrawal cancellation or recovery proposal creation. Deposits remain possible
while frozen by design.

There are two independent freeze sources:

- `monitorFrozen` — set by `freeze()`, cleared only by guardian restoration.
- `recoveryFrozen` — set when recovery is proposed, cleared by a valid
  cancellation or execution.

`frozen()` is the OR of both. This prevents cancelling recovery from silently
clearing a monitor freeze, and vice versa.

### False-positive restoration

Restoration is the release path for a monitor freeze that was wrong:

1. Owner or guardian proposes restoration while `monitorFrozen` is true and no
   recovery is active.
2. It waits `policyDelay` and requires two guardian approvals.
3. Execution clears `monitorFrozen` only. It does not change the owner, move
   funds or clear `recoveryFrozen`.
4. The monitor cannot propose, approve, execute or cancel. It can freeze again,
   which is an accepted denial-of-service trade-off.

### Recovery

Recovery replaces the owner signer:

1. The owner **or any guardian** may propose a replacement. A guardian proposal
   automatically records the proposer's first approval and sets
   `recoveryFrozen = true`; the owner key is not required.
2. The replacement must be non-zero and distinct from the current owner, the
   monitor, every guardian and (for guardian proposals) the proposer.
3. Two distinct guardians approve. The delay is immutable and at least two days.
4. Any caller may execute after the delay and threshold. Execution revokes the
   old signer, advances the security epoch, clears both freezes, cancels pending
   policy/allowlist/rotation/restoration proposals and resets all withdrawal
   accounting. Old withdrawals and approvals are invalid by epoch check.
5. An owner may cancel only an owner-initiated proposal. A guardian-initiated
   proposal needs two distinct guardian cancellation votes. This stops a stolen
   owner key from vetoing recovery.
6. One active recovery at a time.

## 7. Epoch and replay resistance

`epoch` starts at 1 and increments on every successful recovery. Withdrawals
store the epoch at request time and cannot execute or be approved after it
changes. Policy, allowlist and guardian proposals are also invalidated on
recovery. Approval mappings are keyed by proposal nonce and address, so a
duplicate approval reverts. Demo approvals bind a SHA-256 message hash to the
vault, chain, nonce, old signer, replacement signer and guardian, preventing a
recorded approval from being reused for different content.

A replay across chains is not possible for the contract because state is
chain-local; the demo records `chainId` in approval hashes and displays the
network. This is not a cryptographic signature scheme in demo mode.

## 8. Monitoring boundary

The monitor is deliberately weak:

- It can only freeze.
- It cannot withdraw, upgrade, change policy, rotate guardians or approve
  recovery.
- It cannot unfreeze; restoration needs two guardians and a timelock.
- If it is compromised, it can cause a denial of service by freezing repeatedly.
  That is preferable to giving it transfer authority.

The backend's demo monitor state machine is separate from the contract. It can
record a failed lockdown, a pending submission and a confirmed observation; it
must never say "locked" before confirmation. On testnet, the console reads the
contract's `frozen()` and does not use the demo state machine as proof.

## 9. Data and audit boundary

- Convex Auth identifies the account. Every vault-scoped read/write resolves the
  vault by `userId`; client-supplied vault IDs are not authorization.
- Demo records are ordinary database rows. They are append-only from the
  application's perspective, but a database operator could alter them.
- Evidence uses canonical JSON and SHA-256 for integrity comparison, not legal
  proof or external timestamping.
- The backend holds no private keys and cannot sign contract transactions.
- Testnet reads are performed server-side through a Node action so the RPC URL
  stays on the Convex deployment. The RPC URL is never sent to the browser.
- The testnet console signs with the user's injected wallet. No key is sent to
  the backend.

## 10. What is not enforced

- The contract is ETH-only. It has no ERC-20, NFT, upgrade or module path.
- Demo USDC is a ledger entry, not a token contract.
- Demo guardian approvals are simulated, even though the threshold logic is
  real. The contract requires actual guardian transactions.
- There is no live watcher, mempool monitor, reorg handler or automated monitor
  key in this build.
- The testnet console is a global view of one configured contract, not a
  per-user TESTNET vault record. It can write policy proposals and selected
  withdrawal/recovery controls, but has no allowlist or guardian-rotation forms.
- No independent audit, bug bounty, insurance or formal verification exists.
- A compromised owner can still spend within the rolling limit after the
  mandatory delays. A compromised owner plus two compromised guardians can
  replace the signer. Those are threshold trade-offs, not bugs.

## 11. Security invariants to test

The Foundry suite is written around these properties; it has not been executed
here because Foundry is unavailable.

1. `frozen()` blocks every withdrawal execution.
2. Every accepted withdrawal has `executeAfter > now`.
3. `reservedBalance` equals the sum of live withdrawal reservations.
4. Rolling spend never exceeds `rollingLimit` in any 24-hour window.
5. A weakening policy cannot execute without two distinct approvals and elapsed
   `policyDelay`.
6. Guardian rotation cannot install the owner, monitor, an existing guardian or
   zero.
7. Recovery cannot execute below two approvals, before `recoveryDelay`, or into
   a conflicting role.
8. Recovery increments the epoch and invalidates every prior withdrawal.
9. Only two guardian cancel votes can cancel a guardian-initiated recovery.
10. Restoration cannot clear `recoveryFrozen` or change the owner.
11. Monitor `freeze()` cannot move funds and cannot unfreeze.
12. Reentrancy during withdrawal execution cannot create a second payout.

## 12. Deployment status

No contract is deployed from this repository. No Base Sepolia address, deployer
key, funded account or RPC URL is available in this environment. The app must
show that absence as a blocker. The deployment procedure and configuration keys
are in [`TESTNET_DEPLOYMENT.md`](./TESTNET_DEPLOYMENT.md); residual risks are in
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
