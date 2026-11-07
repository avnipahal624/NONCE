# NONCE audit package

**Prepared:** 5 November 2026  
**Contract:** `contracts/NONCEVault.sol`  
**Status:** internal, pre-deployment package. **No independent audit has been
performed.** This document is not an audit report.

## 1. Source identity

Git commands are blocked by the execution host, so an exact repository commit
hash cannot be produced from this environment. The following SHA-256 content
hashes identify the reviewed source instead:

```text
b75741a27a40ef2aa936411a469445dc400b477088aef76fdf90ff43521ecfce  contracts/NONCEVault.sol
4536c865918c956cddc96ec60987658531da0c5d025c9ce7cc409fe08e0c0dd8  contracts/script/Deploy.s.sol
45e966523148a1e2eb09a56d8f7aa41576d8fc9cae97885798d7750457d0e696  contracts/test/NONCEVault.t.sol
a00e2d54157178c429d88f21fe370621c365eb63e0fd101545b20000c8263fc6  contracts/test/NONCEVault.fork.t.sol
1552b56a73d8d11260865fe1a3ac610b3f31e4472f34319447f1f1b8447e2606  contracts/foundry.toml
```

If a Git commit is required for an external engagement, commit the exact files
above and replace this section with the resulting commit hash and a clean-worktree
statement. Do not claim the current hashes correspond to a Git commit.

## 2. Build and test configuration

- Solidity: `0.8.24`
- Optimizer: enabled, `200` runs
- Foundry: `forge 1.9.0` / `cast 1.9.0`
- `forge-std`: `v1.9.7`
- Slither: `0.11.6`
- Base Sepolia chain ID: `84532`
- Foundry config: `contracts/foundry.toml`
- Contract runtime size: `18,321` bytes; initcode: `19,801` bytes
- EVM version: Foundry's default for this configuration (not explicitly pinned)

## 3. Reproducible commands

Run from the repository root unless noted:

```bash
export PATH="$PATH:$HOME/.foundry/bin"

cd contracts
forge build
forge test -vvv
forge test --fork-url "https://sepolia.base.org" -vvv
forge test --match-test "testFuzz|invariant_" -vv
slither . --filter-paths "lib|test|script"

cd ..
bun tsc -b --noEmit
bun run build
bun test tests/policyRules.test.ts
bun convex dev --once
```

The deploy script is simulated without broadcasting:

```bash
cd contracts
forge script script/Deploy.s.sol:DeployNONCEVault \
  --fork-url "https://sepolia.base.org"
```

## 4. Recorded results

| Check | Result |
| --- | --- |
| `forge build` | Passed |
| `forge test -vvv` | **50 passed, 0 failed** (49 unit/invariant + 1 fork) |
| `forge test --fork-url ...` | **50 passed, 0 failed** |
| Invariants | 3 properties, 256 runs, 128,000 calls, 0 reverts |
| Fuzz tests | 256 runs per fuzz test |
| Slither | 82 contracts, 102 detectors, 13 informational, no high/medium |
| Deploy simulation | Successful; 5,537,656 gas; 0.000060914216 ETH at observed fork fees; no broadcast |
| Frontend typecheck/build | Passed |
| Backend policy tests | 8 passed |
| Repository lint | Fails on 10 pre-existing React-hooks/template errors plus 19 warnings; changed UI/testnet files pass targeted lint |

The expanded tests specifically cover cross-request withdrawal-approval replay,
cross-nonce recovery-approval replay, guardian recovery while the monitor freeze
is active, and the rule that restoration cannot clear a guardian-initiated
recovery freeze. Existing tests cover duplicate approvals, threshold bypass,
dust splitting, rolling reservations, policy timelocks, allowlist timelocks,
freeze idempotence, restoration expiry, guardian rotation, and reentrancy.

## 5. Security model for the auditor

### Roles

- **Owner:** initiates withdrawals and authorised proposals; cannot instantly
  weaken policy, cannot unfreeze, and cannot cancel a guardian-initiated
  recovery.
- **Monitor:** immutable freeze-only role. No transfer, approval, policy,
  rotation, recovery or restoration authority.
- **Guardians:** fixed three slots, threshold two. Approve withdrawals and
  timelocked actions, initiate recovery, and cancel a bad recovery/restoration
  with two distinct approvals.
- **Public callers:** can deposit, execute an eligible approved withdrawal, and
  clean up an expired request. These are intended permissionless paths.

### Core invariants to challenge

1. No withdrawal executes while either freeze source is set.
2. Every accepted withdrawal has a non-zero delay and expires after seven days.
3. Reserved balance never exceeds the vault balance.
4. Rolling spend never exceeds the configured 24-hour limit.
5. Pending reservations continue to consume allowance until execution, cancel
   or expiry.
6. A withdrawal cannot execute after cancellation, expiry or an epoch change.
7. Guardian approvals are scoped to the specific withdrawal/proposal nonce and
   cannot be replayed or counted twice.
8. A weakening policy cannot execute without two distinct guardian approvals and
   the immutable minimum timelock.
9. Guardian rotation cannot install zero, the owner, the monitor, an existing
   guardian, or execute without quorum and delay.
10. Recovery cannot execute below quorum, before its delay, or into a conflicting
    role; execution invalidates old withdrawals and pending security actions.
11. Only two distinct guardian cancellations can cancel a guardian-initiated
    recovery.
12. Restoration clears only `monitorFrozen`; it cannot clear `recoveryFrozen`,
    replace the owner, or move funds.
13. Reentrancy cannot produce a second payout.
14. Epoch never decreases.

### Trust assumptions and accepted risks

- The owner is a hot-key compromise target. After hardening, a compromised owner
  can still spend within the rolling limit after the mandatory delay but cannot
  unilaterally change policy, allowlists, guardians, or recovery.
- Two colluding guardians can replace the owner after the recovery delay. This is
  inherent to 2-of-3 recovery.
- A compromised monitor can cause denial of service by freezing repeatedly. It
  cannot steal or unfreeze.
- The contract is ETH-only; no tokens, upgrades, modules, batching or emergency
  sweep exist.
- The policy and recovery delay floors are immutable. Bad initial role
  configuration can still strand funds.
- The testnet indexer is a bounded polling worker, not a proven 24/7 monitor. It
  cannot see failed transactions, mempool activity or off-chain phishing, and it
  does not hold a freeze key.
- The testnet console is a global view of one configured contract, not a
  per-user vault.

## 6. Findings and remediation gate

No unresolved high/medium Slither finding exists. Internal review findings
C-01…C-05, H-01…H-09, and the medium/low items are recorded in
[`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md). The following items must be closed
before a value-bearing deployment; they do not all block a testnet demo.

| ID | Item | Gate |
| --- | --- | --- |
| A-01 | Independent audit and remediation review | **Required before any value** |
| A-02 | Funded deployer, keystore, explicit broadcast authorization, Basescan key | **Required before broadcast** |
| A-03 | Post-deployment receipt, source verification, Convex configuration | **Required before claiming live** |
| A-04 | Wallet/browser end-to-end validation against the deployed contract | **Required before demo sign-off** |
| A-05 | Independent invariant/fuzz campaign with published seeds | Required before value |
| A-06 | Production monitor, alert delivery, signed heartbeat and on-call runbook | Required before production claims |
| A-07 | Per-user testnet authorization if vault data becomes user-specific | Required before multi-user testnet use |
| A-08 | Resolve repository lint baseline | Engineering quality, not a fund-safety gate |
| A-09 | Auditor confirmation that permissionless execute/cancelExpired and timestamp dependence are intended | Review item, not automatically a defect |

Residual accepted risks: owner spend within limits, two-guardian collusion,
monitor denial of service, no emergency sweep, no upgrade path, and no token
support. These require explicit product-risk acceptance, not a code patch.

## 7. Independent auditor scope of work

**Objective:** independent review of the NONCEVault contract and its deployment
assumptions, with severity-ranked findings and a remediation re-check.

### In scope

1. `NONCEVault.sol` access control, role separation, state machine, withdrawal
   accounting, rolling-window reservations, expiry, policy/allowlist timelocks,
   guardian rotation, freeze/restoration, recovery/cancellation, epoch
   invalidation, reentrancy, and event correctness.
2. Constructor validation and the deploy script's role/policy inputs, chain ID
   guard, and verification procedure.
3. The invariant list above, using an independent harness and independent fuzz/
   invariant seeds. Reproduce and challenge the existing 50-test suite.
4. Deployment assumptions: 2-of-3 guardians, monitor freeze-only authority,
   EOA owner, ETH-only custody, and no upgrade/sweep path.
5. The backend/indexer trust boundary only to confirm it cannot sign or move
   funds; backend code is not the primary audit target.
6. Reconciliation of Slither informational findings and internal findings.

### Out of scope

- Frontend visual design, marketing claims, hosting, DNS, email OTP delivery, and
  legal/regulatory advice.
- Guarantees about Base Sepolia liveness, RPC correctness, or future chain
  upgrades.
- Production monitoring/SLA certification.
- Any claim that a testnet deployment is production-ready.

### Required outputs

- Severity-ranked findings with reproducible PoCs or exact code locations.
- Assessment against every invariant in section 5.
- Explicit accepted-risk list and unresolved questions.
- Remediation review after fixes.
- Final report stating the reviewed source hashes and compiler settings.

### Access package

Provide the auditor with this document, [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md),
[`THREAT_MODEL.md`](./THREAT_MODEL.md), [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md),
[`TEST_REPORT.md`](./TEST_REPORT.md), [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md),
the five source/test files hashed in section 1, and read-only Base Sepolia RPC
access. Do not provide a funded key, seed phrase, or production credential.
