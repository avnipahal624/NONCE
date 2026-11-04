import { Link } from "react-router";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Radar,
  ShieldCheck,
  TriangleAlert,
  Users,
  Vault as VaultIcon,
} from "lucide-react";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, EmptyState, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { VaultDial } from "@/components/nonce/VaultDial";
import { Address } from "@/components/nonce/Address";
import { DepositButton, WithdrawDialog } from "@/components/nonce/AssetActions";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatTime,
  monitoringCopy,
  protectionTone,
  timeAgo,
  truncateMiddle,
  vaultStateCopy,
} from "@/lib/nonce";

export default function Dashboard() {
  const { workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
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

  const { vault, assets, protection, policy, activeIncident, pendingWithdrawals, recentActivity, monitoring } =
    workspace;
  const state = vaultStateCopy(vault.state);
  const monitoringState = monitoringCopy(monitoring?.status);
  const confirmedGuardians = workspace.guardians.filter((guardian) => guardian.status === "CONFIRMED");
  const activeDecoys = workspace.decoys.filter((decoy) => decoy.status === "ACTIVE");
  const hasBalances = assets.some((asset) => Number(asset.balance) > 0);

  const checklist = protection.checklist.slice(0, 5);

  return (
    <AppShell>
      <div className="space-y-5">
        {activeIncident && (
          <Link
            to={`/activity/${activeIncident._id}`}
            className="flex flex-col gap-2 rounded-xl border border-[#F17676]/30 bg-[#F17676]/[0.06] px-4 py-3 transition-colors hover:border-[#F17676]/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#F17676]" />
              <div>
                <p className="text-[12px] font-medium text-ivory">
                  {activeIncident.title} · {activeIncident.reference}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#F17676]/90">
                  {activeIncident.responseStatus}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#F17676]">
              Review incident <ChevronRight className="size-3.5" />
            </span>
          </Link>
        )}

        <PageHeader
          title="Vault overview"
          description="Balances, withdrawal rules and the current state of your protection."
          actions={
            <>
              <StatusPill
                label={`${state.label}${vault.stateSource === "SIMULATED" ? " · simulated" : ""}`}
                tone={state.tone}
              />
              <StatusPill label="Base Sepolia" tone="neutral" />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="relative overflow-hidden rounded-2xl border border-hairline/70 bg-[linear-gradient(150deg,#0c2119_0%,#071310_62%,#0a1d16_100%)] p-5 sm:p-6">
            <div className="nonce-shell-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SectionLabel>Total protected assets</SectionLabel>
                  <span className="rounded-sm border border-[#E9B45E]/25 bg-[#E9B45E]/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-[#E9B45E]">
                    simulated ledger
                  </span>
                </div>
                <div className="mt-4 space-y-1.5">
                  {assets.map((asset) => (
                    <div key={asset._id} className="flex items-baseline gap-2">
                      <span className="font-tabular text-[34px] font-semibold leading-none tracking-tight text-ivory sm:text-[40px]">
                        {formatAmount(asset.balance)}
                      </span>
                      <span className="text-sm text-sage">{asset.symbol}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 max-w-sm text-[11px] leading-5 text-sage">
                  Token quantities only. NONCE does not display fiat values or price charts it
                  cannot verify; these balances live in a sandbox ledger, not on-chain.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <DepositButton vaultId={vault._id} assets={assets} />
                  <WithdrawDialog vaultId={vault._id} assets={assets} policy={policy}>
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg border-hairline bg-black/20 px-4 text-xs text-ivory hover:border-mint/30 hover:bg-white/[0.03]"
                    >
                      Withdraw
                    </Button>
                  </WithdrawDialog>
                  {pendingWithdrawals.length > 0 && (
                    <Link
                      to="/vault"
                      className="text-[11px] text-[#E9B45E] underline-offset-4 hover:underline"
                    >
                      {pendingWithdrawals.length} awaiting execution
                    </Link>
                  )}
                </div>

                {!hasBalances && (
                  <p className="mt-4 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2 text-[10px] leading-5 text-sage">
                    This vault starts at zero. Use Deposit to add simulated balances, or load the
                    full demo from Protection once you are ready.
                  </p>
                )}
              </div>

              <div className="relative mx-auto w-[190px] shrink-0 sm:mx-0 sm:w-[210px]">
                <VaultDial compact />
                <div className="absolute inset-x-0 bottom-0 flex justify-center">
                  <StatusPill
                    label={vault.state === "NORMAL" ? "Sealed · 2-of-3" : state.label}
                    tone={vault.state === "NORMAL" ? "safe" : state.tone}
                    className="bg-[#071310]/90 backdrop-blur-sm"
                  />
                </div>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline/50 pt-4 text-[10px] text-sage">
              <span className="flex items-center gap-1.5">
                <KeyRound className="size-3 text-mint/80" />
                {workspace.wallet?.verification === "SIGNATURE" ? "Signer verified" : "Demo signer"}
              </span>
              <span className="flex items-center gap-1.5">
                <VaultIcon className="size-3 text-mint/80" />
                {vault.name}
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                <Copy className="size-3 text-mint/80" />
                {truncateMiddle(vault.ownerSigner, 6, 4)}
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3 text-mint/80" />
                {vault.deploymentStatus === "SIMULATED" ? "Deployment simulated" : vault.deploymentStatus}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Security posture</SectionLabel>
              <StatusPill label={protection.label} tone={protectionTone(protection.level)} />
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="font-tabular text-3xl font-semibold tracking-tight text-ivory">
                {protection.score}%
              </span>
              <span className="pb-1 text-[11px] text-sage">coverage</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  protectionTone(protection.level) === "safe"
                    ? "bg-mint"
                    : protectionTone(protection.level) === "danger"
                      ? "bg-[#F17676]"
                      : "bg-[#E9B45E]",
                )}
                style={{ width: `${protection.score}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-sage">{protection.summary}</p>

            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="flex min-w-0 items-center gap-2 text-sage">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        item.status === "OK"
                          ? "bg-mint"
                          : item.status === "WARN"
                            ? "bg-[#E9B45E]"
                            : item.status === "BLOCKED"
                              ? "bg-[#F17676]"
                              : "bg-sage/50",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px]",
                      item.status === "OK"
                        ? "text-mint"
                        : item.status === "WARN"
                          ? "text-[#E9B45E]"
                          : item.status === "BLOCKED"
                            ? "text-[#F17676]"
                            : "text-sage",
                    )}
                  >
                    {item.status === "OK" ? "Ready" : item.status === "WARN" ? "Review" : item.status === "BLOCKED" ? "Blocked" : "Missing"}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to="/protection"
              className="mt-4 flex items-center justify-between rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5 text-[11px] text-ivory transition-colors hover:border-mint/30 hover:text-mint"
            >
              Open protection
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              to: "/vault",
              icon: Lock,
              label: "Withdrawal guard",
              value: policy ? `${policy.delayMinutes} min delay` : "Not set",
              detail: policy ? `Limit ${policy.maxPerTransaction} ETH per transaction` : "Set a policy",
            },
            {
              to: "/protection#decoys",
              icon: Radar,
              label: "Decoy network",
              value: `${activeDecoys.length} monitoring`,
              detail: activeDecoys.length >= 3 ? "Three or more sensors active" : "Add sensors",
            },
            {
              to: "/recovery",
              icon: Users,
              label: "Guardian recovery",
              value: `${confirmedGuardians.length} of 3 confirmed`,
              detail: "Two approvals replace a signer",
            },
            {
              to: "/protection#monitoring",
              icon: Activity,
              label: "Monitoring",
              value: monitoringState.label,
              detail: monitoring?.lastProcessedAt ? `Checked ${timeAgo(monitoring.lastProcessedAt)}` : "No checkpoint",
              tone: monitoringState.tone,
            },
          ].map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="group rounded-xl border border-hairline/70 bg-[#0b1c16]/70 p-4 transition-colors hover:border-mint/25 hover:bg-[#0d211a]"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg border border-hairline bg-black/25 text-mint">
                  <card.icon className="size-3.5" />
                </span>
                <ArrowUpRight className="size-3.5 text-sage transition-colors group-hover:text-mint" />
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-sage">{card.label}</p>
              <p className="mt-1 text-[13px] font-medium text-ivory">{card.value}</p>
              <p className="mt-0.5 text-[10px] text-sage">{card.detail}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
            <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
              <SectionLabel>My assets</SectionLabel>
              <Link to="/vault" className="text-[10px] text-mint hover:text-mint-bright">
                Manage vault →
              </Link>
            </div>
            <ul className="divide-y divide-hairline/40">
              {assets.map((asset) => (
                <li key={asset._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full border border-hairline bg-black/25 text-[10px] font-semibold text-ivory">
                      {asset.symbol.slice(0, 3)}
                    </span>
                    <div>
                      <p className="text-[12px] font-medium text-ivory">{asset.name}</p>
                      <p className="mt-0.5 text-[10px] text-sage">
                        {asset.kind === "NATIVE" ? "Native asset" : "ERC-20 · simulated"} · Base Sepolia
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-tabular text-[13px] text-ivory">{formatAmount(asset.balance)}</p>
                      <p className="text-[9px] uppercase tracking-wider text-sage">{asset.symbol}</p>
                    </div>
                    <WithdrawDialog
                      vaultId={vault._id}
                      assets={assets}
                      policy={policy}
                      defaultSymbol={asset.symbol}
                    >
                      <button
                        type="button"
                        aria-label={`Withdraw ${asset.symbol}`}
                        className="flex size-8 items-center justify-center rounded-md border border-hairline/70 text-sage transition-colors hover:border-mint/30 hover:text-mint"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </button>
                    </WithdrawDialog>
                  </div>
                </li>
              ))}
              {assets.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-sage">No assets are configured.</li>
              )}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-hairline/50 px-5 py-3">
              <p className="text-[10px] text-sage">
                Balances are simulated. Deposits and withdrawals never touch a chain.
              </p>
              <Address value={vault.ownerSigner} lead={4} tail={4} className="text-[10px]" />
            </div>
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
            <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
              <SectionLabel>Recent activity</SectionLabel>
              <Link to="/activity" className="text-[10px] text-mint hover:text-mint-bright">
                View all →
              </Link>
            </div>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={<Activity className="size-4" />}
                title="No activity yet"
                description="Deposits, withdrawal requests, incidents and recovery actions will appear here with an explicit status."
                className="m-4 border-0 bg-transparent py-10"
              />
            ) : (
              <ul className="divide-y divide-hairline/40">
                {recentActivity.map((entry) => {
                  const tone = entry.status.includes("FAIL") || entry.status.includes("LOCKDOWN")
                    ? "danger"
                    : entry.kind === "RECOVERY"
                      ? "safe"
                      : "neutral";
                  return (
                    <li key={entry._id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-ivory">{entry.description}</p>
                        <p className="mt-0.5 text-[10px] text-sage">
                          {timeAgo(entry.createdAt)}
                          {entry.simulationRef ? ` · ${entry.simulationRef}` : ""}
                        </p>
                      </div>
                      <StatusPill
                        label={entry.status.replace(/_/g, " ")}
                        tone={tone === "safe" ? "safe" : tone === "danger" ? "danger" : "neutral"}
                        className="shrink-0 text-[9px]"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-hairline/50 px-5 py-3">
              <p className="flex items-center gap-1.5 text-[10px] text-sage">
                <Lock className="size-3 text-mint/70" /> {formatTime(Date.now())} · sandbox ledger
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
