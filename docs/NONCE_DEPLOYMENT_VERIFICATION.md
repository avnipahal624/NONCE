# NONCE deployment verification — Base Sepolia

**Date:** 15 November 2026  
**Network:** Base Sepolia, chain ID `84532`  
**Status:** **NOT DEPLOYED / NOT CONFIGURED IN THIS WORKSPACE.** No transaction
was broadcast and no testnet ETH was spent.

This document records what was actually verified. It does not claim a
deployment based on old documentation, a dry-run address or a bytecode artifact.

## 1. Read-only checks performed

| Check | Command / source | Result |
| --- | --- | --- |
| Public RPC chain ID | `cast chain-id --rpc-url https://sepolia.base.org` | `84532` |
| Convex `NONCE_VAULT_ADDRESS` | `bunx convex env get NONCE_VAULT_ADDRESS` | **not found** |
| Convex `NONCE_CHAIN_ID` | `bunx convex env get NONCE_CHAIN_ID` | **not found** |
| Convex `NONCE_DEPLOYMENT_TX_HASH` | `bunx convex env get NONCE_DEPLOYMENT_TX_HASH` | **not found** |
| Convex `NONCE_CONTRACT_VERIFIED` | `bunx convex env get NONCE_CONTRACT_VERIFIED` | **not found** |
| Convex `BASE_SEPOLIA_RPC_URL` | `bunx convex env get BASE_SEPOLIA_RPC_URL` | **not found** |
| Local signing keystore | `cast wallet list` | empty |
| Fixed deployment-panel owner | `cast balance` / `cast nonce` | `0.0001 ETH`, nonce `0` |

The owner address checked was the fixed public address in
`src/lib/testnetDeploy.ts`:
`0x7f81CB31C2AE4Fa70360c503232674D09d098C54`.

Nonce `0` means this address has not sent a transaction on Base Sepolia. It does
not prove that no other deployer created a contract with this owner; it does
mean this workspace has no deployment transaction from that address to point
to.

## 2. What cannot be claimed

Because no address or transaction hash is configured, the following are
**unverified**:

- contract bytecode at a deployed address;
- deployment receipt status and block;
- constructor arguments decoded from the deployment transaction;
- `owner()`, `monitor()`, `guardians(0..2)`;
- `getPolicy()`, immutable `policyDelay()`, `recoveryDelay()`;
- `frozen()`, `monitorFrozen()`, `recoveryFrozen()`, `epoch()`;
- Basescan source verification;
- the `/testnet` live read;
- any deposit, withdrawal, freeze, guardian approval or recovery transaction.

No address, hash, receipt, role, balance or verification badge is invented in
the product when these values are absent.

## 3. Contract artifact prepared locally

- Source: `contracts/NONCEVault.sol`
- Solidity: `0.8.24`, optimizer enabled, 200 runs
- Runtime bytecode: `18,321` bytes
- Creation bytecode: `19,801` bytes
- ABI entries: `130`
- Constructor arguments:
  `initialOwner`, `monitor_`, `guardians_[3]`, `perTransactionLimit_`,
  `largeWithdrawalThreshold_`, `rollingLimit_`, `withdrawalDelay_`,
  `recoveryDelay_`, `policyDelay_`

The deploy script enforces `block.chainid == 84532` and logs the intended
roles/policy before deployment. It does not contain a private key.

The last recorded no-broadcast simulation (5 November) estimated
`5,537,656` gas and `0.000060914216 ETH` at observed fork fees. That simulation
was not re-run in this pass, and the printed fork address is not a deployment.

## 4. Prerequisites before broadcast

1. Choose distinct, independently controlled owner, monitor and three guardian
   addresses. The monitor must be freeze-only and separate from the owner.
2. Import a funded deployer into a password-protected Foundry keystore, or use
   the already reviewed hardware/browser path. Never put the key in a command,
   repository file or `VITE_*` variable.
3. Fund the deployer with Base Sepolia ETH only. The prior estimate plus a
   retry buffer suggests at least `0.001 ETH`; that is operational advice, not a
   guarantee.
4. Provide a Basescan API key if source verification is required. The old V1 API
   endpoint is deprecated; use Etherscan V2 with `chainid=84532` or the Foundry
   verifier configuration documented in `TESTNET_DEPLOYMENT.md`.
5. Obtain **explicit approval to broadcast and spend testnet ETH**.
6. After deployment, set only these Convex environment values:
   `BASE_SEPOLIA_RPC_URL`, `NONCE_VAULT_ADDRESS`, `NONCE_CHAIN_ID=84532`,
   `NONCE_DEPLOYMENT_TX_HASH`, and `NONCE_CONTRACT_VERIFIED=true` only after a
   source match.

## 5. Post-deployment verification commands

These commands are read-only and should be run only with a real configured
address. Do not substitute an address from a dry run.

```bash
export PATH="$PATH:$HOME/.foundry/bin"
export RPC="https://sepolia.base.org"
export ADDR="0x...deployed address..."
export TX="0x...deployment transaction..."

cast chain-id --rpc-url "$RPC"                    # must be 84532
cast code "$ADDR" --rpc-url "$RPC"                # must not be 0x
cast receipt "$TX" --rpc-url "$RPC"               # success, contractAddress
cast call "$ADDR" "owner()(address)" --rpc-url "$RPC"
cast call "$ADDR" "monitor()(address)" --rpc-url "$RPC"
cast call "$ADDR" "guardians(uint256)(address)" 0 --rpc-url "$RPC"
cast call "$ADDR" "guardians(uint256)(address)" 1 --rpc-url "$RPC"
cast call "$ADDR" "guardians(uint256)(address)" 2 --rpc-url "$RPC"
cast call "$ADDR" "getPolicy()(uint256,uint256,uint256,uint64,bool)" --rpc-url "$RPC"
cast call "$ADDR" "policyDelay()(uint64)" --rpc-url "$RPC"
cast call "$ADDR" "recoveryDelay()(uint64)" --rpc-url "$RPC"
cast call "$ADDR" "frozen()(bool)" --rpc-url "$RPC"
cast call "$ADDR" "epoch()(uint256)" --rpc-url "$RPC"
```

Then open `/testnet` after configuring Convex. It must show:

- the address and deployment transaction;
- a successful live read at a block number;
- owner, monitor and three guardians;
- the policy and immutable delays;
- freeze sources and epoch;
- an RPC chain ID that matches `84532`;
- a verified source badge only if a source match is actually recorded.

## 6. Broadcast command — approval required

Do not run this without an explicit approval. Use a keystore, not a literal key.

```bash
cd contracts
forge script script/Deploy.s.sol:DeployNONCEVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --chain 84532 \
  --account nonce-testnet-deployer \
  --sender "$DEPLOYER_ADDRESS" \
  --broadcast --verify \
  --verifier etherscan \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=84532" \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvv
```

## 7. Current blocker summary

- No deployed address or transaction hash.
- No Convex testnet configuration.
- No funded deployer keystore.
- No Basescan API key.
- No broadcast/deployment approval.
- No browser/wallet E2E run.

Until these are resolved, `/testnet` must continue to show blockers and the
sandbox must continue to label every simulated action.
