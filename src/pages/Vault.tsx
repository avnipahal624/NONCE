import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Loader2,
  Lock,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { PolicyDialog } from "@/components/nonce/PolicyDialog";
import { PolicyProposals } from "@/components/nonce/PolicyProposals";
import { DepositDialog, WithdrawDialog } from "@/components/nonce/AssetActions";
import { WithdrawalTimeline } from "@/components/nonce/WithdrawalTimeline";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { formatAmount, formatDateTime, formatTime, timeAgo, vaultStateCopy } from "@/lib/nonce";
import type { Tone } from "@/lib/nonce";

const STATUS_TONE: Record<string, Tone> = {
  QUEUED: "warn",
  AWAITING_GUARDIANS: "warn",
  READY: "info",
  COMPLETED: "safe",
  CANCELLED: "neutral",
  BLOCKED: "danger",
  FAILED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Queued · delay active",
  AWAITING_GUARDIANS: "Awaiting guardians + delay",
  READY: "Quorum met · delay active",
  COMPLETED: "Executed · simulated",
  CANCELLED: "Cancelled",
  BLOCKED: "Blocked by lockdown",
  FAILED: "Failed",
};

export default function VaultPage() {
  const { workspace, isLoading } = useWorkspace();
  const withdrawals = useQuery(api.nonce.withdrawals.list);
  const cancelWithdrawal = useMutation(api.nonce.withdrawals.cancel);
  const simulateApproval = useMutation(api.nonce.withdrawals.simulateGuardianApproval);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(30_000);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-mint" />
        </div>
      </AppShell>
    );
  }

  if (!workspace?.vault) {
    return (
      <AppShell>
        <NoVaultYet />
      </AppShell>
    );
  }

  const { vault, assets, policy } = workspace;
  const state = vaultStateCopy(vault.state);
  const pending = (withdrawals ?? []).filter((request) =>
    ["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status),
  );
  const history = (withdrawals ?? []).filter(
    (request) => !["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status),
  );
  const confirmedGuardians = workspace.guardians.filter((guardian) => guardian.status === "CONFIRMED");
  const ethSpent24h = (withdrawals ?? [])
    .filter((request) => {
      if (request.symbol !== "ETH") return false;
      if (["CANCELLED", "BLOCKED", "FAILED"].includes(request.status)) return false;
      if (["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status)) {
        return true;
      }
      return (request.finalizedAt ?? request.createdAt) > now - 24 * 60 * 60 * 1000;
    })
    .reduce((total, request) => total + Number(request.amount), 0);
  const ethReserved = pending
    .filter((request) => request.symbol === "ETH")
    .reduce((total, request) => total + Number(request.amount), 0);
  const rollingRemaining = Math.max(0, Number(policy?.rollingLimit ?? "2.5") - ethSpent24h);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action did not complete.");
    } finally {
      setBusy(null);
    }
  };

  const approveWithGuardians = (request: Doc<"withdrawalRequests">) =>
    run(`approve-${request._id}`, async () => {
      if (vault.mode !== "DEMO") throw new Error("Live approvals must be signed by guardian wallets.");
      if (confirmedGuardians.length < 2) throw new Error("Two confirmed guardians are required.");
      for (const guardian of confirmedGuardians.slice(0, 2)) {
        await simulateApproval({
          vaultId: vault._id,
          requestId: request._id,
          guardianId: guardian._id,
        });
      }
    });

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="My vault"
          title={vault.name}
          description="Balances, withdrawal rules and every request that is still waiting. Each request has a minimum delay and reserves its share of a rolling 24-hour budget."
          actions={
            <>
              <DepositDialog vaultId={vault._id} assets={assets}>
                <Button
                  variant="outline"
                  className="h-9 rounded-lg border-hairline bg-transparent text-xs text-ivory hover:border-mint/30"
                >
                  <ArrowDownToLine className="size-3.5" /> Deposit
                </Button>
              </DepositDialog>
              <WithdrawDialog vaultId={vault._id} assets={assets} policy={policy}>
                <Button className="h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright">
                  <ArrowUpFromLine className="size-3.5" /> Withdraw
                </Button>
              </WithdrawDialog>
            </>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Vault identity</SectionLabel>
              <StatusPill label={`${state.label} · simulated state`} tone={state.tone} />
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                { label: "Vault signer", value: <Address value={vault.ownerSigner} lead={8} tail={6} /> },
                {
                  label: "Deployment",
                  value: (
                    <span className="text-[11px] text-[#E9B45E]">
                      {vault.deploymentStatus === "SIMULATED"
                        ? "Simulated · no contract deployed"
                        : vault.deploymentStatus}
                    </span>
                  ),
                },
                { label: "Network", value: <span className="text-[11px] text-ivory/85">Base Sepolia · chain {vault.chainId}</span> },
                { label: "Contract version", value: <span className="font-mono text-[11px] text-ivory/85">{vault.contractVersion}</span> },
                { label: "Created", value: <span className="text-[11px] text-ivory/85">{formatDateTime(vault.createdAt)}</span> },
                {
                  label: "Monitoring",
                  value: (
                    <span className={cn("text-[11px]", monitoringTone(workspace.monitoring?.status))}>
                      {workspace.monitoring?.status ?? "OFFLINE"} · checkpoint{" "}
                      {workspace.monitoring?.lastProcessedBlock?.toLocaleString() ?? "—"}
                    </span>
                  ),
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">{item.label}</dt>
                  <dd className="mt-1">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2 text-[10px] leading-5 text-sage">
              No private key or seed phrase exists in NONCE for this vault. The balance below is a
              sandbox ledger entry, not a chain read.
            </p>
          </div>

          <div id="policy" className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Withdrawal policy</SectionLabel>
              <PolicyDialog vaultId={vault._id} policy={policy}>
                <button type="button" className="text-[10px] text-mint hover:text-mint-bright">
                  Propose change
                </button>
              </PolicyDialog>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                { label: "Per-transaction limit", value: `${policy?.maxPerTransaction ?? "—"} ETH` },
                { label: "Rolling 24-hour limit", value: `${policy?.rollingLimit ?? "2.5"} ETH` },
                { label: "Used in last 24h", value: `${ethSpent24h.toFixed(4)} ETH` },
                { label: "Rolling remaining", value: `${rollingRemaining.toFixed(4)} ETH` },
                { label: "Reserved for pending", value: `${ethReserved.toFixed(4)} ETH` },
                { label: "Large threshold", value: `${policy?.largeWithdrawalThreshold ?? "—"} ETH` },
                { label: "Guardian gate", value: "At/above threshold or cumulative" },
                { label: "Hold duration", value: `${policy?.delayMinutes ?? 0} min above threshold` },
                { label: "Minimum delay", value: "10 minutes on every request" },
                { label: "Guardian approval", value: "2 of 3 required" },
                { label: "Allowlist only", value: policy?.allowlistOnly ? `${policy.allowlist.length} saved addresses` : "Off" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-sage">{item.label}</span>
                  <span className="text-right text-ivory/90">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-mint/15 bg-mint/[0.04] px-3 py-2.5">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-mint" />
              <p className="text-[10px] leading-5 text-mint/90">
                Requests reserve their amount and rolling allowance immediately. A lockdown
                cancels pending requests instead of executing them.
              </p>
            </div>
            <PolicyProposals guardians={workspace.guardians} vaultState={vault.state} />
          </div>
        </div>

        <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
          <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
            <SectionLabel>Assets</SectionLabel>
            <span className="text-[10px] text-sage">Simulated balances · Base Sepolia</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-hairline/50 text-[9px] uppercase tracking-[0.16em] text-sage">
                  <th className="px-5 py-2.5 font-medium">Asset</th>
                  <th className="px-5 py-2.5 font-medium">Balance</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/40">
                {assets.map((asset) => (
                  <tr key={asset._id}>
                    <td className="px-5 py-3.5">
                      <p className="text-[12px] text-ivory">{asset.name}</p>
                      <p className="mt-0.5 text-[10px] text-sage">{asset.symbol} · {asset.decimals} decimals</p>
                    </td>
                    <td className="px-5 py-3.5 font-tabular text-[13px] text-ivory">
                      {formatAmount(asset.balance)} <span className="text-[10px] text-sage">{asset.symbol}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-sage">
                      {asset.kind === "NATIVE" ? "Native" : "ERC-20"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <DepositDialog vaultId={vault._id} assets={assets} defaultSymbol={asset.symbol}>
                          <button
                            type="button"
                            className="rounded-md border border-hairline/70 px-2.5 py-1.5 text-[10px] text-sage hover:border-mint/30 hover:text-mint"
                          >
                            Deposit
                          </button>
                        </DepositDialog>
                        <WithdrawDialog vaultId={vault._id} assets={assets} policy={policy} defaultSymbol={asset.symbol}>
                          <button
                            type="button"
                            className="rounded-md border border-hairline/70 px-2.5 py-1.5 text-[10px] text-sage hover:border-mint/30 hover:text-mint"
                          >
                            Withdraw
                          </button>
                        </WithdrawDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
          <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
            <SectionLabel>Pending withdrawals</SectionLabel>
            <span className="text-[10px] text-sage">{pending.length} awaiting execution</span>
          </div>

          {error && (
            <p role="alert" className="mx-5 mt-4 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[11px] text-[#F17676]">
              {error}
            </p>
          )}

          {pending.length === 0 ? (
            <EmptyState
              icon={<Clock className="size-4" />}
              title="Nothing is waiting"
              description="Delayed withdrawals and guardian approvals appear here until they execute or are cancelled."
              className="m-4 border-0 bg-transparent py-8"
            />
          ) : (
            <ul className="divide-y divide-hairline/40">
              {pending.map((request) => (
                <li key={request._id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] text-ivory">
                          {formatAmount(request.amount)} {request.symbol}
                        </p>
                        <StatusPill
                          label={STATUS_LABEL[request.status] ?? request.status}
                          tone={STATUS_TONE[request.status] ?? "neutral"}
                        />
                        {request.requiredApprovals > 0 && (
                          <span className="text-[10px] text-sage">
                            {request.approvals.length}/{request.requiredApprovals} approvals
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[11px] text-sage">
                        To <Address value={request.destination} lead={6} tail={4} />
                      </p>
                      <p className="mt-1 text-[10px] leading-5 text-sage">
                        {request.reason}
                      </p>
                      <p className="mt-1 text-[10px] text-sage/80">
                        Earliest execution {formatTime(request.executeAfter)} ·{" "}
                        {formatDateTime(request.executeAfter)} · {request.simulationRef}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {request.status === "AWAITING_GUARDIANS" && vault.mode === "DEMO" && (
                        <Button
                          onClick={() => void approveWithGuardians(request)}
                          disabled={Boolean(busy)}
                          variant="outline"
                          className="h-8 rounded-md border-mint/25 bg-mint/[0.05] px-3 text-[10px] text-mint hover:bg-mint/10"
                        >
                          {busy === `approve-${request._id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <>
                              <Users className="size-3" /> Simulate 2 approvals
                            </>
                          )}
                        </Button>
                      )}
                      {confirmCancel === request._id ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            onClick={() =>
                              void run(`cancel-${request._id}`, async () => {
                                await cancelWithdrawal({ vaultId: vault._id, requestId: request._id });
                                setConfirmCancel(null);
                              })
                            }
                            disabled={Boolean(busy)}
                            className="h-8 rounded-md bg-[#F17676] px-3 text-[10px] font-semibold text-[#2a0b0b] hover:bg-[#ff8a8a]"
                          >
                            {busy === `cancel-${request._id}` ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              "Confirm cancel"
                            )}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancel(null)}
                            className="flex size-8 items-center justify-center rounded-md border border-hairline text-sage hover:text-ivory"
                            aria-label="Keep withdrawal"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setConfirmCancel(request._id)}
                          variant="outline"
                          className="h-8 rounded-md border-hairline bg-transparent px-3 text-[10px] text-sage hover:border-[#F17676]/40 hover:text-[#F17676]"
                        >
                          Cancel request
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 border-t border-hairline/40 pt-4">
                    <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-sage">
                      Request journey
                    </p>
                    <WithdrawalTimeline request={request} className="mt-4" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-start gap-2 border-t border-hairline/50 px-5 py-3 text-[10px] leading-5 text-sage">
            <ShieldCheck className="mt-0.5 size-3 shrink-0 text-mint/70" />
            Cancelling only affects requests that have not executed. A simulated execution is final
            and cannot be reversed by NONCE.
          </div>
        </div>

        <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
          <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
            <SectionLabel>Withdrawal history</SectionLabel>
            <span className="text-[10px] text-sage">{history.length} records</span>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-6 text-center text-[11px] text-sage">
              No completed, cancelled or failed requests yet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline/40">
              {history.map((request) => (
                <li key={request._id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[12px] text-ivory">
                      {formatAmount(request.amount)} {request.symbol} to {request.destination.slice(0, 8)}…
                    </p>
                    <p className="mt-0.5 text-[10px] text-sage">
                      {request.finalizedAt ? timeAgo(request.finalizedAt) : timeAgo(request.createdAt)}
                      {request.cancelReason ? ` · ${request.cancelReason}` : ""}
                    </p>
                  </div>
                  <StatusPill
                    label={STATUS_LABEL[request.status] ?? request.status}
                    tone={STATUS_TONE[request.status] ?? "neutral"}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function monitoringTone(status: string | undefined): string {
  if (status === "ACTIVE") return "text-mint";
  if (status === "DEGRADED") return "text-[#E9B45E]";
  return "text-[#F17676]";
}
