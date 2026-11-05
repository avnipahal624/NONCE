# NONCE threat model

**Scope:** the hardened reference contract, the Convex demo backend and the
testnet console in this repository. **Date:** 5 November 2026. This is an
engineering threat model, not a penetration test or an audit.

## 1. Assets

1. **Vault funds** — testnet ETH held by `NONCEVault`; demo ledger balances have
   no value.
2. **Owner authority** — the owner key can request withdrawals and execute
   timelocked proposals. Its compromise is the primary threat.
3. **Guardian authority** — two guardians can approve recovery or weakening
   changes. Their independence is a security assumption.
4. **Monitor authority** — a narrow freeze-only key.
5. **Evidence and audit records** — needed to explain what happened, not to move
   funds.
6. **Signing sessions / account access** — a stolen NONCE session can request
   demo actions and view records, but cannot sign contract transactions without
   the wallet.

## 2. Actors

| Actor | Capability | Motivation |
| --- | --- | --- |
| Remote attacker | Phishing, malware, seed/key theft, transaction replacement | Theft |
| Compromised owner key | Owner calls, including withdrawal requests and proposal creation | Theft / lockout |
| Malicious owner | Same as above, plus social pressure on guardians | Theft |
| Compromised guardian | One approval, proposal initiation, cancel vote | Theft or griefing |
| Two colluding guardians | Recovery threshold | Replace owner / theft |
| Compromised monitor | Freeze only | Denial of service |
| Compromised backend | Auth records, demo state, RPC reads, audit history | Data tampering / false assurance |
| Malicious browser extension | Signs or alters transactions the user sees | Theft |
| Chain/RPC adversary | Censorship, reorg, stale reads, withholding receipts | Delay / false confirmation |
| Careless user | Sends to a wrong address, loses a key, ignores a delay | Loss |

## 3. Trust assumptions

- The owner's device and wallet are not already fully controlled by an attacker
  at signing time. NONCE reduces blast radius but cannot make a compromised
  signing device safe.
- At least two guardians are independent, honest and reachable. Three
  compromised guardians defeat the design; two compromised guardians can replace
  the owner after the recovery delay.
- The monitor key is held by a separate service identity from the owner and
  guardians. It is allowed to cause denial of service, not theft.
- Convex Auth correctly authenticates sessions, and authorization code resolves
  vaults by `userId`. A database compromise is assumed to expose records and
  allow demo-only tampering, not to yield keys.
- The RPC provider returns canonical chain data. The console displays receipt
  status and confirmations but does not independently verify finality or handle
  deep reorgs.
- The deployment environment, compiler, dependency chain and wallet software
  are not compromised.
- Users understand that demo balances and demo guardian approvals are simulated.
  The interface repeats this so the assumption is explicit.

## 4. Threat scenarios and controls

### T1 — Stolen owner key drains the vault

**Path:** attacker signs `requestWithdrawal` repeatedly.

**Controls:** per-transaction cap; mandatory 10-minute minimum delay; large or
cumulative-window requests need two guardian approvals; rolling 24-hour budget;
allowlist; freeze by monitor; pending requests can be cancelled by the owner
before execution; recovery can replace the signer after the delay.

**Residual:** the attacker can spend up to the rolling allowance over time, and
can request withdrawals that sit pending. Guardians or the monitor must notice
and act within the delay. A small allowance with a short delay is a deliberate
usability trade-off.

### T2 — Withdrawal splitting to avoid guardians

**Path:** attacker sends many requests just below the large threshold.

**Controls:** the cumulative trigger compares `spent + amount` against the
threshold, so a later request in the same window crosses the gate. Every request
also reserves rolling allowance and has a delay. The 24-hour ring makes total
spend bounded.

**Residual:** if the threshold is set too high relative to the rolling limit,
splitting still consumes the budget; the attacker cannot exceed it. A poorly
chosen policy can make the UX permissive; policy changes themselves are
timelocked and weakening changes need guardians.

### T3 — Owner instantly weakens the policy

**Path:** compromised owner raises the limit, lowers the delay, disables the
allowlist or raises the large threshold.

**Controls:** no instant policy setter; every change is timelocked; any weakening
field needs two guardian approvals; delay bounds are immutable; one active
proposal; recovery invalidates it.

**Residual:** a compromised owner can propose a weakening change. If two
guardians also approve (or are compromised), it executes after the timelock.
Guardians must actually review what they approve.

### T4 — Owner vetoes guardian recovery

**Path:** owner key is stolen; guardians try to recover; attacker cancels.

**Controls:** owner cancellation is limited to owner-initiated proposals. A
guardian-initiated recovery needs two guardian cancellation votes to stop.

**Residual:** two malicious guardians can cancel a good recovery and can also
approve a hostile one. The 2-of-3 model inherently trusts the majority of
guardians.

### T5 — Owner key is lost, not stolen

**Path:** no owner signature is available, so owner-only recovery cannot start.

**Controls:** any guardian can propose recovery; the proposer's approval counts;
the owner key is not needed to propose, approve or execute. Two guardians plus
the delay replace the signer.

**Residual:** if fewer than two guardians are available, recovery is impossible.
Guardian availability and backup procedures are operational requirements.

### T6 — Monitor false positive locks the vault

**Path:** monitor freezes on noisy or incorrect evidence.

**Controls:** freeze blocks exits only; deposits and cancellation still work;
restoration is a separate timelocked proposal needing two guardian approvals;
the monitor cannot unfreeze or initiate restoration.

**Residual:** the vault is unavailable for normal withdrawals until guardians
act. A compromised monitor can repeat the freeze after restoration, causing
denial of service. This is accepted to keep the monitor unable to steal.

### T7 — Malicious monitor tries to steal

**Path:** monitor calls withdrawal, policy, rotation or recovery functions.

**Controls:** all such functions check owner or guardian roles; monitor is
immutable and only `freeze()` accepts it; recovery replacement cannot be the
monitor.

**Residual:** none for direct theft through the monitor role. A monitor key
compromise is still an availability incident.

### T8 — Reentrancy during payout

**Path:** recipient contract re-enters `executeWithdrawal` or another state
changing function during the ETH transfer.

**Controls:** `nonReentrant` on request and execute; state is marked executed and
the reservation is released before the external call; execution checks epoch,
delay, expiry, threshold and balance before the call.

**Residual:** the test exists but has not been executed here. A recipient that
consumes all gas can make the transfer fail; the transaction reverts and the
request stays unexecuted.

### T9 — Replay of a guardian approval

**Path:** reuse an approval on another proposal, vault, chain or replacement
address.

**Controls (contract):** approvals are keyed by proposal nonce and guardian
address; nonce increments; recovery increments the epoch; one active proposal per
type.

**Controls (demo):** SHA-256 hash binds vault, chain ID, nonce, old signer,
replacement and guardian; duplicate guardian and duplicate hash are rejected.
The signature itself is simulated and is not cryptographically verified.

**Residual:** demo approval integrity is only as good as the database. Real
approval replay resistance depends on the contract and on guardians inspecting
the transaction before signing.

### T10 — Guardian rotation hijack

**Path:** compromised owner replaces honest guardians, then weakens policy.

**Controls:** rotation is proposed by the owner, needs two current guardian
approvals, waits the policy delay, rejects role collisions, and is blocked while
frozen. Recovery invalidates an active rotation.

**Residual:** if the owner and two guardians are compromised, rotation succeeds.
If the owner is compromised but guardians are honest, they can refuse and can
initiate recovery.

### T11 — Allowlist removal bypass

**Path:** owner removes the constrained recipient or disables allowlisting
before draining.

**Controls:** `setAllowlisted(account, false)` reverts; removal uses a timelocked
2-of-3 proposal; disabling `allowlistOnly` is classified as weakening. The last
allowlisted entry cannot be removed while allowlisting is on.

**Residual:** a compromised owner can still add new recipients immediately. That
is intentional so a user can add a legitimate destination without a delay; the
per-transaction and rolling limits, plus guardian gates, still apply.

### T12 — Backend compromise or forged demo evidence

**Path:** attacker alters demo balances, approvals, incident status or audit
history, or triggers a demo lockdown.

**Controls:** the backend holds no keys and cannot sign contract calls; demo
actions are explicitly labelled simulated; testnet reads come from RPC and writes
come from the user's wallet; protection scoring refuses to call demo mode
"Protected". Testnet receipt status is read from the chain.

**Residual:** a backend compromise can mislead a user about demo state and can
destroy audit continuity. It cannot move testnet funds through the backend. A
user who trusts the screen without checking the explorer can still be misled by a
compromised frontend; the security model does not make the UI a trusted oracle.

### T13 — False confirmation

**Path:** UI says a transaction is confirmed because the wallet returned a hash,
or the app assumes a scheduled demo execution succeeded.

**Controls:** the testnet console only shows `CONFIRMED` after a receipt with
`status === "success"` and reports observed confirmations; a missing receipt is
`PENDING`, a reverted receipt is `REVERTED`. Demo execution uses `SIMULATED`
references, never a fabricated hash. The monitor confirmation state is separate
from submission.

**Residual:** RPC can lie or lag; a shallow confirmation can be reorged. The
console shows the observed block and confirmation count but does not enforce a
finality depth. Verify important transactions independently.

### T14 — Chain congestion, censorship or RPC outage

**Path:** freeze or execution cannot be mined; receipt reads fail.

**Controls:** the console reports errors and does not convert them to success.
The contract's delay remains the primary defence; a freeze is not promised to be
instant. The monitor is not required for withdrawal limits to work.

**Residual:** an attacker who can censor transactions can prevent a freeze or a
cancellation. Nonce already accepts blockchain irreversibility and does not claim
transaction reversal.

### T15 — Lost owner key and lost guardians / catastrophic loss

**Path:** owner loses key and fewer than two guardians are available, or all
guardian keys are lost.

**Controls:** none at the contract level. Guardians are the recovery mechanism;
there is no NONCE backdoor or custodial reset.

**Residual:** funds can become permanently inaccessible. This is a self-custody
trade-off, not a recoverable account service.

### T16 — Demo policy/unit confusion

**Path:** a 0.5 ETH limit is applied to USDC (6 decimals), or a token amount is
displayed with ETH precision.

**Controls:** asset-aware policy resolution; separate USDC limits and decimals;
UI states the asset and units; withdrawals re-check decimals server-side.

**Residual:** the demo USDC is not a real ERC-20 and no token transfer occurs.
The contract is ETH-only, so token enforcement is not on-chain in this build.

### T17 — Database loss

**Path:** Convex data is deleted or corrupted.

**Controls:** no funds or keys are stored in the database; testnet contract state
remains authoritative.

**Residual:** demo balances, evidence, incidents and audit history are lost.
Production evidence export/anchoring is out of scope.

## 5. Out of scope

- Mainnet deployment, real-value custody, insurance and legal claims.
- Malware on the user's device that can alter what the wallet displays.
- Compromise of the Solidity compiler, npm/Bun dependencies, Convex platform,
  wallet extension or RPC provider supply chain.
- Privacy/anonymity: on-chain activity is public and linkable.
- MEV, censorship resistance and validator-level attacks.
- Tax, securities, sanctions and other regulatory obligations.
- Formal verification and side-channel analysis.
- ERC-20/NFT handling, upgrades, modules, cross-chain messaging and fiat rails.
- Account recovery for the NONCE login itself.

## 6. Risk register summary

| Risk | Likelihood | Impact | Status |
| --- | --- | --- | --- |
| Owner key compromise spends within limits | Medium | High | Partially mitigated; residual accepted |
| Two guardians collude | Low–Medium | Critical | Inherent to 2-of-3; documented |
| Monitor false positive | Medium | Medium | Restoration path; availability trade-off |
| Demo approval mistaken for real | Medium | High | Labelled simulated; testnet requires wallet transactions |
| Contract bug / no audit | Medium | Critical | Not deployed; audit required before value |
| User sends to wrong address | Medium | High | Allowlist and delays reduce, cannot prevent |
| RPC / confirmation error | Low–Medium | Medium | Receipt state shown; independent verification advised |
| Lost guardians or owner key | Low | Critical | No backdoor; operational custody required |
| Backend audit tampering | Low–Medium | Medium | No fund impact; external anchoring absent |

## 7. Security decisions that are intentionally conservative

- Every withdrawal has a delay, even below the large threshold.
- A cumulative total, not just a single amount, can trigger guardians.
- Policy changes are always timelocked, even strengthening ones.
- One weakening field classifies the whole proposal as weakening.
- Guardian removal and allowlist removal are never instant.
- Recovery freezes first and uses an immutable minimum delay.
- The monitor cannot unfreeze.
- The UI refuses to label demo mode as "Protected".
- No testnet address, hash or balance is invented when configuration is absent.

Each of these adds friction. That friction is the product's security claim; it
should not be removed to make a demo feel faster without updating this document.
