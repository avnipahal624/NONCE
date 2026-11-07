import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Users,
  Vault as VaultIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, EmptyState, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { VaultDial } from "@/components/nonce/VaultDial";
import { Address } from "@/components/nonce/Address";
import { DepositDialog, WithdrawDialog } from "@/components/nonce/AssetActions";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatRemaining,
  greeting,
  monitoringCopy,
  protectionTone,
  timeAgo,
  vaultStateCopy,
} from "@/lib/nonce";
import type { Tone } from "@/lib/nonce";

const WITHDRAWAL_TONE: Record<string, Tone> = {
  QUEUED: "warn",
  AWAITING_GUARDIANS: "warn",
  READY: "info",
  COMPLETED: "safe",
  CANCELLED: "neutral",
  BLOCKED: "danger",
  FAILED: "danger",
};

type SecurityStatus = {
  label: string;
  tone: Tone;
  reason: string;
  action: { to: string; label: string };
};

function deriveSecurityStatus({
  state,
  stateDescription,
  protectionLevel,
  protectionSummary,
  mandatoryMet,
  monitoringStatus,
  activeIncidentId,
  mode,
}: {
  state: string;
  stateDescription: string;
  protectionLevel: string;
  protectionSummary: string;
  mandatoryMet: boolean;
  monitoringStatus: string | undefined;
  activeIncidentId: string | null;
  mode: string;
}): SecurityStatus {
  if (state === "LOCKDOWN") {
    return {
      label: "Vault frozen",
      tone: "danger",
      reason: `${stateDescription} Withdrawals are blocked by the vault state, not by this screen.`,
      action: { to: "/recovery", label: "Open guardian recovery" },
    };
  }
  if (state === "RECOVERY") {
    return {
      label: "Recovery in progress",
      tone: "warn",
      reason: `${stateDescription} Normal withdrawals remain blocked until the guardian process completes.`,
      action: { to: "/recovery", label: "Review recovery request" },
    };
  }
  if (activeIncidentId) {
    return {
      label: "Response required",
      tone: "danger",
      reason:
        "An open incident needs review. Detection does not prove compromise, and the vault is not called frozen until a confirmed freeze state exists.",
      action: { to: `/activity/${activeIncidentId}`, label: "Open response center" },
    };
  }
  if (!mandatoryMet) {
    return {
      label: "Setup incomplete",
      tone: "warn",
      reason: `${protectionSummary} Finish the mandatory safeguards before relying on the vault's withdrawal limits.`,
      action: { to: "/protection", label: "Review protection setup" },
    };
  }
  if (monitoringStatus !== "ACTIVE") {
    return {
      label: monitoringStatus === "DEGRADED" ? "Monitoring degraded" : "Monitoring offline",
      tone: "danger",
      reason:
        "No healthy monitor is processing events. On-chain delays and limits may still apply, but detection is not currently active.",
      action: { to: "/protection#monitoring", label: "Review monitoring health" },
    };
  }
  if (protectionLevel === "PROTECTED" && mode !== "DEMO") {
    return {
      label: "Protected by contract",
      tone: "safe",
      reason:
        "The configured safeguards are reported as contract-enforced. This is still a testnet environment and is not an audited production guarantee.",
      action: { to: "/vault", label: "Review vault controls" },
    };
  }
  return {
    label: "Sandbox controls configured",
    tone: "warn",
    reason:
      "The sandbox mirrors the withdrawal rules and guardian flow, but nothing here is enforced on-chain and no real funds are involved.",
    action: { to: "/testnet", label: "Open live testnet console" },
  };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  to,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-hairline/70 bg-[#0b1f17]/75 p-4 transition-colors hover:border-mint/30 hover:bg-[#0d241b]"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border",
            tone === "danger"
              ? "border-[#EF7777]/25 bg-[#EF7777]/10 text-[#EF7777]"
              : tone === "warn"
                ? "border-[#E9B45E]/25 bg-[#E9B45E]/10 text-[#E9B45E]"
                : tone === "safe"
                  ? "border-mint/25 bg-mint/10 text-mint"
                  : "border-hairline bg-black/25 text-mint/80",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <ArrowUpRight className="size-3.5 text-sage/60 transition-colors group-hover:text-mint" />
      </div>
      <p className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-sage">{label}</p>
      <p className="mt-1 font-tabular text-[19px] font-semibold tracking-tight text-ivory">{value}</p>
      <p className="mt-1 truncate text-[10px] text-sage">{detail}</p>
    </Link>
  );
}

function ActionCardContent({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Activity;
  title: string;
  detail: string;
}) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-mint/80 transition-colors group-hover:text-mint">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-ivory">{title}</span>
        <span className="mt-0.5 block text-[9px] leading-4 text-sage">{detail}</span>
      </span>
    </>
  );
}

const actionCardClass =
  "group flex w-full items-start gap-3 rounded-xl border border-hairline/70 bg-black/20 p-3.5 text-left transition-colors hover:border-mint/30 hover:bg-white/[0.025]";

function ActionCard({
  to,
  icon,
  title,
  detail,
}: {
  to: string;
  icon: typeof Activity;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className={actionCardClass}>
      <ActionCardContent icon={icon} title={title} detail={detail} />
    </Link>
  );
}

const ActionButton = forwardRef<
  HTMLButtonElement,
  {
    icon: typeof Activity;
    title: string;
    detail: string;
    disabled?: boolean;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function ActionButton({ icon, title, detail, disabled, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        actionCardClass,
        disabled && "cursor-not-allowed opacity-45 hover:border-hairline/70 hover:bg-black/20",
      )}
    >
      <ActionCardContent icon={icon} title={title} detail={detail} />
    </button>
  );
});

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading dashboard">
      <div className="h-16 animate-pulse rounded-xl border border-hairline/50 bg-white/[0.02]" />
      <div className="h-64 animate-pulse rounded-2xl border border-hairline/50 bg-white/[0.02]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border border-hairline/50 bg-white/[0.02]"
          />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { workspace, isLoading } = useWorkspace();
  const testnetFeed = useQuery(api.nonce.testnetEvents.feed, { limit: 3 });
  const now = useNow(30_000);

  if (isLoading) {
    return (
      <AppShell>
        <DashboardSkeleton />
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

  const {
    vault,
    assets,
    protection,
    policy,
    activeIncident,
    pendingWithdrawals,
    recentActivity,
    monitoring,
    guardians,
  } = workspace;
  const state = vaultStateCopy(vault.state);
  const monitoringState = monitoringCopy(monitoring?.status);
  const confirmedGuardians = guardians.filter((guardian) => guardian.status === "CONFIRMED");
  const activeDecoys = workspace.decoys.filter((decoy) => decoy.status === "ACTIVE");
  const eth = assets.find((asset) => asset.symbol === "ETH");
  const pendingEth = pendingWithdrawals
    .filter((request) => request.symbol === "ETH")
    .reduce((total, request) => total + Number(request.amount), 0);
  const locked = vault.state === "LOCKDOWN" || vault.state === "RECOVERY";
  const isDemo = vault.mode === "DEMO";
  const workspaceVerified = vault.deploymentStatus === "CONFIRMED";
  const accountName = workspace.account.displayName ?? workspace.account.email ?? "Vault owner";
  const security = deriveSecurityStatus({
    state: vault.state,
    stateDescription: state.description,
    protectionLevel: protection.level,
    protectionSummary: protection.summary,
    mandatoryMet: protection.mandatoryMet,
    monitoringStatus: monitoring?.status,
    activeIncidentId: activeIncident?._id ?? null,
    mode: vault.mode,
  });
  const coverageTone = protectionTone(protection.level);

  return (
    <AppShell>
      <div className="space-y-5">
        {activeIncident && (
          <Link
            to={`/activity/${activeIncident._id}`}
            className="flex flex-col gap-2 rounded-xl border border-[#E9B45E]/30 bg-[#E9B45E]/[0.06] px-4 py-3 transition-colors hover:border-[#E9B45E]/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#E9B45E]" />
              <div>
                <p className="text-[12px] font-medium text-ivory">
                  {activeIncident.title} · {activeIncident.reference}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#E9B45E]/90">
                  {activeIncident.responseStatus}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#E9B45E]">
              Review response <ChevronRight className="size-3.5" />
            </span>
          </Link>
        )}

        <PageHeader
          eyebrow="Security command center"
          title={`${greeting()}, ${accountName}`}
          description={
            isDemo
              ? "Your sandbox vault is configured for simulation. Live Base Sepolia actions stay in the testnet console, and no sandbox balance is presented as on-chain."
              : "Read the vault state, response queue and live contract status from the sources that own them. Unverified deployment state is never presented as protection."
          }
          actions={
            <>
              <StatusPill
                label={
                  isDemo
                    ? "Sandbox"
                    : workspaceVerified
                      ? "Live workspace"
                      : "Live workspace · unverified"
                }
                tone={isDemo ? "warn" : workspaceVerified ? "safe" : "neutral"}
              />
              <StatusPill label="Base Sepolia · 84532" tone="neutral" />
              <StatusPill label={protection.label} tone={protectionTone(protection.level)} />
            </>
          }
        />

        <section className="relative overflow-hidden rounded-2xl border border-hairline/80 bg-[linear-gradient(135deg,#0b241b_0%,#071912_54%,#0b2018_100%)]">
          <div className="nonce-shell-grid pointer-events-none absolute inset-0 opacity-35" aria-hidden="true" />
          <div className="relative grid gap-6 p-5 sm:p-7 xl:grid-cols-[1.28fr_0.72fr] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Current security status</SectionLabel>
                <StatusPill label={security.label} tone={security.tone} />
                <span className="rounded-sm border border-hairline/80 bg-black/20 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-sage">
                  {isDemo ? "Not on-chain" : "Contract source"}
                </span>
              </div>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-ivory sm:text-[38px]">
                {security.label}
              </h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-6 text-sage">{protection.summary}</p>
              <p className="mt-2 max-w-2xl text-[11px] leading-5 text-sage/80">{security.reason}</p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  className="h-9 rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright"
                >
                  <Link to={security.action.to}>{security.action.label}</Link>
                </Button>
                <Link
                  to="/protection"
                  className="rounded-lg border border-hairline/70 px-3.5 py-2 text-[11px] text-sage transition-colors hover:border-mint/30 hover:text-ivory"
                >
                  View protection details
                </Link>
              </div>

              <div className="mt-6 grid gap-2 border-t border-hairline/50 pt-4 sm:grid-cols-3">
                {[
                  {
                    label: "Monitoring",
                    value: monitoringState.label,
                    detail: monitoring?.lastProcessedAt
                      ? `Checked ${timeAgo(monitoring.lastProcessedAt)}`
                      : "No checkpoint",
                    tone: monitoringState.tone,
                  },
                  {
                    label: "Vault state",
                    value: state.label,
                    detail: vault.stateSource === "SIMULATED" ? "Simulated state" : "On-chain state",
                    tone: state.tone,
                  },
                  {
                    label: "Guardian quorum",
                    value: `${confirmedGuardians.length}/3 confirmed`,
                    detail: "2 required for recovery",
                    tone: confirmedGuardians.length >= 2 ? "safe" : "warn",
                  },
                ].map((fact) => (
                  <div key={fact.label} className="rounded-lg border border-hairline/50 bg-black/15 px-3 py-2.5">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-sage">{fact.label}</p>
                    <p className={cn("mt-1 text-[11px] font-medium", fact.tone === "safe" ? "text-mint" : fact.tone === "danger" ? "text-[#EF7777]" : "text-[#E9B45E]")}>
                      {fact.value}
                    </p>
                    <p className="mt-0.5 text-[9px] text-sage">{fact.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[270px]">
              <VaultDial compact />
              <div className="absolute inset-x-0 bottom-0 flex justify-center">
                <StatusPill
                  label={locked ? state.label : "Sealed · 2-of-3"}
                  tone={locked ? state.tone : isDemo ? "warn" : "safe"}
                  className="bg-[#071912]/90 backdrop-blur-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={VaultIcon}
            label="Vault ETH balance"
            value={`${formatAmount(eth?.balance ?? "0")} ETH`}
            detail={
              isDemo
                ? "Sandbox ledger · not on-chain"
                : "Workspace ledger · testnet read is in the console"
            }
            to="/vault"
          />
          <MetricCard
            icon={Clock3}
            label="Pending withdrawals"
            value={String(pendingWithdrawals.length)}
            detail={
              pendingWithdrawals.length
                ? `${formatAmount(pendingEth)} ETH reserved`
                : "Nothing waiting"
            }
            tone={pendingWithdrawals.length ? "warn" : "neutral"}
            to="/vault"
          />
          <MetricCard
            icon={ShieldAlert}
            label="Active alerts"
            value={activeIncident ? "1" : "0"}
            detail={activeIncident ? activeIncident.reference : "No open incident"}
            tone={activeIncident ? "danger" : "safe"}
            to={activeIncident ? `/activity/${activeIncident._id}` : "/activity"}
          />
          <MetricCard
            icon={Users}
            label="Guardians"
            value={`${confirmedGuardians.length} / 3`}
            detail={`2 required · ${activeDecoys.length} decoy sensors active`}
            tone={confirmedGuardians.length >= 2 ? "safe" : "warn"}
            to="/recovery"
          />
        </div>

        <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SectionLabel>Quick actions</SectionLabel>
              <p className="mt-1 text-[10px] text-sage">
                Owner-authorized actions only. Locked vaults block ordinary withdrawals.
              </p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.14em] text-sage/70">
              {locked ? "Vault locked" : "Owner session"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <DepositDialog vaultId={vault._id} assets={assets}>
              <ActionButton icon={VaultIcon} title="Deposit assets" detail="Record a sandbox ledger balance" />
            </DepositDialog>
            {locked ? (
              <ActionButton
                icon={Lock}
                title="Request withdrawal"
                detail="Blocked during lockdown or recovery"
                disabled
              />
            ) : (
              <WithdrawDialog vaultId={vault._id} assets={assets} policy={policy}>
                <ActionButton icon={ArrowUpRight} title="Request withdrawal" detail="Queue a delayed owner request" />
              </WithdrawDialog>
            )}
            <ActionCard
              to="/activity"
              icon={ShieldAlert}
              title="Review alerts"
              detail={activeIncident ? "Open the response queue" : "No active incident"}
            />
            <ActionCard to="/recovery" icon={Users} title="Manage guardians" detail="Review quorum and recovery" />
            <ActionCard
              to="/vault#policy"
              icon={ShieldCheck}
              title="View protection policy"
              detail="Limits, delay and allowlist"
            />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <div>
                  <SectionLabel>Protected assets</SectionLabel>
                  <p className="mt-0.5 text-[9px] text-sage">
                    {isDemo
                      ? "Simulated balances · no chain read"
                      : "Workspace ledger · testnet state is read in the console"}
                  </p>
                </div>
                <Link to="/vault" className="text-[10px] text-mint hover:text-mint-bright">
                  Manage vault →
                </Link>
              </div>
              <ul className="divide-y divide-hairline/40">
                {assets.map((asset) => (
                  <li key={asset._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-black/25 text-[9px] font-semibold text-ivory">
                        {asset.symbol.slice(0, 3)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-ivory">{asset.name}</p>
                        <p className="mt-0.5 text-[9px] text-sage">
                          {asset.kind === "NATIVE" ? "Native ETH" : "ERC-20 ledger entry"} ·{" "}
                          {isDemo ? "simulated" : "workspace"}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-tabular text-[14px] font-medium text-ivory">
                        {formatAmount(asset.balance)}
                      </p>
                      <p className="text-[9px] uppercase tracking-wider text-sage">{asset.symbol}</p>
                    </div>
                  </li>
                ))}
                {assets.length === 0 && (
                  <li className="px-5 py-6 text-center text-[11px] text-sage">
                    No assets are configured. Open the vault to add a sandbox balance.
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline/50 px-5 py-3">
                <p className="flex items-center gap-1.5 text-[9px] text-sage">
                  <KeyRound className="size-3 text-mint/70" />
                  {workspace.wallet?.verification === "SIGNATURE" ? "Wallet ownership proven" : "Sandbox signer only"}
                </p>
                <Address value={vault.ownerSigner} lead={4} tail={4} className="text-[10px]" />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <div>
                  <SectionLabel>Withdrawals in flight</SectionLabel>
                  <p className="mt-0.5 text-[9px] text-sage">Delayed requests and their next gate</p>
                </div>
                <Link to="/vault" className="text-[10px] text-mint hover:text-mint-bright">
                  Track all →
                </Link>
              </div>
              {pendingWithdrawals.length === 0 ? (
                <div className="px-5 py-6 text-center text-[11px] text-sage">
                  Nothing is queued. Every accepted withdrawal will appear here with its delay and
                  guardian requirement.
                </div>
              ) : (
                <ul className="divide-y divide-hairline/40">
                  {pendingWithdrawals.slice(0, 2).map((request) => {
                    const delayReady = now >= request.executeAfter;
                    const approvalsReady =
                      request.requiredApprovals === 0 ||
                      request.approvals.length >= request.requiredApprovals;
                    return (
                      <li key={request._id} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="font-tabular text-[13px] text-ivory">
                              {formatAmount(request.amount)} {request.symbol}
                            </p>
                            <StatusPill
                              label={request.status.replace(/_/g, " ")}
                              tone={WITHDRAWAL_TONE[request.status] ?? "neutral"}
                              className="text-[9px]"
                            />
                          </div>
                          <span className="text-[9px] text-sage">{request.simulationRef}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-sage">
                          To <Address value={request.destination} lead={5} tail={4} className="text-[10px]" /> ·{" "}
                          {delayReady ? "delay elapsed" : `unlocks in ${formatRemaining(request.executeAfter, now)}`}
                          {request.requiredApprovals > 0 &&
                            ` · ${request.approvals.length}/${request.requiredApprovals} approvals`}
                        </p>
                        {!delayReady && (
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-[#E9B45E] transition-[width] duration-700"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    5,
                                    ((now - request.createdAt) /
                                      Math.max(request.executeAfter - request.createdAt, 1)) *
                                      100,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                        {delayReady && !approvalsReady && (
                          <p className="mt-2 text-[9px] text-[#E9B45E]">
                            Delay satisfied; guardian quorum still pending.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <div>
                  <SectionLabel>Recent activity</SectionLabel>
                  <p className="mt-0.5 text-[9px] text-sage">Append-only workspace record</p>
                </div>
                <Link to="/activity" className="text-[10px] text-mint hover:text-mint-bright">
                  View all →
                </Link>
              </div>
              {recentActivity.length === 0 ? (
                <EmptyState
                  icon={<Activity className="size-4" />}
                  title="No activity yet"
                  description="Deposits, withdrawals, incidents and recovery actions appear here with an explicit status."
                  className="m-4 border-0 bg-transparent py-8"
                />
              ) : (
                <ul className="divide-y divide-hairline/40">
                  {recentActivity.slice(0, 4).map((entry) => (
                    <li key={entry._id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-hairline bg-black/25 text-sage">
                          {entry.kind === "WITHDRAWAL" ? (
                            <ArrowUpRight className="size-3.5" />
                          ) : entry.kind === "RECOVERY" ? (
                            <Users className="size-3.5" />
                          ) : entry.kind === "SECURITY" ? (
                            <ShieldAlert className="size-3.5" />
                          ) : (
                            <Activity className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] text-ivory">{entry.description}</p>
                          <p className="mt-0.5 text-[9px] text-sage">
                            {timeAgo(entry.createdAt)}
                            {entry.simulationRef ? ` · ${entry.simulationRef}` : ""}
                          </p>
                        </div>
                      </div>
                      <StatusPill
                        label={entry.status.replace(/_/g, " ")}
                        tone={
                          entry.status.includes("FAIL") || entry.status.includes("LOCKDOWN")
                            ? "danger"
                            : entry.kind === "RECOVERY"
                              ? "safe"
                              : "neutral"
                        }
                        className="shrink-0 text-[8px]"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Protection coverage</SectionLabel>
                <StatusPill label={protection.label} tone={protectionTone(protection.level)} />
              </div>
              <div className="mt-4 flex items-end gap-2">
                <span className="font-tabular text-3xl font-semibold tracking-tight text-ivory">
                  {protection.score}%
                </span>
                <span className="pb-1 text-[10px] text-sage">configured</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    coverageTone === "safe"
                      ? "bg-mint"
                      : coverageTone === "danger"
                        ? "bg-[#EF7777]"
                        : "bg-[#E9B45E]",
                  )}
                  style={{ width: `${protection.score}%` }}
                />
              </div>
              <p className="mt-3 text-[10px] leading-5 text-sage">{protection.summary}</p>
              <ul className="mt-4 space-y-2">
                {protection.checklist.slice(0, 5).map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="flex min-w-0 items-center gap-2 text-sage">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          item.status === "OK"
                            ? "bg-mint"
                            : item.status === "WARN"
                              ? "bg-[#E9B45E]"
                              : item.status === "BLOCKED"
                                ? "bg-[#EF7777]"
                                : "bg-sage/40",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[9px]",
                        item.status === "OK"
                          ? "text-mint"
                          : item.status === "WARN"
                            ? "text-[#E9B45E]"
                            : item.status === "BLOCKED"
                              ? "text-[#EF7777]"
                              : "text-sage",
                      )}
                    >
                      {item.status === "OK"
                        ? "Ready"
                        : item.status === "WARN"
                          ? "Review"
                          : item.status === "BLOCKED"
                            ? "Blocked"
                            : "Missing"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to="/protection"
                className="mt-4 flex items-center justify-between rounded-lg border border-hairline/60 bg-black/15 px-3 py-2.5 text-[10px] text-ivory transition-colors hover:border-mint/30 hover:text-mint"
              >
                Open protection controls
                <ChevronRight className="size-3.5" />
              </Link>
            </section>

            <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Guardian recovery</SectionLabel>
                <Link to="/recovery" className="text-[10px] text-mint hover:text-mint-bright">
                  Manage →
                </Link>
              </div>
              <p className="mt-2 text-[11px] text-ivory">
                {confirmedGuardians.length} of 3 guardians confirmed · 2 required
              </p>
              <ul className="mt-3 space-y-2">
                {guardians.slice(0, 3).map((guardian) => (
                  <li key={guardian._id} className="flex items-center justify-between gap-2 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] text-ivory">{guardian.label}</p>
                      <Address value={guardian.address} lead={4} tail={4} className="mt-0.5 text-[9px]" />
                    </div>
                    <StatusPill
                      label={guardian.status === "CONFIRMED" ? "Confirmed" : "Invited"}
                      tone={guardian.status === "CONFIRMED" ? "safe" : "warn"}
                      className="text-[8px]"
                    />
                  </li>
                ))}
                {guardians.length === 0 && (
                  <li className="rounded-lg border border-dashed border-hairline/70 px-3 py-4 text-center text-[10px] text-sage">
                    No guardians configured. Recovery cannot be exercised.
                  </li>
                )}
              </ul>
              <div className="mt-3 border-t border-hairline/50 pt-3">
                <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Withdrawal policy</p>
                <p className="mt-1 text-[10px] leading-5 text-sage">
                  {policy
                    ? `${policy.maxPerTransaction} ETH per tx · ${policy.rollingLimit ?? "2.5"} ETH / 24h · ${policy.delayMinutes} min large-request delay · 2-of-3 guardians.`
                    : "No policy is configured."}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Live testnet index</SectionLabel>
                <StatusPill
                  label={
                    testnetFeed === undefined
                      ? "Checking"
                      : testnetFeed.configured
                        ? testnetFeed.checkpoint?.health ?? "Indexing"
                        : "Not configured"
                  }
                  tone={
                    testnetFeed?.configured
                      ? testnetFeed.checkpoint?.health === "ACTIVE"
                        ? "safe"
                        : "warn"
                      : "neutral"
                  }
                />
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">
                {testnetFeed?.configured
                  ? "Confirmed Base Sepolia activity from the globally configured contract. This is separate from the sandbox ledger."
                  : "No live contract is configured in this environment. The sandbox below does not pretend to be an on-chain index."}
              </p>
              {testnetFeed?.configured ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Last block</p>
                    <p className="mt-1 font-mono text-[10px] text-ivory">
                      {testnetFeed.checkpoint?.lastProcessedBlock ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Events / alerts</p>
                    <p className="mt-1 font-mono text-[10px] text-ivory">
                      {testnetFeed.events.length} / {testnetFeed.alerts.length}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-[#E9B45E]/20 bg-[#E9B45E]/[0.04] px-3 py-2.5 text-[10px] leading-5 text-[#E9B45E]/90">
                  Configure `NONCE_VAULT_ADDRESS` and `BASE_SEPOLIA_RPC_URL` on the Convex
                  deployment before treating the testnet console as live.
                </div>
              )}
              <Link
                to="/testnet"
                className="mt-3 inline-flex items-center gap-1 text-[10px] text-mint hover:text-mint-bright"
              >
                Open testnet console <ArrowUpRight className="size-3" />
              </Link>
            </section>

            <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/60 p-4">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-[#E9B45E]" />
                <p className="text-[9px] leading-5 text-sage">
                  {isDemo
                    ? "Sandbox only: balances, transfers, freezes and guardian approvals are simulated. No private key, seed phrase or real funds are involved."
                    : "Live mode is scoped to Base Sepolia. Read the contract state from the configured RPC; confirmation is never assumed from a submitted hash."}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
