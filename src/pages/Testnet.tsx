import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Wallet,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AppShell } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { DeployVaultPanel } from "@/components/nonce/DeployVaultPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveTestnetPolicy,
  approveTestnetRecovery,
  approveTestnetRestoration,
  approveTestnetWithdrawal,
  cancelTestnetPolicy,
  cancelTestnetRecovery,
  cancelTestnetRestoration,
  cancelTestnetWithdrawal,
  connectTestnetWallet,
  depositTestnet,
  executeTestnetPolicy,
  executeTestnetRecovery,
  executeTestnetRestoration,
  executeTestnetWithdrawal,
  explorerAddress,
  explorerTx,
  freezeTestnetVault,
  proposeTestnetPolicy,
  proposeTestnetRecovery,
  proposeTestnetRestoration,
  requestTestnetWithdrawal,
} from "@/lib/testnet";
import { humanizeWalletError } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/nonce";
import type { Address as ViemAddress, Hash } from "viem";

type ReadState = FunctionReturnType<typeof api.nonce.testnet.readVault>;
type VerifyState = FunctionReturnType<typeof api.nonce.testnet.verifyTransaction>;

/** Contract timestamps are Unix seconds; the UI formatter takes milliseconds. */
function chainTime(seconds: number): number {
  return seconds * 1000;
}

export default function Testnet() {
  const config = useQuery(api.nonce.testnetConfig.status);
  const indexFeed = useQuery(api.nonce.testnetEvents.feed, { limit: 12 });
  const readVault = useAction(api.nonce.testnet.readVault);
  const verifyTransaction = useAction(api.nonce.testnet.verifyTransaction);
  const syncIndexer = useAction(api.nonce.testnetIndexer.sync);

  const [state, setState] = useState<ReadState | null>(null);
  const [account, setAccount] = useState<ViemAddress | null>(null);
  const [amount, setAmount] = useState("0.001");
  const [recipient, setRecipient] = useState("");
  const [withdrawalId, setWithdrawalId] = useState("1");
  const [replacement, setReplacement] = useState("");
  const [policyDraft, setPolicyDraft] = useState({
    perTransactionLimitEth: "0.1",
    largeWithdrawalThresholdEth: "0.02",
    rollingLimitEth: "0.3",
    withdrawalDelayMinutes: 30,
    allowlistOnly: false,
  });
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [verification, setVerification] = useState<VerifyState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configured = Boolean(config?.configured && config.contractAddress);
  const contract = config?.contractAddress ?? null;

  const refresh = async (id?: number) => {
    if (!configured) return;
    setBusy("read");
    setError(null);
    try {
      const next = await readVault({ withdrawalId: id });
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The live read failed.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await readVault({});
        if (!cancelled) setState(next);
      } catch {
        // The read action surfaces its own error state when called manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, readVault]);

  const submit = async (label: string, fn: () => Promise<Hash>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    setVerification(null);
    try {
      const hash = await fn();
      setTxHash(hash);
      setNotice(
        "Wallet submitted a transaction. It is pending until a receipt is read from Base Sepolia.",
      );
      try {
        const result = await verifyTransaction({ txHash: hash });
        setVerification(result);
      } catch {
        setVerification(null);
      }
      await refresh();
    } catch (err) {
      setError(humanizeWalletError(err));
    } finally {
      setBusy(null);
    }
  };

  const runIndexer = async () => {
    setBusy("index");
    setError(null);
    setNotice(null);
    try {
      const result = await syncIndexer({});
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.upToDate
          ? `Indexer is current at block ${result.toBlock}.`
          : `Indexed blocks ${result.fromBlock}–${result.toBlock}: ${result.inserted} new event(s), ${result.alerts} alert(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The indexer could not run.");
    } finally {
      setBusy(null);
    }
  };

  const checkReceipt = async () => {
    if (!txHash) return;
    setBusy("verify");
    setError(null);
    try {
      setVerification(await verifyTransaction({ txHash }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The receipt could not be read.");
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy("connect");
    setError(null);
    try {
      setAccount(await connectTestnetWallet());
    } catch (err) {
      setError(humanizeWalletError(err));
    } finally {
      setBusy(null);
    }
  };

  if (!config) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-mint" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Base Sepolia · testnet console"
          title="Prove it on-chain, not in a demo"
          description="This console talks to a deployed NONCEVault over Base Sepolia. Reads come from the configured RPC. Writes are signed by your wallet. Nothing here is simulated, and no mainnet chain is supported."
          actions={
            <>
              <StatusPill
                label={configured ? "Contract configured" : "Not deployed"}
                tone={configured ? "warn" : "danger"}
              />
              <StatusPill label="Chain 84532" tone="neutral" />
              <Button
                onClick={() => void refresh()}
                disabled={!configured || Boolean(busy)}
                variant="outline"
                className="h-8 rounded-lg border-hairline bg-black/20 text-[11px]"
              >
                <RefreshCw className={cn("size-3", busy === "read" && "animate-spin")} /> Refresh
              </Button>
            </>
          }
        />

        <div className="flex items-start gap-2 rounded-xl border border-[#E9B45E]/30 bg-[#E9B45E]/[0.06] px-4 py-3 text-[11px] leading-5 text-[#E9B45E]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            The reference contract has not been independently audited. Use only Base Sepolia ETH.
            A failed transaction can still consume testnet gas, and a confirmed transfer cannot be
            reversed. Do not treat any screen here as a security guarantee.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.06] px-4 py-2.5 text-[11px] leading-5 text-[#F17676]"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-mint/20 bg-mint/[0.04] px-4 py-2.5 text-[11px] leading-5 text-mint/90">
            {notice}
          </p>
        )}

        <DeployVaultPanel
          account={account}
          onAccountChange={setAccount}
          configuredContract={contract}
        />

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Deployment</SectionLabel>
              <StatusPill
                label={config.verifiedOnExplorer ? "Explorer verified" : "Verification unconfirmed"}
                tone={config.verifiedOnExplorer ? "safe" : "warn"}
              />
            </div>
            <dl className="mt-4 space-y-3 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sage">Network</dt>
                <dd className="text-ivory">{config.network}</dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sage">Contract</dt>
                <dd>
                  {contract ? (
                    <a
                      href={explorerAddress(config.explorerBaseUrl, contract)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-mint hover:text-mint-bright"
                    >
                      {contract.slice(0, 8)}…{contract.slice(-6)}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-[#F17676]">Not configured</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sage">Deployment transaction</dt>
                <dd>
                  {config.deploymentTxHash ? (
                    <a
                      href={explorerTx(config.explorerBaseUrl, config.deploymentTxHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-mint hover:text-mint-bright"
                    >
                      {config.deploymentTxHash.slice(0, 10)}…
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-[#F17676]">Not recorded</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sage">RPC access</dt>
                <dd className={config.rpcConfigured ? "text-mint" : "text-[#F17676]"}>
                  {config.rpcConfigured ? "Configured on the backend" : "Missing"}
                </dd>
              </div>
            </dl>

            {config.blockers.length > 0 && (
              <div className="mt-4 rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#E9B45E]">
                  Environment blockers
                </p>
                <ul className="mt-2 space-y-1.5">
                  {config.blockers.map((blocker) => (
                    <li key={blocker} className="flex gap-2 text-[10px] leading-5 text-sage">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-[#F17676]" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!configured && (
              <p className="mt-3 text-[10px] leading-5 text-sage">
                Deploy with <code className="font-mono text-ivory">contracts/script/Deploy.s.sol</code>{" "}
                on Base Sepolia, then set the environment values described in{" "}
                <code className="font-mono text-ivory">docs/TESTNET_DEPLOYMENT.md</code>. This page
                will not invent a state until those values exist.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Wallet</SectionLabel>
              <StatusPill label={account ? "Connected" : "Not connected"} tone="neutral" />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-sage">
              The wallet signs contract calls directly. NONCE never receives or stores the key. If
              the connected account is not the owner, monitor or a guardian, the contract reverts
              and the error is shown below.
            </p>
            {account ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] px-3 py-2.5">
                <Address value={account} lead={8} tail={6} />
                <StatusPill label="Base Sepolia" tone="safe" />
              </div>
            ) : (
              <Button
                onClick={() => void connect()}
                disabled={Boolean(busy)}
                className="mt-3 h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright"
              >
                {busy === "connect" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Wallet className="size-3.5" />
                )}
                Connect wallet
              </Button>
            )}
            <p className="mt-3 text-[9px] leading-4 text-sage">
              Reads work without a wallet. Writes require a wallet on chain 84532; this app does not
              switch to mainnet.
            </p>
          </div>
        </div>

        {state && !state.ok && (
          <div className="rounded-xl border border-[#F17676]/25 bg-[#F17676]/[0.05] px-4 py-3 text-[11px] leading-5 text-[#F17676]">
            Live read failed: {state.error}
          </div>
        )}

        {state?.ok && (
          <>
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel>Observed contract state</SectionLabel>
                <span className="text-[10px] text-sage">
                  Block {state.blockNumber} · {formatDateTime(state.observedAt)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Frozen",
                    value: state.frozen ? "Yes — withdrawals blocked" : "No",
                    tone: state.frozen ? ("danger" as const) : ("safe" as const),
                  },
                  {
                    label: "Security epoch",
                    value: String(state.epoch),
                    detail: "Increments on recovery / restoration",
                  },
                  {
                    label: "Guardians",
                    value: `${state.guardians.filter((g) => !/^0x0{40}$/i.test(g)).length} configured`,
                    detail: "2-of-3 approvals required",
                  },
                  {
                    label: "Rolling allowance",
                    value: `${state.rollingRemainingEth} ETH left`,
                    detail: `${state.rollingSpentEth} ETH spent / ${state.policy.rollingLimitEth} ETH per 24h`,
                  },
                  {
                    label: "Reserved balance",
                    value: `${state.reservedBalanceEth} ETH`,
                    detail: "Held for pending withdrawals",
                  },
                  {
                    label: "Withdrawal count",
                    value: String(state.withdrawalCount),
                    detail: "Reservation ring holds up to 64",
                  },
                  {
                    label: "Per transaction",
                    value: `${state.policy.perTransactionLimitEth} ETH`,
                    detail: `Large threshold ${state.policy.largeWithdrawalThresholdEth} ETH`,
                  },
                  {
                    label: "Policy delay",
                    value: `${Math.round(state.policy.withdrawalDelaySeconds / 60)} min`,
                    detail: `Every request waits at least 10 min · ${state.policy.allowlistOnly ? "allowlist only" : "allowlist optional"}`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3"
                  >
                    <p className="text-[9px] uppercase tracking-[0.14em] text-sage">{item.label}</p>
                    <p className="mt-1 text-[13px] font-medium text-ivory">{item.value}</p>
                    {"detail" in item && item.detail && (
                      <p className="mt-0.5 text-[9px] leading-4 text-sage">{item.detail}</p>
                    )}
                    {"tone" in item && item.tone && (
                      <StatusPill
                        label={state.frozen ? "Withdrawals blocked" : "Withdrawals open"}
                        tone={item.tone}
                        className="mt-1.5 text-[8px]"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Owner</p>
                  <Address value={state.owner} lead={8} tail={6} className="mt-1" />
                </div>
                <div className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Monitor (freeze only)</p>
                  <Address value={state.monitor} lead={8} tail={6} className="mt-1" />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {state.guardians.map((guardian, index) => (
                  <div key={index} className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                      Guardian {index + 1}
                    </p>
                    <Address value={guardian} lead={6} tail={4} className="mt-1 text-[10px]" />
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-sage">
                    Active policy proposal
                  </p>
                  {state.policyProposal.active ? (
                    <div className="mt-2 space-y-1 text-[10px] leading-5 text-sage">
                      <p className="text-ivory">
                        {state.policyProposal.weakening ? "Weakens" : "Strengthens"} policy ·{" "}
                        {state.policyProposal.approvals}/3 guardian approvals
                        {state.policyProposal.weakening ? " (2 required)" : " (none required)"}
                      </p>
                      <p>
                        {state.policyProposal.perTransactionLimitEth} ETH per tx ·{" "}
                        {state.policyProposal.rollingLimitEth} ETH per 24h ·{" "}
                        {Math.round(state.policyProposal.withdrawalDelaySeconds / 60)} min
                      </p>
                      <p>
                        Executable after {formatDateTime(chainTime(state.policyProposal.executeAfter))}
                      </p>
                      <p className="font-mono text-[9px]">
                        proposer {state.policyProposal.proposer.slice(0, 10)}…
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] leading-5 text-sage">
                      None active. Policy changes are timelocked; weakening needs 2-of-3 guardians.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-sage">
                    Recovery / restoration
                  </p>
                  <div className="mt-2 space-y-1 text-[10px] leading-5 text-sage">
                    <p>
                      Recovery: {state.recovery.active ? "active" : "none"} ·{" "}
                      {state.recovery.approvals}/2 approvals
                      {state.recovery.active
                        ? ` · executable after ${formatDateTime(chainTime(state.recovery.executeAfter))}`
                        : ""}
                    </p>
                    {state.recovery.active && (
                      <p>
                        Proposed owner {state.recovery.proposedOwner.slice(0, 10)}… ·{" "}
                        {state.recovery.ownerInitiated ? "owner" : "guardian"} initiated
                      </p>
                    )}
                    <p>
                      Restoration: {state.restoration.active ? "active" : "none"} ·{" "}
                      {state.restoration.approvals}/2 approvals
                    </p>
                  </div>
                </div>
              </div>

              {state.latestWithdrawal && (
                <div className="mt-3 rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-sage">
                      Withdrawal #{state.latestWithdrawal.id}
                    </p>
                    <StatusPill
                      label={
                        state.latestWithdrawal.executed
                          ? "Executed"
                          : state.latestWithdrawal.cancelled
                            ? "Cancelled"
                            : "Pending"
                      }
                      tone={
                        state.latestWithdrawal.executed
                          ? "safe"
                          : state.latestWithdrawal.cancelled
                            ? "danger"
                            : "warn"
                      }
                      className="text-[9px]"
                    />
                  </div>
                  <div className="mt-2 grid gap-1 text-[10px] leading-5 text-sage sm:grid-cols-2">
                    <p>
                      {state.latestWithdrawal.amountEth} ETH to{" "}
                      <span className="font-mono">{state.latestWithdrawal.recipient.slice(0, 10)}…</span>
                    </p>
                    <p>
                      {state.latestWithdrawal.requiresGuardians
                        ? `${state.latestWithdrawal.approvals}/2 guardian approvals`
                        : "No guardian approval required"}
                    </p>
                    <p>
                      Execute after {formatDateTime(chainTime(state.latestWithdrawal.executeAfter))}
                    </p>
                    <p>Expires {formatDateTime(chainTime(state.latestWithdrawal.expiresAt))}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel>Indexed contract activity</SectionLabel>
                <div className="flex items-center gap-2">
                  <StatusPill
                    label={indexFeed?.checkpoint?.health ?? "Not indexing"}
                    tone={
                      indexFeed?.checkpoint?.health === "ACTIVE"
                        ? "safe"
                        : indexFeed?.checkpoint?.health === "DEGRADED"
                          ? "warn"
                          : "neutral"
                    }
                  />
                  <Button
                    onClick={() => void runIndexer()}
                    disabled={!configured || Boolean(busy)}
                    variant="outline"
                    className="h-8 rounded-lg border-hairline bg-black/20 text-[10px]"
                  >
                    <RefreshCw className={cn("size-3", busy === "index" && "animate-spin")} />
                    Index logs
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">
                Confirmed Base Sepolia logs are indexed by a Convex worker and
                deduplicated by transaction hash and log index. Alerts are
                rule-based observations, not proof of compromise. The worker
                polls every two minutes; the button forces a bounded tick.
              </p>

              {!indexFeed?.configured ? (
                <p className="mt-3 rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3 text-[10px] leading-5 text-sage">
                  No indexer feed is available until the vault address and RPC are
                  configured. This is not an empty chain — it is missing
                  configuration.
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-sage">
                    <span>
                      Last block{" "}
                      <span className="font-mono text-ivory">
                        {indexFeed.checkpoint?.lastProcessedBlock ?? "—"}
                      </span>
                    </span>
                    <span>{indexFeed.events.length} recent event(s)</span>
                    <span>{indexFeed.alerts.length} alert(s)</span>
                    {indexFeed.checkpoint?.consecutiveFailures ? (
                      <span className="text-[#F17676]">
                        {indexFeed.checkpoint.consecutiveFailures} consecutive failure(s)
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-hairline/60 bg-black/20 p-3.5">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-sage">
                        Confirmed events
                      </p>
                      {indexFeed.events.length === 0 ? (
                        <p className="mt-2 text-[10px] leading-5 text-sage">
                          No logs indexed yet. Run a transaction, then index logs.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {indexFeed.events.map((event) => (
                            <li
                              key={event.id}
                              className="flex items-start justify-between gap-2 border-b border-hairline/40 pb-2 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[10px] text-ivory">
                                  {event.eventType.replace(/([A-Z])/g, " $1").trim()}
                                </p>
                                <p className="mt-0.5 text-[9px] text-sage">
                                  Block {event.blockNumber} · log {event.logIndex} ·{" "}
                                  {event.finalized ? "finalized" : "awaiting confirmations"}
                                </p>
                              </div>
                              {event.txHash ? (
                                <a
                                  href={explorerTx(config.explorerBaseUrl, event.txHash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] text-mint hover:text-mint-bright"
                                >
                                  {event.txHash.slice(0, 8)}…
                                  <ExternalLink className="size-2.5" />
                                </a>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg border border-hairline/60 bg-black/20 p-3.5">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-sage">
                        Rule-based alerts
                      </p>
                      {indexFeed.alerts.length === 0 ? (
                        <p className="mt-2 text-[10px] leading-5 text-sage">
                          No alerting events indexed. Deposits and approvals are
                          recorded without raising an alert.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {indexFeed.alerts.map((alert) => (
                            <li key={alert.id} className="border-b border-hairline/40 pb-2 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] text-ivory">
                                  {alert.category.replace(/_/g, " ")}
                                </p>
                                <StatusPill
                                  label={alert.severity}
                                  tone={
                                    alert.severity === "CRITICAL" || alert.severity === "HIGH"
                                      ? "danger"
                                      : alert.severity === "WARNING"
                                        ? "warn"
                                        : "safe"
                                  }
                                  className="text-[8px]"
                                />
                              </div>
                              <p className="mt-1 text-[9px] leading-4 text-sage">
                                {alert.reason}
                              </p>
                              <p className="mt-1 text-[9px] text-sage">
                                Block {alert.blockNumber}
                                {alert.txHash ? ` · ${alert.txHash.slice(0, 10)}…` : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel>On-chain actions</SectionLabel>
                <span className="text-[10px] text-sage">
                  Signed by your wallet · contract enforces every rule
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-ivory">
                    <Snowflake className="size-3.5 text-mint" /> Freeze
                  </p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    Owner or monitor only. Idempotent; it never moves assets and never unfreezes.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() =>
                        void submit("freeze", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return freezeTestnetVault(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 rounded-md border-[#F17676]/30 bg-transparent px-3 text-[10px] text-[#F17676] hover:bg-[#F17676]/10"
                    >
                      {busy === "freeze" ? <Loader2 className="size-3 animate-spin" /> : "Freeze vault"}
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("restore", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return proposeTestnetRestoration(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Propose restoration
                    </Button>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-sage">
                    Restoration is a separate timelocked proposal and needs two guardian approvals.
                    Unfreezing is never a single owner click.
                  </p>
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4">
                  <p className="text-[11px] font-medium text-ivory">Deposit testnet ETH</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    Sends native ETH to the vault. The contract cannot reject a plain transfer.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      className="h-8 border-hairline bg-black/25 text-[11px]"
                    />
                    <Button
                      onClick={() =>
                        void submit("deposit", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return depositTestnet(contract as ViemAddress, amount, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      className="h-8 shrink-0 rounded-md bg-mint px-3 text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright"
                    >
                      {busy === "deposit" ? <Loader2 className="size-3 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4">
                  <p className="text-[11px] font-medium text-ivory">Request withdrawal</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    Reserves balance and rolling allowance immediately. It cannot execute before the
                    minimum delay, even when small.
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder="ETH"
                        className="h-8 border-hairline bg-black/25 text-[11px]"
                      />
                      <Input
                        value={recipient}
                        onChange={(event) => setRecipient(event.target.value)}
                        placeholder="0x recipient"
                        className="h-8 border-hairline bg-black/25 font-mono text-[10px]"
                      />
                    </div>
                    <Button
                      onClick={() =>
                        void submit("request", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())) {
                            throw new Error("Enter a valid recipient address.");
                          }
                          return requestTestnetWithdrawal(
                            contract as ViemAddress,
                            amount,
                            recipient.trim() as ViemAddress,
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      className="h-8 w-full rounded-md bg-mint text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright"
                    >
                      {busy === "request" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Request withdrawal"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4">
                  <p className="text-[11px] font-medium text-ivory">Approve / execute withdrawal</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    Guardians approve; anyone can execute once the delay and threshold are met. A
                    cancelled or expired request reverts.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Input
                      value={withdrawalId}
                      onChange={(event) => setWithdrawalId(event.target.value)}
                      inputMode="numeric"
                      className="h-8 w-20 border-hairline bg-black/25 text-[11px]"
                    />
                    <Button
                      onClick={() =>
                        void submit("approve", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return approveTestnetWithdrawal(
                            contract as ViemAddress,
                            Number(withdrawalId),
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("execute", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return executeTestnetWithdrawal(
                            contract as ViemAddress,
                            Number(withdrawalId),
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Execute
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("cancel-withdrawal", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return cancelTestnetWithdrawal(
                            contract as ViemAddress,
                            Number(withdrawalId),
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-8 rounded-md px-2 text-[10px] text-[#F17676] hover:bg-[#F17676]/10"
                    >
                      Cancel request
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4 lg:col-span-2">
                  <p className="text-[11px] font-medium text-ivory">Timelocked policy proposal</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    Owner proposes; every change waits the immutable policy delay. If any field
                    weakens a limit, two distinct guardians must approve before execution. Enabling
                    allowlist-only also requires an existing allowlist entry.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-5">
                    <Input
                      value={policyDraft.perTransactionLimitEth}
                      onChange={(event) =>
                        setPolicyDraft({
                          ...policyDraft,
                          perTransactionLimitEth: event.target.value,
                        })
                      }
                      placeholder="per tx ETH"
                      className="h-8 border-hairline bg-black/25 text-[10px]"
                    />
                    <Input
                      value={policyDraft.largeWithdrawalThresholdEth}
                      onChange={(event) =>
                        setPolicyDraft({
                          ...policyDraft,
                          largeWithdrawalThresholdEth: event.target.value,
                        })
                      }
                      placeholder="large ETH"
                      className="h-8 border-hairline bg-black/25 text-[10px]"
                    />
                    <Input
                      value={policyDraft.rollingLimitEth}
                      onChange={(event) =>
                        setPolicyDraft({
                          ...policyDraft,
                          rollingLimitEth: event.target.value,
                        })
                      }
                      placeholder="24h ETH"
                      className="h-8 border-hairline bg-black/25 text-[10px]"
                    />
                    <Input
                      type="number"
                      min={10}
                      max={43200}
                      value={policyDraft.withdrawalDelayMinutes}
                      onChange={(event) =>
                        setPolicyDraft({
                          ...policyDraft,
                          withdrawalDelayMinutes: Number(event.target.value),
                        })
                      }
                      placeholder="delay min"
                      className="h-8 border-hairline bg-black/25 text-[10px]"
                    />
                    <label className="flex items-center gap-1.5 text-[9px] text-sage">
                      <input
                        type="checkbox"
                        checked={policyDraft.allowlistOnly}
                        onChange={(event) =>
                          setPolicyDraft({
                            ...policyDraft,
                            allowlistOnly: event.target.checked,
                          })
                        }
                        className="size-3.5 accent-[#57D5A5]"
                      />
                      allowlist
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void submit("propose-policy", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return proposeTestnetPolicy(
                            contract as ViemAddress,
                            policyDraft,
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Propose policy
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("approve-policy", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return approveTestnetPolicy(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-8 rounded-md px-2 text-[10px] text-sage hover:text-ivory"
                    >
                      Approve policy
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("execute-policy", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return executeTestnetPolicy(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-8 rounded-md px-2 text-[10px] text-mint hover:bg-mint/10"
                    >
                      Execute policy
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("cancel-policy", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return cancelTestnetPolicy(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-8 rounded-md px-2 text-[10px] text-[#F17676] hover:bg-[#F17676]/10"
                    >
                      Cancel policy
                    </Button>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-sage">
                    Contract units are ETH (18 decimals). For USDC the contract does not hold tokens
                    in this build. Allowlist entries must be added separately; the contract rejects
                    enabling allowlist-only with an empty list.
                  </p>
                </div>

                <div className="rounded-lg border border-hairline/60 bg-black/20 p-4 lg:col-span-2">
                  <p className="text-[11px] font-medium text-ivory">Guardian recovery</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">
                    A guardian or the owner can propose a replacement signer. Opening recovery
                    freezes withdrawals. Two guardians must approve, then the timelock must elapse.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={replacement}
                      onChange={(event) => setReplacement(event.target.value)}
                      placeholder="0x replacement signer"
                      className="h-8 border-hairline bg-black/25 font-mono text-[10px]"
                    />
                    <Button
                      onClick={() =>
                        void submit("propose-recovery", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          if (!/^0x[a-fA-F0-9]{40}$/.test(replacement.trim())) {
                            throw new Error("Enter a valid replacement address.");
                          }
                          return proposeTestnetRecovery(
                            contract as ViemAddress,
                            replacement.trim() as ViemAddress,
                            account,
                          );
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 shrink-0 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Propose recovery
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("approve-recovery", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return approveTestnetRecovery(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 shrink-0 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("execute-recovery", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return executeTestnetRecovery(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="outline"
                      className="h-8 shrink-0 rounded-md border-hairline px-3 text-[10px]"
                    >
                      Execute
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("cancel-recovery", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return cancelTestnetRecovery(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-8 shrink-0 rounded-md px-2 text-[10px] text-[#F17676] hover:bg-[#F17676]/10"
                    >
                      Cancel recovery
                    </Button>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-sage">
                    The owner can cancel an owner-initiated recovery. Guardians can cancel any
                    recovery with two distinct cancel approvals; a guardian-initiated recovery
                    cannot be cancelled by the owner alone.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void submit("approve-restoration", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return approveTestnetRestoration(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-7 rounded-md px-2 text-[9px] text-sage hover:text-ivory"
                    >
                      Approve restoration
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("cancel-restoration", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return cancelTestnetRestoration(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-7 rounded-md px-2 text-[9px] text-[#F17676] hover:bg-[#F17676]/10"
                    >
                      Cancel restoration
                    </Button>
                    <Button
                      onClick={() =>
                        void submit("execute-restoration", () => {
                          if (!account || !contract) throw new Error("Connect a wallet first.");
                          return executeTestnetRestoration(contract as ViemAddress, account);
                        })
                      }
                      disabled={!account || Boolean(busy)}
                      variant="ghost"
                      className="h-7 rounded-md px-2 text-[9px] text-sage hover:text-ivory"
                    >
                      Execute restoration
                    </Button>
                    <span className="self-center text-[9px] text-sage">
                      Allowlist and guardian-rotation writes remain available through the verified
                      ABI; this console does not expose forms for them yet.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {txHash && (
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionLabel>Last submitted transaction</SectionLabel>
              <a
                href={explorerTx(config.explorerBaseUrl, txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-mint hover:text-mint-bright"
              >
                Open in explorer <ArrowUpRight className="size-3" />
              </a>
            </div>
            <p className="mt-2 break-all font-mono text-[10px] text-ivory">{txHash}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {verification?.status === "CONFIRMED" && (
                <StatusPill label="Confirmed receipt" tone="safe" />
              )}
              {verification?.status === "REVERTED" && (
                <StatusPill label="Reverted" tone="danger" />
              )}
              {verification?.status === "PENDING" && (
                <StatusPill label="Pending — no receipt yet" tone="warn" />
              )}
              {verification?.status === "ERROR" && (
                <StatusPill label="Receipt check failed" tone="danger" />
              )}
              {verification?.status === "UNCONFIGURED" && (
                <StatusPill label="RPC unconfigured" tone="danger" />
              )}
              <Button
                onClick={() => void checkReceipt()}
                disabled={Boolean(busy)}
                variant="outline"
                className="h-7 rounded-md border-hairline px-2.5 text-[9px]"
              >
                {busy === "verify" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Check receipt
              </Button>
            </div>

            {verification && "confirmations" in verification && (
              <div className="mt-2 space-y-1 text-[10px] leading-5 text-sage">
                {verification.status === "CONFIRMED" && (
                  <p className="flex items-center gap-1.5 text-mint">
                    <Check className="size-3" />
                    Success at block {verification.blockNumber} · {verification.confirmations}{" "}
                    confirmation{verification.confirmations === 1 ? "" : "s"} observed.
                  </p>
                )}
                {verification.status === "PENDING" && (
                  <p>
                    No receipt was returned. This is not confirmation; check again after the
                    transaction is mined.
                  </p>
                )}
                {verification.status === "REVERTED" && (
                  <p className="text-[#F17676]">
                    The transaction was mined but reverted at block {verification.blockNumber}. No
                    state changed.
                  </p>
                )}
                {"error" in verification && verification.error && (
                  <p className="text-[#F17676]">{verification.error}</p>
                )}
              </div>
            )}
          </div>
        )}

        {!configured && !state && (
          <EmptyState
            icon={<ShieldCheck className="size-4" />}
            title="Live console is waiting for a deployment"
            description="There is no contract address in this environment, so there is no on-chain state to display. The demo workspace remains clearly labelled as simulated."
          />
        )}
      </div>
    </AppShell>
  );
}
