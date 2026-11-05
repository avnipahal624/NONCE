# Base Sepolia deployment and verification

This is the procedure for deploying `contracts/NONCEVault.sol` to Base Sepolia
(chain ID `84532`) and wiring the testnet console and indexer. The contract has
been built and tested locally, and the deploy script has been dry-run against a
Base Sepolia fork. **No broadcast or deployment has occurred**: there is no
funded deployer key, explicit broadcast authorization or Basescan key. Treat the
broadcast steps below as unverified until you observe them yourself.

The app never uses mainnet. Do not put real assets in this contract.

## 0. What the deployment proves — and does not

A deployment proves that a contract exists at an address and that its functions
respond. It does **not** prove the code is correct. This contract is unaudited;
its 49-test suite and Base Sepolia fork test pass locally, but that is bounded
engineering validation, not an audit. Deploy only testnet ETH and only after
reading [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md),
[`TEST_REPORT.md`](./TEST_REPORT.md) and [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

## 1. Prerequisites

- Foundry (`forge`, `cast`) and `forge-std`.
- A Base Sepolia RPC endpoint.
- A deployer account funded with Base Sepolia ETH. The deployer is **not** the
  vault owner and should not be reused as a guardian.
- Four distinct role accounts: owner, monitor, and three guardians. The
  constructor rejects zero, duplicate, owner-as-guardian and monitor-as-guardian
  configurations.
- A Basescan API key if you want source verification.
- The Convex deployment CLI logged in to the project, if you are wiring the
  console.

Never commit private keys or the RPC URL. Use a shell environment or a secret
manager.

## 2. Compile and review first

```bash
# Fast local syntax/optimizer check without forge
bunx solc@0.8.24 --optimize --optimize-runs 200 \
  --bin contracts/NONCEVault.sol -o /tmp/nonce-solc

# Full build and tests (forge-std v1.9.7 is already vendored)
cd contracts
forge build
forge test -vv
forge test --fork-url "$BASE_SEPOLIA_RPC_URL" -vv
```

The local build and tests have passed. Do not deploy because tests pass; review
the test report and get an independent audit first.

## 3. Choose parameters

The deployment script reads:

| Variable | Meaning | Constraints |
| --- | --- | --- |
| `DEPLOYER_PRIVATE_KEY` | Optional local simulation key | Funded Base Sepolia account; not the owner. Prefer a Foundry keystore for broadcast. |
| `DEPLOYER_ADDRESS` | Keystore sender for the command | Must match the keystore account; not read by the Solidity script. |
| `VAULT_OWNER` | Owner signer | Non-zero; distinct from monitor/guardians |
| `NONCE_MONITOR` | Freeze-only role | Non-zero; distinct from owner/guardians |
| `GUARDIAN_ONE` … `THREE` | Guardian addresses | Three distinct, non-zero, no role collision |
| `PER_TX_LIMIT_WEI` | Maximum single withdrawal | > 0 |
| `LARGE_THRESHOLD_WEI` | Guardian/delay gate | > 0 and <= per-tx limit |
| `ROLLING_LIMIT_WEI` | 24-hour cumulative budget | >= per-tx; <= `type(uint96).max` |
| `WITHDRAWAL_DELAY_SECONDS` | Delay for guardian-gated requests | 600–2,592,000 (10 min–30 days) |
| `RECOVERY_DELAY_SECONDS` | Guardian recovery delay | 172,800–7,776,000 (2–90 days) |
| `POLICY_DELAY_SECONDS` | Timelock for policy/rotation/restoration | 86,400–2,592,000 (1–30 days) |

Small withdrawals always wait `SMALL_WITHDRAWAL_DELAY = 10 minutes`, regardless
of `WITHDRAWAL_DELAY_SECONDS`. The initial `allowlistOnly` is `false` and the
allowlist starts empty; adding entries is an owner action.

Suggested conservative testnet values, not production advice:

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_ADDRESS="0x..."
export VAULT_OWNER="0x..."
export NONCE_MONITOR="0x..."
export GUARDIAN_ONE="0x..."
export GUARDIAN_TWO="0x..."
export GUARDIAN_THREE="0x..."
export PER_TX_LIMIT_WEI="100000000000000000"          # 0.1 ETH
export LARGE_THRESHOLD_WEI="20000000000000000"        # 0.02 ETH
export ROLLING_LIMIT_WEI="300000000000000000"         # 0.3 ETH / 24h
export WITHDRAWAL_DELAY_SECONDS="1800"                # 30 min
export RECOVERY_DELAY_SECONDS="172800"                # 2 days
export POLICY_DELAY_SECONDS="86400"                   # 1 day
```

## 4. Simulate, then broadcast

Create a password-protected Foundry keystore once. `cast wallet import` prompts
for the key and an encryption password; do not put the key in shell history or a
file in this repository.

```bash
cast wallet import nonce-testnet-deployer --interactive
```

Simulate first. This reads chain state but does not sign or broadcast:

```bash
cd contracts

forge script script/Deploy.s.sol:DeployNONCEVault \
  --fork-url "$BASE_SEPOLIA_RPC_URL" \
  --account nonce-testnet-deployer \
  --sender "$DEPLOYER_ADDRESS" \
  -vvv
```

With a local-only test key, `DEPLOYER_PRIVATE_KEY` may be set for simulation.
Do not use that mode for a funded account. The script explicitly reverts unless
`block.chainid == 84532`.

Confirm from the trace that the logged owner, monitor, guardians, limits and
delays are the values you intended. Then broadcast and verify after explicit
authorization:

```bash
forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --chain 84532 \
  --account nonce-testnet-deployer \
  --sender "$DEPLOYER_ADDRESS" \
  --broadcast --verify \
  --verifier etherscan \
  --verifier-url "https://api-sepolia.basescan.org/api" \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvv
```

For a manual source-verification retry:

```bash
forge verify-contract "$NONCE_VAULT_ADDRESS" NONCEVault.sol:NONCEVault \
  --chain 84532 \
  --verifier etherscan \
  --verifier-url "https://api-sepolia.basescan.org/api" \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  --constructor-args "$(cast abi-encode \
    'constructor(address,address,address[3],uint256,uint256,uint256,uint64,uint64,uint64)' \
    "$VAULT_OWNER" "$NONCE_MONITOR" \
    "[$GUARDIAN_ONE,$GUARDIAN_TWO,$GUARDIAN_THREE]" \
    "$PER_TX_LIMIT_WEI" "$LARGE_THRESHOLD_WEI" "$ROLLING_LIMIT_WEI" \
    "$WITHDRAWAL_DELAY_SECONDS" "$RECOVERY_DELAY_SECONDS" "$POLICY_DELAY_SECONDS")"
```

Record:

- contract address,
- deployment transaction hash,
- block number,
- chain ID `84532`,
- constructor arguments,
- whether Basescan shows verified source.

If verification fails, do not set the app's verified flag. A deployed but
unverified contract is still usable, but the console will say verification is
unconfirmed.

## 5. Wire the Convex read layer

Set these on the **Convex deployment**, not in a committed `.env` file and not as
`VITE_*` client variables. The RPC URL is used by the Node action and is never
returned to the browser.

| Variable | Required | Value |
| --- | --- | --- |
| `BASE_SEPOLIA_RPC_URL` | Yes | HTTPS RPC for Base Sepolia |
| `NONCE_VAULT_ADDRESS` | Yes | Deployed address, `0x` + 40 hex |
| `NONCE_CHAIN_ID` | Yes | `84532` |
| `NONCE_DEPLOYMENT_TX_HASH` | Yes | Deployment transaction hash |
| `NONCE_CONTRACT_VERIFIED` | Recommended | `true` only after Basescan verification |
| `NONCE_EXPLORER_URL` | Optional | Defaults to `https://sepolia.basescan.org` |

Example with the Convex CLI (run from the project root; do not commit values):

```bash
bunx convex env set BASE_SEPOLIA_RPC_URL "https://sepolia.base.org"
bunx convex env set NONCE_VAULT_ADDRESS "0x..."
bunx convex env set NONCE_CHAIN_ID "84532"
bunx convex env set NONCE_DEPLOYMENT_TX_HASH "0x..."
bunx convex env set NONCE_CONTRACT_VERIFIED "true"
```

The app's `/testnet` route reads `testnetConfig.status` and then the
`testnet.readVault` action. When any required value is missing, it shows a
blocker list instead of a balance, address or transaction hash. With a valid
configuration it:

- reads owner, monitor, guardians, policy, frozen state, epoch, rolling
  allowance, reserved balance, withdrawal count, latest withdrawal, recovery,
  policy proposal and restoration;
- links the contract and deployment transaction to Basescan;
- verifies a submitted transaction hash through `verifyTransaction` and reports
  `PENDING`, `CONFIRMED` with observed confirmations, `REVERTED`, `ERROR` or
  `UNCONFIGURED`.

The console is a **global view of one configured contract**. It is not a
per-account TESTNET vault and does not sign through the backend. Wallet writes go
directly from the browser to the contract.

A Convex cron (`src/convex/crons.ts`) polls the configured contract every two
minutes, indexes confirmed logs into `blockchainEvents`, deduplicates by
chain/contract/transaction/log index, rewinds a small range on a checkpoint hash
mismatch and writes rule-based alerts to `testnetAlerts`. The console also
exposes a manual **Index logs** action. With missing configuration the worker is
a no-op and the UI reports blockers. It does not automatically call `freeze()`
and it does not claim to see failed or off-chain activity.

## 6. Post-deployment checks

Use Basescan or `cast` and the console. Do not mark any of these as passed until
you observe them.

1. **Roles.** Read `owner()`, `monitor()`, `guardians(0..2)`. Confirm no role
   collision and that the monitor key is not the deployer.
2. **Policy.** Read `getPolicy()`. Confirm limits, delay and allowlist flag.
3. **Deposit.** Send a small testnet ETH amount to the contract; confirm the
   `Deposited` event and the balance.
4. **Small withdrawal delay.** Request an amount below both thresholds. Confirm
   `executeAfter` is at least 10 minutes in the future. Try to execute early;
   expect `DelayActive`.
5. **Large withdrawal gate.** Request at or above the large threshold. Confirm
   `requiresGuardians` is true. Execute without approvals after the delay;
   expect `ApprovalIncomplete`. Add one guardian approval; expect it still to
   fail. Add a second distinct guardian approval; execute after the delay.
6. **Cumulative splitting.** Starting from a clean 24-hour window, submit small
   requests whose sum reaches the large threshold. Confirm the later request is
   guardian-gated.
7. **Rolling limit.** Try a request that would exceed the 24-hour budget; expect
   `RollingLimitExceeded`. Cancel a pending request and confirm the allowance is
   released (subject to the 24-hour accounting).
8. **Reservation.** Queue enough requests to consume unreserved balance; confirm
   an additional request fails with `InsufficientBalance`. Cancel one and retry.
9. **Expiry.** Do not execute a request past `expiresAt`; confirm
   `executeWithdrawal` reverts with `WithdrawalExpired`, then call
   `cancelExpired` from any account and confirm the reservation is released.
10. **Policy timelock and quorum.** Propose a weakening change (raise per-tx
    limit). Try to execute early; expect `DelayActive`. Try after the delay with
    fewer than two approvals; expect `ApprovalIncomplete`. Add two guardian
    approvals and execute. Repeat with a strengthening change and confirm it
    still waits the timelock.
11. **Allowlist.** Add a recipient; enable allowlisting through a policy
    proposal. Try a non-listed recipient; expect `RecipientNotAllowed`. Propose
    removal; confirm it needs two approvals and the timelock. Confirm the last
    entry cannot be removed while allowlisting is on.
12. **Freeze.** Call `freeze()` from the monitor. Confirm `frozen()` is true and
    a withdrawal execution reverts with `Frozen`. Call `freeze()` again; confirm
    it is a no-op. Confirm deposits still work and the owner can cancel a pending
    withdrawal.
13. **No monitor unfreeze.** Call every unfreeze-looking function from the
    monitor; expect reverts. Confirm restoration requires guardian approvals and
    the policy delay.
14. **Guardian recovery.** From a guardian wallet, propose recovery with a fresh
    replacement address. Confirm the vault freezes immediately, the proposer has
    one approval, and the owner cannot cancel. Add a second guardian approval.
    Execute early; expect `RecoveryDelayActive`. Execute after the delay; confirm
    the owner changed, the epoch incremented, old withdrawals cannot execute and
    pending policy proposals are inactive.
15. **Cancellation rules.** Create a guardian-initiated recovery on a fresh
    state, record one guardian cancel, confirm it remains active, record a second
    and confirm it is cancelled. Confirm an owner-initiated proposal can be
    cancelled by the owner.
16. **Restoration.** Freeze with the monitor, propose restoration as a guardian,
    add a second guardian approval, wait the policy delay and execute. Confirm
    only `monitorFrozen` cleared and the owner did not change.
17. **Rotation.** Propose a rotation to a fresh address, approve with two
    guardians, wait the timelock and execute. Confirm attempts to rotate to the
    owner, monitor, an existing guardian or zero revert.
18. **Reentrancy.** Only if you have a reviewed attacker contract; do not deploy
    an unreviewed exploit. The local suite includes a reentrant recipient test,
    which passes, but it is not a substitute for an independent review.

## 7. What can go wrong

- **Wrong chain.** The console refuses any chain other than `84532`. Check the
  wallet network before every write.
- **Wrong role.** A write from a non-owner/non-guardian reverts. The console
  displays the wallet/contract error; it does not relabel it as success.
- **Stale read.** The console reads at a block and does not subscribe to logs.
  Refresh after a confirmed transaction; pending state can lag.
- **Unverified source.** If `NONCE_CONTRACT_VERIFIED` is not `true`, the console
  says verification is unconfirmed even if a deployment exists.
- **RPC outage.** Reads and receipt checks fail; this is displayed as an error.
  It is not a zero balance and not a confirmation.
- **Disposal.** The contract has no `selfdestruct`, sweep or upgrade. Test funds
  can only leave through the policy: propose a policy that permits the desired
  amount, wait the timelock, obtain guardian approvals if required, request and
  execute. Otherwise abandon the contract and its testnet balance. Do not expect
  an admin rescue.

## 8. Current blockers in this environment

- No funded Base Sepolia deployer key and no explicit authorization to
  broadcast/spend testnet ETH.
- No Basescan API key for source verification.
- No deployed address, deployment transaction or verified source.
- No Convex environment values for the contract, so the indexer cron is a no-op
  and `/testnet` shows blockers.

The toolchain and local tests are available: `forge build`, 49 unit/invariant
tests and a Base Sepolia fork test pass, and the deploy script dry-run succeeds.
Those facts still do not constitute a deployment.
