# NONCE validation report

**Date:** 5 November 2026
**Scope:** `contracts/NONCEVault.sol`, Foundry tests, deploy script, testnet read/indexer layer, and the `/testnet` console.
**Status:** local validation complete; **no Base Sepolia deployment exists**.

This is an internal engineering report, not an independent audit. Compilation,
tests and a fork run are evidence about the code in this repository; they are not
a guarantee that the contract is safe for value.

## 1. Toolchain

| Tool | Version / result |
| --- | --- |
| Foundry | `forge 1.9.0`, `cast 1.9.0` installed via `foundryup` |
| Solidity | `0.8.24`, optimizer enabled, 200 runs |
| forge-std | `v1.9.7`, downloaded into `contracts/lib/forge-std` |
| Slither | `0.11.6` |
| Base Sepolia RPC | `https://sepolia.base.org` responded with chain ID `84532` |

## 2. Build and unit tests

Commands run from `contracts/`:

```bash
forge build
forge test -vvv
```

Result:

- Build: successful. Runtime size 18,321 bytes; initcode 19,801 bytes.
- `NONCEVault.t.sol`: **49 passed, 0 failed**.
- The full `forge test -vvv` command reported **50 passed, 0 failed**: the fork
  test also ran because it falls back to the public RPC when the environment
  variable is absent.
- Invariant suite: 3 invariants, **256 runs / 128,000 calls / 0 reverts**.
- Fuzz runs: 256 each for the configured fuzz tests.

The expanded suite adds cross-request withdrawal-approval replay, cross-nonce
recovery-approval replay, guardian recovery under a monitor freeze, and a check
that restoration cannot clear a guardian-initiated recovery freeze.

The first run found one fixture inconsistency: the allowlist-removal success
test enabled allowlist-only with a single entry, while the contract correctly
refuses to remove the last entry. The test now installs a second allowlisted
recipient. The contract was not weakened to make the test pass.

## 3. Fork tests

Commands run:

```bash
forge test --match-contract NONCEVaultForkTest -vv
forge test --fork-url https://sepolia.base.org -vv
```

Result:

- Fork test: **1 passed**.
- Complete suite on the Base Sepolia fork: **50 passed, 0 failed**.
- The fork test deploys `NONCEVault` locally against forked Base Sepolia state
  and verifies chain ID, roles, policy values, guardian count and a deposit. It
  does **not** broadcast a transaction.

Two initial fork-only failures were test-isolation issues: `address(0xCAFE)`
already had a balance on the fork, and the invariant caller lacked gas funds.
Assertions now use balance deltas, and the test contract/handler are funded
explicitly. These changes do not change contract behavior.

## 4. Deployment-script dry run

The script was simulated against the public Base Sepolia fork with dummy
constructor values and **without `--broadcast`**:

```bash
forge script script/Deploy.s.sol:DeployNONCEVault \
  --fork-url https://sepolia.base.org -vv
```

Result: simulation completed successfully. The estimated gas was `5,537,656`
and the estimated cost at observed fork fees was `0.000060914216 ETH`.

The address printed by that dry run is a simulated fork address. It is **not** a
deployment and is intentionally not recorded as one. No transaction was signed
or broadcast.

## 5. Static analysis

```bash
slither . --filter-paths "lib|test|script"
```

Slither analyzed 82 contracts with 102 detectors and reported **13 informational
results**, with no high- or medium-severity finding:

- `timestamp` detector on delay/expiry comparisons. These comparisons are the
  security mechanism (timelocks and rolling windows); validator timestamp
  manipulation can move execution by seconds, not bypass the delay.
- `cyclomatic-complexity` in the constructor and `executeWithdrawal`.
- `low-level-calls` for the intentional ETH transfer to the approved recipient.

`forge build` also emits lint warnings. The relevant ones were reviewed:
modifier order on `requestWithdrawal` was corrected to `nonReentrant onlyOwner`,
and `WithdrawalExecuted` is now emitted before the external call, with the whole
transaction reverting if the transfer fails. The remaining `forge lint` output
is from `forge-std` or consists of the intentional timestamp/ETH-transfer
patterns above.

## 6. Indexer and monitoring

Implemented in:

- `src/convex/nonce/testnetEvents.ts` — authenticated feed, checkpoint, exact
  unique-key deduplication, reorg rewind, alert storage and indexer health.
- `src/convex/nonce/testnetIndexer.ts` — bounded Base Sepolia `getLogs` action,
  event ABI, rule-based classification, retry/error recording and receipt-safe
  checkpoint updates.
- `src/convex/crons.ts` — two-minute Convex interval worker.
- `src/pages/Testnet.tsx` — confirmed event feed, rule-based alerts, checkpoint
  health and a manual “Index logs” action.

Status: **implemented and typechecked, not exercised against a deployed
contract**. With no `NONCE_VAULT_ADDRESS`/RPC configuration, the cron is a no-op
and the UI reports missing configuration rather than an empty chain.

The indexer deliberately does not claim to detect failed transactions, mempool
activity or phishing. It only classifies successful contract logs. It does not
call `freeze()` automatically because no monitor signing key is stored in the
backend.

## 7. Frontend and backend checks

- `bun tsc -b --noEmit` — passed.
- `bun run build` (`tsc -b && vite build`) — passed.
- `bun test tests/policyRules.test.ts` — **8 passed, 0 failed**.
- `bun convex dev --once` — functions, cron and generated types pushed
  successfully.
- `bun run lint` — **failed overall**: 10 errors and 19 warnings. The failures
  are pre-existing React-hooks/purity and unused-symbol issues in template and
  earlier UI files (`PolicyDialog`, `carousel`, `sidebar`, `use-mobile`,
  `Onboarding`, `Settings`). The latest redesigned files pass a targeted ESLint
  run; see [`UI_REDESIGN.md`](./UI_REDESIGN.md) for the current counts. They were
  not suppressed or weakened.

## 8. Deployment status

**Not deployed.** The exact blockers are:

- no funded Base Sepolia deployer key or explicit authorization to broadcast;
- no Basescan API key for verification;
- no `NONCE_VAULT_ADDRESS`, deployment transaction hash or Convex testnet
  environment values.

No contract address, transaction hash, verification result or explorer link is
invented. Deployment must not be marked complete until the transaction is
broadcast, a receipt is observed, source verification succeeds and `/testnet`
reads the deployed state.

## 9. Browser validation

No wallet extension or browser automation was available in this environment.
The `/testnet` UI was typechecked but **not visually or interactively verified**
against a deployed contract. A manual checklist is in
[`TESTNET_DEPLOYMENT.md`](./TESTNET_DEPLOYMENT.md#6-post-deployment-checks).

## 10. Remaining security work

- Independent audit and a longer invariant/fuzz run with published seeds.
- A real deployment and fork test against the deployed address.
- Wallet-driven end-to-end validation, including rejection, wrong-chain, RPC
  failure and reload cases.
- A production monitor with signed heartbeats, alert delivery and an on-call
  runbook; the current indexer is a bounded polling worker, not a 24/7 service.
- Guardian approval UX and key-custody procedures. The current contract uses
  direct guardian transactions; it does **not** implement EIP-712 off-chain
  signatures or ERC-1271.
- Per-user testnet vault association. The console is a global view of one
  configured contract.
