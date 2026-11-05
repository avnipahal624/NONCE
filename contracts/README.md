# NONCEVault reference contract

`NONCEVault.sol` is a **hardened reference implementation**, not a production
system. It is unaudited and **not deployed from this repository**. The Foundry
suite has been executed locally: **45 unit/invariant tests plus one Base Sepolia
fork test pass** (see [`docs/TEST_REPORT.md`](../docs/TEST_REPORT.md)). A local
pass is not an audit, a deployment or a guarantee of safety.

Full security context:

- [`docs/SECURITY_ARCHITECTURE.md`](../docs/SECURITY_ARCHITECTURE.md)
- [`docs/THREAT_MODEL.md`](../docs/THREAT_MODEL.md)
- [`docs/TESTNET_DEPLOYMENT.md`](../docs/TESTNET_DEPLOYMENT.md)
- [`docs/KNOWN_LIMITATIONS.md`](../docs/KNOWN_LIMITATIONS.md)

## What it enforces

- A single owner queues every withdrawal; no withdrawal executes immediately.
- Per-transaction limit, mandatory minimum delay (10 minutes), optional
  allowlist.
- Request-time balance and 24-hour rolling-limit reservations in a 64-slot ring.
- Guardian quorum when a request is at/above the large threshold **or** when
  cumulative spend in the window reaches it, closing the splitting attack.
- Policy changes are always timelocked. A weakening change (higher limit, higher
  large threshold, shorter delay, allowlist disabled) needs two guardian
  approvals.
- Immutable lower bounds: policy delay 1 day, recovery delay 2 days, withdrawal
  delay 10 minutes. Constructor values must sit within 1–30 days / 2–90 days /
  10 minutes–30 days.
- Allowlist additions are immediate; removals are timelocked with two guardian
  approvals. The last entry cannot be removed while allowlisting is on.
- Guardian rotation is timelocked, needs two current guardian approvals, rejects
  owner/monitor/existing-guardian/zero, and is blocked while frozen.
- Monitor and owner can `freeze()`; the monitor cannot withdraw, unfreeze, change
  policy, rotate guardians or approve recovery. Repeated freeze is a no-op.
- Owner **or guardian** can propose recovery. A proposal freezes exits; the
  proposer gets one approval; two approvals and `recoveryDelay` are required.
  The owner can cancel only an owner-initiated proposal; two guardians can cancel
  a guardian-initiated one.
- Recovery increments `epoch`, revokes old withdrawals by epoch, resets
  reservation accounting, clears both freeze sources and invalidates active
  policy/allowlist/rotation/restoration proposals.
- Guardian restoration clears a monitor freeze only, after `policyDelay` and two
  approvals. The monitor cannot initiate, approve or execute it.
- Reentrancy guard on request and execute; withdrawal state is finalized before
  the external call.

## Deliberate omissions

- ETH only: no ERC-20, NFT, upgrade, proxy, module or arbitrary call.
- No `selfdestruct`, admin sweep or emergency bypass.
- No configurable guardian count/threshold beyond three-of-which-two.
- No ERC-1271 or EIP-712 guardian signatures; guardians transact directly.
- No batching, meta-transactions or relayer.
- No keeper for expiry cleanup; `cancelExpired` is permissionless.
- No formal verification or independent audit. Fuzz and invariant runs were
  executed locally, but they are bounded runs, not proofs.

## Local build and tests

```bash
# from the repository root, without Foundry:
bunx solc@0.8.24 --optimize --optimize-runs 200 \
  --bin contracts/NONCEVault.sol -o /tmp/nonce-solc

# with Foundry (forge-std v1.9.7 is vendored under lib/):
cd contracts
forge build
forge test -vv
forge test --fork-url https://sepolia.base.org -vv
```

The test suite covers immediate delays, rolling/splitting, reservations, policy
timelock and quorum, weakening classification, allowlist removal, guardian
rotation, guardian-initiated recovery, cancellation rules, epoch invalidation,
freeze/restoration, monitor restrictions, reentrancy, fuzzed amounts and an
invariant handler. The fork test deploys locally on Base Sepolia state without
broadcasting. See `docs/TEST_REPORT.md` for exact counts and results.

## Base Sepolia deployment

The deploy script requires the constructor's new arguments. See
[`docs/TESTNET_DEPLOYMENT.md`](../docs/TESTNET_DEPLOYMENT.md) for the complete
checklist. At minimum:

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_PRIVATE_KEY="0x..."        # funded deployer, not the owner
export VAULT_OWNER="0x..."                 # signer the vault protects
export NONCE_MONITOR="0x..."               # freeze-only key
export GUARDIAN_ONE="0x..."
export GUARDIAN_TWO="0x..."
export GUARDIAN_THREE="0x..."
export PER_TX_LIMIT_WEI="100000000000000000"        # 0.1 ETH
export LARGE_THRESHOLD_WEI="20000000000000000"      # 0.02 ETH
export ROLLING_LIMIT_WEI="300000000000000000"       # 0.3 ETH / 24h
export WITHDRAWAL_DELAY_SECONDS="1800"              # 30 min
export RECOVERY_DELAY_SECONDS="172800"              # 2 days
export POLICY_DELAY_SECONDS="86400"                 # 1 day

forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"

forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --verify --etherscan-api-key "$BASESCAN_API_KEY"
```

After deployment, set the Convex environment values (`NONCE_VAULT_ADDRESS`,
`NONCE_CHAIN_ID=84532`, `BASE_SEPOLIA_RPC_URL`, `NONCE_DEPLOYMENT_TX_HASH`,
optionally `NONCE_CONTRACT_VERIFIED=true`). Open `/testnet` and confirm the live
state, then run the negative checks in the deployment guide. Do not set the
verified flag until Basescan confirms the source.

Do not fund the vault with assets you are not prepared to lose. This contract has
not been reviewed by a third party, its test suite has not run in this
environment, and there is no deployment from this repository.
