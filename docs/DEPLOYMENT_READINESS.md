# NONCE deployment readiness — Base Sepolia

**Date:** 5 November 2026  
**Network:** Base Sepolia, chain ID `84532`  
**Status: SIMULATION-READY; NOT READY TO BROADCAST.**

No deployment transaction has been broadcast. No user private key was requested,
displayed, or persisted by this work.

## 1. Verified inputs

| Item | Status |
| --- | --- |
| `forge build` | Passed |
| `forge test -vvv` | 49 contract tests + 1 fork test passed (50 total) |
| Fork suite | Passed on Base Sepolia state |
| Deploy script chain guard | Requires `block.chainid == 84532` |
| Constructor validation | Non-zero owner/monitor, three distinct guardians, no role collisions, bounded policy/delays |
| Compiler | Solidity `0.8.24`, optimizer enabled, 200 runs |
| Contract size | Runtime 18,321 bytes; initcode 19,801 bytes |
| Slither | 13 informational results; no high/medium findings |

### Constructor and initial roles

`NONCEVault` constructor arguments, in order:

1. `initialOwner`
2. `monitor_`
3. `guardians_[3]`
4. `perTransactionLimit_`
5. `largeWithdrawalThreshold_`
6. `rollingLimit_`
7. `withdrawalDelay_`
8. `recoveryDelay_`
9. `policyDelay_`

Initial state:

- Owner is the supplied owner; the deployer does not have to be the owner.
- Monitor is immutable and freeze-only.
- Exactly three guardian slots; threshold is fixed at 2-of-3.
- `allowlistOnly` is `false`; the allowlist starts empty.
- Epoch starts at 1.
- No post-deployment ownership transfer or initialization call exists.

### Permission summary

- **Owner:** request/cancel withdrawals; propose policy, guardian rotation,
  allowlist removal, and recovery; propose restoration only for a monitor freeze;
  execute approved timelocked policy/rotation/allowlist actions. The owner cannot
  instantly change policy, unfreeze, or cancel a guardian-initiated recovery.
- **Monitor:** `freeze()` only. It cannot withdraw, approve, change policy, rotate
  guardians, propose recovery, or restore a freeze.
- **Guardians:** approve eligible withdrawals and proposals; initiate recovery;
  approve/cancel recovery and restoration with the threshold; no unilateral
  transfer or policy execution.
- **Anyone:** deposit; execute an eligible, fully approved withdrawal; execute a
  fully approved recovery/restoration after its delay; clean up an expired
  withdrawal with `cancelExpired`.

### Policy bounds

- `perTransactionLimit > 0`
- `largeWithdrawalThreshold > 0` and `<= perTransactionLimit`
- `rollingLimit >= perTransactionLimit` and `<= type(uint96).max`
- Withdrawal delay: 10 minutes to 30 days. Every withdrawal waits at least
  10 minutes even if the configured delay is shorter.
- Recovery delay: 2 days to 90 days.
- Policy delay: 1 day to 30 days.
- Rolling window: 24 hours; expiry: 7 days; proposal execution window: 7 days.

## 2. Signing and fees

`cast wallet list` returned **no keystores** in this environment. There is also no
confirmed funded Base Sepolia deployer and no broadcast authorization.

Create a password-protected Foundry keystore once:

```bash
cast wallet import nonce-testnet-deployer --interactive
```

The import prompt is the only place the key should be entered. Do not put a
private key in a command, a committed file, or a `VITE_*` variable.

### Last simulation result

The no-broadcast path was exercised with a temporary throwaway keystore against
the public Base Sepolia RPC. The canonical command is:

```bash
export DEPLOYER_ADDRESS="0x...funded deployer..."
forge script script/Deploy.s.sol:DeployNONCEVault \
  --fork-url https://sepolia.base.org \
  --account nonce-testnet-deployer \
  --sender "$DEPLOYER_ADDRESS"
```

Observed result:

- Chain: `84532`
- Estimated gas: **5,537,656**
- Estimated cost at observed fork fees: **0.000060914216 ETH**
- Broadcast: **none**
- The printed fork address is not a deployment and is not recorded as one.

**Funding recommendation:** at least **0.001 testnet ETH** to cover the
deployment, a retry/redeployment, and normal fee variation. This is a buffer, not
a protocol requirement.

## 3. Exact broadcast command

After the role addresses, keystore, funded deployer, Basescan key, and explicit
authorization are in place:

```bash
cd contracts
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_ADDRESS="0x...funded deployer..."
export VAULT_OWNER="0x...owner..."
export NONCE_MONITOR="0x...monitor..."
export GUARDIAN_ONE="0x...guardian 1..."
export GUARDIAN_TWO="0x...guardian 2..."
export GUARDIAN_THREE="0x...guardian 3..."
export PER_TX_LIMIT_WEI="100000000000000000"       # 0.1 ETH
export LARGE_THRESHOLD_WEI="20000000000000000"     # 0.02 ETH
export ROLLING_LIMIT_WEI="300000000000000000"      # 0.3 ETH / 24h
export WITHDRAWAL_DELAY_SECONDS="1800"             # 30 minutes
export RECOVERY_DELAY_SECONDS="172800"             # 2 days
export POLICY_DELAY_SECONDS="86400"                # 1 day
export BASESCAN_API_KEY="..."

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

The script itself rejects any chain other than `84532`. Do not add
`--private-key` to a funded broadcast.

## 4. Basescan verification

Automatic verification is requested by `--verify` above. If it must be retried:

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

If verification fails, leave `NONCE_CONTRACT_VERIFIED` unset. Do not mark the
deployment verified without a Basescan source match.

## 5. Convex configuration after deployment

Set these on the Convex deployment, not in a committed `.env` file and not as
client variables:

```bash
bunx convex env set BASE_SEPOLIA_RPC_URL "https://sepolia.base.org"
bunx convex env set NONCE_VAULT_ADDRESS "0x..."
bunx convex env set NONCE_CHAIN_ID "84532"
bunx convex env set NONCE_DEPLOYMENT_TX_HASH "0x..."
bunx convex env set NONCE_CONTRACT_VERIFIED "true"   # only after verification
```

`NONCE_EXPLORER_URL` is optional and defaults to
`https://sepolia.basescan.org`.

The testnet worker is a no-op until the address and RPC are set. Do not add a
backend signing key.

## 6. Readiness checklist

- [x] Contract compiles.
- [x] Unit, fuzz, invariant and fork tests pass.
- [x] Deploy script enforces chain ID `84532`.
- [x] Constructor roles and policy bounds reviewed.
- [x] Deployment simulation completed without broadcast.
- [x] Estimated gas and testnet ETH requirement recorded.
- [ ] Dedicated funded testnet deployer.
- [ ] Foundry keystore created and password custody assigned.
- [ ] Basescan API key available.
- [ ] Role addresses chosen and independently reviewed.
- [ ] Explicit authorization to broadcast.
- [ ] Contract deployed and receipt observed.
- [ ] Source verified on Basescan.
- [ ] Convex testnet environment configured.
- [ ] `/testnet` reads the deployed address and frozen/epoch/policy state.
- [ ] Wallet-signed smoke test and manual browser checklist completed.
- [ ] Independent audit completed (separate from this readiness review).

## 7. Remaining blockers

1. No funded Base Sepolia deployer has been confirmed.
2. `cast wallet list` is empty; no keystore exists.
3. No Basescan API key has been provided or confirmed.
4. No explicit broadcast authorization has been given.
5. No deployed address or transaction hash exists, so Convex cannot be wired.
6. Browser/wallet end-to-end validation and an independent audit remain
   outstanding.

Do not broadcast, spend testnet ETH, or modify external infrastructure until
those blockers are cleared and authorization is explicit.
