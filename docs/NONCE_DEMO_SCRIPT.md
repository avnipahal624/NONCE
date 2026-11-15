# NONCE demo script — sandbox now, Base Sepolia after approval

**Purpose:** demonstrate the full NONCE response chain without confusing a
sandbox simulation with live protection.

**Current execution status:** the local sandbox path is available in the app, but
this script was **not executed end-to-end in this pass** (no browser was
available). The Base Sepolia path is **blocked** by missing deployment,
keystore, configuration and transaction approval. Do not read the live section
as completed evidence.

## 0. Preflight and truth labels

### Sandbox lane

1. Open the preview and confirm the mode badge says **Sandbox** / demo.
2. Confirm the testnet console says configuration is **missing**, not connected.
3. Prepare a screen recording and a notes file with these fields:
   `step | UTC time | vault state before | action | visible result | evidence
   reference | mode`.
4. Never put a real private key or seed phrase on screen.

### Base Sepolia lane — requires approval

1. Deploy `NONCEVault` with distinct owner, monitor and three guardian accounts.
2. Verify source on Basescan.
3. Set Convex `BASE_SEPOLIA_RPC_URL`, `NONCE_VAULT_ADDRESS`,
   `NONCE_CHAIN_ID=84532`, `NONCE_DEPLOYMENT_TX_HASH`, and
   `NONCE_CONTRACT_VERIFIED=true` only after a source match.
4. Confirm `/testnet` reads the address, deployment hash, owner, monitor,
   guardians, policy, immutable delays and a matching RPC chain ID.
5. **Stop.** Do not broadcast further transactions without explicit approval.

## 1. Vault creation and configuration

### Sandbox

1. Sign in at `/auth`.
2. In onboarding, create a **sandbox vault**.
3. Add three guardian entries. Confirm the UI states that these are simulated
   addresses with no keys.
4. Set a per-transaction limit, large-withdrawal threshold, rolling limit and
   withdrawal delay. Keep the two-minute demo delay; it is labelled as
   compressed.
5. Enter the dashboard.

**Record:** vault id, policy values, guardian labels, mode badge.

### Testnet

Fund the deployer with Base Sepolia ETH, deploy, then read:

```bash
cast call "$ADDR" "owner()(address)" --rpc-url "$RPC"
cast call "$ADDR" "monitor()(address)" --rpc-url "$RPC"
cast call "$ADDR" "guardians(uint256)(address)" 0 --rpc-url "$RPC"
cast call "$ADDR" "getPolicy()(uint256,uint256,uint256,uint64,bool)" --rpc-url "$RPC"
cast call "$ADDR" "policyDelay()(uint64)" --rpc-url "$RPC"
cast call "$ADDR" "recoveryDelay()(uint64)" --rpc-url "$RPC"
```

**Record:** deployment transaction, address, block, owner, monitor, guardians,
policy, delays, verified source URL.

## 2. Synthetic testnet asset deposit

### Sandbox

1. Open **Vault** or **Dashboard**.
2. Choose **Deposit**.
3. Deposit `0.25` ETH (sandbox ledger only).
4. Confirm the balance and activity entry update.
5. Confirm the UI says no chain transaction occurred.

**Record:** before/after sandbox balance, activity id.

### Testnet

1. Connect the owner wallet on Base Sepolia.
2. In `/testnet`, deposit a small amount such as `0.01` ETH.
3. Approve the wallet transaction.
4. Copy the actual transaction hash from the wallet or console.
5. Confirm the receipt and read the vault balance.

```bash
cast receipt "$DEPOSIT_TX" --rpc-url "$RPC"
cast balance "$ADDR" --rpc-url "$RPC"
```

**Record:** hash, block, gas, before/after balance, explorer URL.

## 3. Decoy signal generation from an authorized test source

### Sandbox — available

1. Open **Protection**.
2. Select an active decoy.
3. Choose `SIGNED_TX` — “Unexpected signed transaction” — risk `HIGH`.
4. Leave “simulate failed lockdown” off.
5. Select **Produce sandbox signal**.
6. Identify the source as `SIMULATED` in the resulting incident.

This is an owner-authenticated simulator. It proves the pipeline, not independent
detection.

### Testnet — not available

There is no authorized live decoy watcher, signed webhook or monitor key in this
repository. Do **not** fabricate a “live signal.” The indexer observes contract
logs only and does not feed the sandbox incident state machine. If a live signal
source is added later, it must authenticate origin, target vault and scope,
reject duplicate/replayed/malformed signals, and never freeze on AI output
alone.

## 4. Signal validation and incident creation

### Sandbox

1. Open **Security Response** / the incident list.
2. Open the new incident.
3. Confirm:
   - signal type and risk;
   - target decoy;
   - assessment;
   - evidence entries;
   - incident status.
4. Produce a second signal while the incident is open.
5. Confirm the second signal appears as **attached evidence**, not only as a
   detached event. This is regression coverage for I-01.

**Record:** incident id, signal ids, evidence ids, status.

### Testnet

Blocked at step 3. A receipt or contract state cannot be produced for a signal
that does not exist.

## 5. Authorized freeze transaction

### Sandbox

1. In the incident, choose **Request manual lockdown**.
2. Confirm the request is labelled simulated and that the vault is not claimed
   frozen until confirmation.
3. Approve the sandbox lockdown action.
4. Confirm the vault state changes to `LOCKDOWN` only after the simulated
   confirmation step.

**Record:** request id, simulated transaction reference, old/new state, evidence
entry.

### Testnet

1. Connect the **monitor** wallet (or owner panic wallet) on Base Sepolia.
2. In `/testnet`, select **Freeze vault**.
3. Approve the wallet transaction. This spends testnet gas and requires explicit
   approval before starting.
4. Store the actual hash and receipt.
5. Read `frozen()` and `monitorFrozen()` after confirmation.

```bash
cast receipt "$FREEZE_TX" --rpc-url "$RPC"
cast call "$ADDR" "frozen()(bool)" --rpc-url "$RPC"
cast call "$ADDR" "monitorFrozen()(bool)" --rpc-url "$RPC"
cast call "$ADDR" "recoveryFrozen()(bool)" --rpc-url "$RPC"
```

A submitted hash is not a confirmed freeze. Do not show a lock badge until the
receipt succeeds and the read returns `true`.

**Current status:** no freeze transaction exists.

## 6. Confirmed frozen vault and rejected withdrawal

### Sandbox

1. Return to **Vault**.
2. Attempt a withdrawal while the vault is locked down.
3. Confirm the request is rejected/blocked and the UI explains that the vault
   state, not the screen, blocks exits.
4. Confirm deposits still work while frozen.

**Record:** rejection message, state before/after, deposit result.

### Testnet

1. As owner, attempt `requestWithdrawal` while `frozen()` is true.
2. Confirm the transaction reverts with `Frozen`.
3. Confirm a direct ETH transfer to the vault still succeeds.

```bash
cast send "$ADDR" "requestWithdrawal(uint256,address)" \
  1000000000000000 "$RECIPIENT" \
  --rpc-url "$RPC" --account nonce-owner
# Expected: revert Frozen
```

**Record:** failed transaction hash, revert reason, block, and a successful
deposit hash.

## 7. Guardian-assisted recovery

### Sandbox

1. Open **Recovery**.
2. Propose recovery to a new owner.
3. Confirm the proposal immediately freezes exits and records the required
   guardian quorum.
4. Approve as guardian one and guardian two using the simulated signer flow.
5. Confirm one approval is insufficient and the delay has not elapsed.
6. Advance/wait for the compressed demo delay.
7. Execute recovery.
8. Confirm:
   - owner changed;
   - epoch incremented;
   - old withdrawal cannot execute;
   - recovery freeze clears according to the contract rules;
   - the old signer is revoked in the UI.

**Record:** proposal id, approver labels, quorum, execute-after, epoch
before/after, final owner.

### Testnet — real delays

1. Connect guardian wallets separately.
2. Propose recovery and collect two distinct guardian approvals.
3. Read the proposal and its `executeAfter`.
4. Wait the immutable recovery delay. The contract minimum is **two days**; it
   cannot be shortened for a live demo.
5. Execute recovery.
6. Read `owner()`, `epoch()`, `frozen()`, `recoveryFrozen()` and the old
   withdrawal.
7. Attempt to approve/execute an old withdrawal; expect failure after the epoch
   change.

This cannot fit a same-day demo unless the proposal was pre-staged at least two
days earlier. Do not weaken the delay for the demonstration.

## 8. Policy change and restoration

### Sandbox

1. As owner, propose a policy change.
2. Confirm weakening requires two guardian approvals and a delay; strengthening
   still has a timelock.
3. Execute only after eligibility.
4. Propose restoration after a monitor freeze; confirm it cannot clear a
   guardian recovery freeze.
5. Confirm the UI distinguishes monitor freeze from recovery freeze.

### Testnet

Use the `proposePolicy`, `approvePolicy`, `executePolicy`, `proposeRestoration`,
`approveRestoration` and `executeRestoration` calls. Read the proposal
`executeAfter`; wait. Restoration must not clear a recovery freeze.

## 9. Final state verification

Collect one table with actual values:

| Item | Sandbox | Base Sepolia |
| --- | --- | --- |
| Vault id / address | recorded | **pending** |
| Deployment tx | not applicable | **pending** |
| Deposit tx | sandbox ledger id | **pending** |
| Signal source | `SIMULATED` | **no live source** |
| Incident id | recorded | **pending** |
| Freeze tx | simulated reference | **pending** |
| Freeze receipt | simulated confirmation | **pending** |
| `frozen()` after receipt | sandbox state | **pending** |
| Rejected withdrawal | recorded | **pending** |
| Recovery proposal | recorded | **pending** |
| Guardian approvals | 2 simulated | **pending** |
| Recovery tx / epoch | recorded | **pending** |
| Final owner | recorded | **pending** |
| Explorer verification | not applicable | **pending** |

## 10. Evidence discipline

Allowed evidence:

- actual RPC transaction hash and successful receipt;
- block number and contract address;
- `cast call` output at a named block;
- screenshot of the wallet confirmation and the app's confirmed state;
- incident/audit row ids;
- sanitized command output.

Not allowed:

- dry-run/fork address presented as deployment;
- invented hashes;
- “submitted” presented as “confirmed”;
- sandbox lock presented as on-chain freeze;
- a simulated guardian approval presented as a guardian signature;
- a Slither run presented as an independent audit.

## 11. Stop conditions

Stop the demo and report a blocker if:

- `/testnet` shows no address, a chain mismatch, or no bytecode;
- the wallet is on the wrong chain;
- a receipt is reverted or missing;
- the contract read disagrees with the UI;
- the app labels a sandbox state as live;
- a recovery delay cannot be observed honestly;
- any step would require a private key in the frontend, database or terminal.
