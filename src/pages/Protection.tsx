import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Radar,
  ShieldOff,
  Siren,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { PolicyDialog } from "@/components/nonce/PolicyDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import {
  formatTime,
  monitoringCopy,
  protectionTone,
  timeAgo,
  vaultStateCopy,
} from "@/lib/nonce";

const SIGNAL_TYPES = [
  { value: "SIGNED_TX", label: "Unexpected signed transaction", hint: "A key signed activity at a decoy.", risk: "HIGH" },
  { value: "NONCE_CHANGE", label: "Nonce change", hint: "The address sent something unexpectedly.", risk: "HIGH" },
  { value: "CONTRACT_CALL", label: "Contract call", hint: "A token approval or contract interaction.", risk: "MEDIUM" },
  { value: "UNSOLICITED_TRANSFER", label: "Unsolicited transfer", hint: "Inbound spam. This must stay low risk.", risk: "LOW" },
] as const;

type SignalType = (typeof SIGNAL_TYPES)[number]["value"];

export default function Protection() {
  const { workspace, isLoading } = useWorkspace();
  const triggerSignal = useMutation(api.nonce.monitor.triggerDecoySignal);
  const setHealth = useMutation(api.nonce.monitor.setMonitoringHealth);
  const setDecoyStatus = useMutation(api.nonce.decoys.setStatus);
  const createDecoy = useMutation(api.nonce.decoys.create);
  const seedDemo = useMutation(api.nonce.demo.seedDemoVault);

  const [signalType, setSignalType] = useState<SignalType>("SIGNED_TX");
  const [decoyId, setDecoyId] = useState<string>("");
  const [failLockdown, setFailLockdown] = useState(false);
  const [newDecoy, setNewDecoy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const { vault, protection, guardians, decoys, policy, monitoring } = workspace;
  const state = vaultStateCopy(vault.state);
  const monitoringState = monitoringCopy(monitoring?.status);
  const selectedDecoy =
    decoys.find((decoy) => decoy._id === decoyId) ?? decoys.find((decoy) => decoy.status === "ACTIVE") ?? decoys[0];
  const confirmedGuardians = guardians.filter((guardian) => guardian.status === "CONFIRMED");

  const run = async (id: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action did not complete.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Protection"
          title="What is actually protecting this vault"
          description="Coverage is computed from configured state. Decoys detect, the policy slows, guardians approve, and the vault state blocks. None of these claims to be more than it is."
          actions={
            <>
              <StatusPill label={protection.label} tone={protectionTone(protection.level)} />
              <StatusPill label={`${state.label} state`} tone={state.tone} />
            </>
          }
        />

        {vault.state === "LOCKDOWN" || vault.state === "RECOVERY" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#F17676]/30 bg-[#F17676]/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-[#F17676]" />
              <div>
                <p className="text-[12px] font-medium text-ivory">
                  Withdrawals are blocked in the {state.label.toLowerCase()} state.
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#F17676]/90">
                  {state.description} A review action cannot release the vault on its own.
                </p>
              </div>
            </div>
            <Link
              to="/recovery"
              className="shrink-0 rounded-lg border border-[#F17676]/30 px-3 py-2 text-[11px] text-[#F17676] hover:bg-[#F17676]/10"
            >
              Open recovery →
            </Link>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Protection checklist</SectionLabel>
              <span className="font-tabular text-[11px] text-sage">{protection.score}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full",
                  protection.level === "PROTECTED"
                    ? "bg-mint"
                    : protection.level === "AT_RISK" || protection.level === "LOCKDOWN"
                      ? "bg-[#F17676]"
                      : "bg-[#E9B45E]",
                )}
                style={{ width: `${protection.score}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-sage">{protection.summary}</p>

            <ul className="mt-4 divide-y divide-hairline/40">
              {protection.checklist.map((item) => (
                <li key={item.key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-ivory">{item.label}</p>
                    <p className="mt-1 text-[10px] leading-5 text-sage">{item.detail}</p>
                  </div>
                  <StatusPill
                    label={
                      item.status === "OK"
                        ? "Ready"
                        : item.status === "WARN"
                          ? "Review"
                          : item.status === "BLOCKED"
                            ? "Blocked"
                            : "Missing"
                    }
                    tone={
                      item.status === "OK"
                        ? "safe"
                        : item.status === "WARN"
                          ? "warn"
                          : item.status === "BLOCKED"
                            ? "danger"
                            : "neutral"
                    }
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>

            {!protection.mandatoryMet && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#E9B45E]/20 bg-[#E9B45E]/[0.05] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#E9B45E]" />
                <p className="text-[10px] leading-5 text-[#E9B45E]/90">
                  Mandatory safeguards are incomplete. Existing on-chain rules, if any, remain the
                  only real protection.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Incident simulation</SectionLabel>
              <StatusPill label="Sandbox only" tone="warn" />
            </div>
            <p className="mt-3 text-[11px] leading-6 text-sage">
              Produce a decoy event to exercise the real classification pipeline. Verification
              runs automatically, then a lockdown is requested only if the signal is high risk.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.14em] text-sage">Decoy</span>
                <select
                  value={selectedDecoy?._id ?? ""}
                  onChange={(event) => setDecoyId(event.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-hairline bg-black/30 px-2.5 text-[11px] text-ivory outline-none focus:border-mint/40"
                >
                  {decoys.map((decoy) => (
                    <option key={decoy._id} value={decoy._id}>
                      {decoy.label} · {decoy.status.toLowerCase()}
                    </option>
                  ))}
                  {decoys.length === 0 && <option value="">No decoys configured</option>}
                </select>
              </label>

              <div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-sage">Signal type</span>
                <div className="mt-1.5 space-y-1.5">
                  {SIGNAL_TYPES.map((signal) => (
                    <button
                      key={signal.value}
                      type="button"
                      onClick={() => setSignalType(signal.value)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        signalType === signal.value
                          ? "border-mint/35 bg-mint/[0.06]"
                          : "border-hairline/70 bg-black/20 hover:border-mint/20",
                      )}
                    >
                      <span>
                        <span className="block text-[11px] text-ivory">{signal.label}</span>
                        <span className="mt-0.5 block text-[10px] text-sage">{signal.hint}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-1.5 py-0.5 text-[8px] uppercase tracking-wider",
                          signal.risk === "HIGH"
                            ? "bg-[#F17676]/15 text-[#F17676]"
                            : signal.risk === "MEDIUM"
                              ? "bg-[#E9B45E]/15 text-[#E9B45E]"
                              : "bg-white/[0.05] text-sage",
                        )}
                      >
                        {signal.risk}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-hairline/70 bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={failLockdown}
                  onChange={(event) => setFailLockdown(event.target.checked)}
                  className="mt-0.5 size-3.5 accent-[#57D5A5]"
                />
                <span className="text-[10px] leading-5 text-sage">
                  Simulate a failed lockdown submission. The incident must show FAILED, not locked.
                </span>
              </label>

              <Button
                onClick={() =>
                  void run(
                    "signal",
                    async () => {
                      if (!selectedDecoy) throw new Error("Add a decoy before producing a signal.");
                      await triggerSignal({
                        vaultId: vault._id,
                        decoyId: selectedDecoy._id,
                        signalType,
                        failLockdown: failLockdown || undefined,
                      });
                    },
                    "Signal recorded. Automated verification is running; watch Activity for the outcome.",
                  )
                }
                disabled={Boolean(busy) || !selectedDecoy || vault.state === "LOCKDOWN" || vault.state === "RECOVERY"}
                className="h-9 w-full rounded-lg bg-mint text-xs font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
              >
                {busy === "signal" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Siren className="size-3.5" /> Produce sandbox signal
                  </>
                )}
              </Button>
              {vault.state === "LOCKDOWN" || vault.state === "RECOVERY" ? (
                <p className="text-[10px] text-sage">
                  The vault is already locked. Complete recovery before producing another incident.
                </p>
              ) : null}
              {error && (
                <p role="alert" className="rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[10px] leading-5 text-[#F17676]">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-md border border-mint/20 bg-mint/[0.04] px-3 py-2 text-[10px] leading-5 text-mint/90">
                  {notice}
                </p>
              )}
            </div>
          </div>
        </div>

        <div id="decoys" className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
          <div className="flex flex-col gap-2 border-b border-hairline/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionLabel>Decoy network</SectionLabel>
              <p className="mt-1 text-[10px] text-sage">
                {decoys.filter((decoy) => decoy.status === "ACTIVE").length} active · no funds, no vault role.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newDecoy}
                onChange={(event) => setNewDecoy(event.target.value)}
                placeholder="New decoy label"
                className="h-8 w-40 border-hairline bg-black/25 text-[11px]"
              />
              <Button
                onClick={() =>
                  void run(
                    "decoy",
                    async () => {
                      if (newDecoy.trim().length < 2) throw new Error("Give the decoy a short label.");
                      await createDecoy({ vaultId: vault._id, label: newDecoy.trim() });
                      setNewDecoy("");
                    },
                    "Decoy added. Any unexpected use of this address is now a signal.",
                  )
                }
                disabled={Boolean(busy)}
                variant="outline"
                className="h-8 rounded-md border-hairline bg-transparent px-2.5 text-[10px] text-ivory hover:border-mint/30"
              >
                {busy === "decoy" ? <Loader2 className="size-3 animate-spin" /> : <><Plus className="size-3" /> Add</>}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {decoys.map((decoy) => (
              <div key={decoy._id} className="rounded-xl border border-hairline/70 bg-black/20 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md border border-hairline bg-surface text-mint">
                      <Radar className="size-3.5" />
                    </span>
                    <span className="text-[12px] text-ivory">{decoy.label}</span>
                  </span>
                  <StatusPill
                    label={decoy.status === "ACTIVE" ? "Monitoring" : "Paused"}
                    tone={decoy.status === "ACTIVE" ? "safe" : "neutral"}
                  />
                </div>
                <p className="mt-2.5 font-mono text-[10px] text-sage">{decoy.address.slice(0, 18)}…</p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-sage">
                  <span>{decoy.signalCount} signals</span>
                  <span>{decoy.lastSignalAt ? timeAgo(decoy.lastSignalAt) : "No signals yet"}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void run(`decoy-${decoy._id}`, async () => {
                      await setDecoyStatus({
                        vaultId: vault._id,
                        decoyId: decoy._id,
                        status: decoy.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      });
                    })
                  }
                  disabled={Boolean(busy) || (vault.state === "LOCKDOWN" && decoy.status === "PAUSED")}
                  className="mt-2.5 text-[10px] text-mint hover:text-mint-bright disabled:opacity-40"
                >
                  {busy === `decoy-${decoy._id}` ? (
                    "Updating…"
                  ) : decoy.status === "ACTIVE" ? (
                    "Pause sensor"
                  ) : (
                    "Re-activate sensor"
                  )}
                </button>
              </div>
            ))}
            {decoys.length === 0 && (
              <p className="col-span-full py-4 text-center text-[11px] text-sage">
                No decoys yet. Add one above, or finish onboarding.
              </p>
            )}
          </div>
          <p className="border-t border-hairline/50 px-5 py-3 text-[10px] leading-5 text-sage">
            Inbound spam at a decoy is recorded as low-risk noise. It never triggers a lockdown,
            because the product cannot verify the sender and should not punish you for it.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
          <div id="monitoring" className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Monitoring health</SectionLabel>
              <StatusPill label={monitoringState.label} tone={monitoringState.tone} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-sage">{monitoringState.detail}</p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                { label: "Last block", value: monitoring?.lastProcessedBlock?.toLocaleString() ?? "—" },
                { label: "Lag", value: monitoring ? `${monitoring.lagBlocks} blocks` : "—" },
                { label: "Last processed", value: monitoring ? formatTime(monitoring.lastProcessedAt) : "—" },
                { label: "Network", value: monitoring?.network ?? "base-sepolia" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-sage">{item.label}</p>
                  <p className="mt-1 font-tabular text-[11px] text-ivory">{item.value}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[10px] leading-5 text-sage">
              Sandbox controls: these buttons only exist because no RPC watcher is configured.
              A production monitor would report its own health, not accept it from the client.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(["ACTIVE", "DEGRADED", "OFFLINE"] as const).map((health) => (
                <button
                  key={health}
                  type="button"
                  onClick={() =>
                    void run(`health-${health}`, async () => {
                      await setHealth({ vaultId: vault._id, health });
                    })
                  }
                  disabled={Boolean(busy)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[10px] transition-colors",
                    monitoring?.status === health
                      ? "border-mint/35 bg-mint/[0.07] text-mint"
                      : "border-hairline text-sage hover:border-mint/25 hover:text-ivory",
                  )}
                >
                  {busy === `health-${health}` ? "Setting…" : health}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Guardians and policy</SectionLabel>
              <Link to="/recovery" className="text-[10px] text-mint hover:text-mint-bright">
                Manage →
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Users className="size-3.5 text-mint" />
              <p className="text-[11px] text-ivory">
                {confirmedGuardians.length} of 3 guardians confirmed · 2 required
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {guardians.map((guardian) => (
                <li key={guardian._id} className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sage">{guardian.label}</span>
                    <Address value={guardian.address} lead={4} tail={4} className="text-[10px]" />
                  </span>
                  <StatusPill
                    label={guardian.status === "CONFIRMED" ? "Confirmed" : "Invited"}
                    tone={guardian.status === "CONFIRMED" ? "safe" : "warn"}
                  />
                </li>
              ))}
              {guardians.length === 0 && <li className="text-[10px] text-sage">No guardians configured.</li>}
            </ul>

            <div className="mt-4 border-t border-hairline/50 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-sage">Withdrawal policy</p>
                <PolicyDialog vaultId={vault._id} policy={policy}>
                  <button type="button" className="text-[10px] text-mint hover:text-mint-bright">
                    Edit
                  </button>
                </PolicyDialog>
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-sage">
                {policy
                  ? `${policy.delayMinutes} minute delay above ${policy.largeWithdrawalThreshold} ETH · limit ${policy.maxPerTransaction} ETH per transaction.`
                  : "No policy configured."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-hairline/70 bg-[#0b1c16]/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-[#E9B45E]" />
            <div>
              <p className="text-[11px] font-medium text-ivory">Protection is simulated in this build</p>
              <p className="mt-0.5 text-[10px] leading-5 text-sage">
                No live watcher, no deployed contract and no real assets. In production these states
                must be enforced on-chain, not only recorded here.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void run(
                  "seed",
                  async () => {
                    await seedDemo();
                  },
                  "Sandbox balances, decoys and guardians are populated. Nothing was broadcast.",
                )
              }
              disabled={Boolean(busy)}
              className="rounded-lg border border-hairline px-3 py-2 text-[10px] text-ivory hover:border-mint/30 hover:text-mint disabled:opacity-40"
            >
              {busy === "seed" ? <Loader2 className="size-3 animate-spin" /> : "Load demo data"}
            </button>
            <Link
              to="/activity"
              className="flex items-center gap-1 text-[11px] text-mint hover:text-mint-bright"
            >
              Open incident center <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
