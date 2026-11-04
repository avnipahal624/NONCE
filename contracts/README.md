# NONCEVault reference contract

`NONCEVault.sol` is a **reference implementation**, not a production system. It is
not deployed, not audited, and the tests in `test/` have not been executed in this
environment (no Foundry toolchain is installed). It exists so the off-chain design
can be reviewed against a concrete on-chain model.

## What it enforces

- A single vault signer queues withdrawals under a per-transaction limit.
- Withdrawals at or above `largeWithdrawalThreshold` wait for `withdrawalDelay`
  and require two of three guardian approvals.
- An optional allowlist restricts recipients.
- The monitor role can call `freeze()` and nothing else: no withdrawal, no policy
  change, no unfreeze, no ownership change.
- Recovery requires two guardian approvals and `recoveryDelay`. Execution replaces
  the owner, clears the freeze and increments `epoch`, which invalidates every
  withdrawal queued before containment.
- ETH only. ERC-20 support, upgradeability and module execution are intentionally
  absent from the reference.

## Deliberate omissions

- No ERC-20 or NFT handling.
- No guardian rotation, no ownership renouncing, no upgrade path.
- No signature-based approvals: guardians transact directly.
- No rate limiting beyond the per-transaction limit.
- No front-running protection for freeze transactions; the delay is the defence.

## Local build and tests

```bash
# from the repository root
cd contracts
forge install foundry-rs/forge-std --no-commit
forge build
forge test -vvv
```

Expected coverage of the reference tests: immediate small withdrawals, delayed large
withdrawals with duplicate-approval rejection, freeze semantics and the absence of an
unfreeze path, recovery threshold and delay, epoch invalidation of queued withdrawals,
allowlist rejection and non-guardian rejection.

## Base Sepolia deployment

1. Copy the variables below into your shell (never commit them):

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_PRIVATE_KEY="0x..."        # funded deployer, not the vault owner key
export VAULT_OWNER="0x..."                 # the signer the vault will protect
export NONCE_MONITOR="0x..."               # narrowly scoped freeze key
export GUARDIAN_ONE="0x..."
export GUARDIAN_TWO="0x..."
export GUARDIAN_THREE="0x..."
export PER_TX_LIMIT_WEI="500000000000000000"        # 0.5 ETH
export LARGE_THRESHOLD_WEI="100000000000000000"     # 0.1 ETH
export WITHDRAWAL_DELAY_SECONDS="1800"              # 30 minutes
export RECOVERY_DELAY_SECONDS="172800"              # 2 days
```

2. Simulate, then broadcast:

```bash
forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"

forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --verify --etherscan-api-key "$BASESCAN_API_KEY"
```

3. Verify on Basescan, then record the address in the deployment notes. The app does
   **not** currently write a real contract address: the sandbox vault is simulated.
   Wiring a deployed address would require replacing the simulated execution layer and
   adding a monitor worker that calls `freeze()` on verified high-risk evidence.

4. Do not fund the vault with assets you are not prepared to lose. This contract has
   not been reviewed by a third party.
