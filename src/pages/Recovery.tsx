import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRemaining, incidentLabel, timeAgo, vaultStateCopy } from "@/lib/nonce";
import { generateSandboxAddress, isValidAddress } from "@/lib/wallet";

export default function Recovery() {
  const { workspace } = useWorkspace();
  const data = useQuery(api.nonce.recovery.list);
  const addGuardian = useMutation(api.nonce.guardians.add);
  const confirmGuardian = useMutation(api.nonce.guardians.confirm);
  const removeGuardian = useMutation(api.nonce.guardians.remove);
  const createProposal = useMutation(api.nonce.recovery.createProposal);
  const proposeAsGuardian = useMutation(api.nonce.recovery.proposeAsGuardian);
  const approve = useMutation(api.nonce.recovery.simulateGuardianApproval);
  const execute = useMutation(api.nonce.recovery.execute);
  const reject = useMutation(api.nonce.recovery.reject);
  const cancelProposal = useMutation(api.nonce.recovery.cancel);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [proposerGuardianId, setProposerGuardianId] = useState("");
  const [initiationMode, setInitiationMode] = useState<"GUARDIAN" | "OWNER">("GUARDIAN");
  const [newGuardian, setNewGuardian] = useState({ label: "", address: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const now = useNow();

  if (!workspace?.vault) {
    return (
      <AppShell>
        <EmptyState
          icon={<Users className="size-4" />}
          title="No vault to recover"
          description="Create a sandbox vault and add three guardians before recovery can be configured or tested."
          className="mt-10"
        />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-mint" />
        </div>
      </AppShell>
    );
  }

  const { vault } = workspace;
  const state = vaultStateCopy(data.vaultState);
  const locked = data.vaultState === "LOCKDOWN" || data.vaultState === "RECOVERY";
  const activeProposal = data.proposals.find((proposal) =>
    ["AWAITING_GUARDIANS", "APPROVED", "EXECUTING"].includes(proposal.status),
  );
  const confirmedGuardians = data.guardians.filter((guardian) => guardian.status === "CONFIRMED");
  const activeGuardians = data.guardians.filter((guardian) => guardian.status !== "REMOVED");
  const canExecute =
    activeProposal &&
    activeProposal.approvalsCount >= activeProposal.threshold &&
    now >= activeProposal.executeAfter;

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

  const handleAddGuardian = () =>
    run("add-guardian", async () => {
      if (newGuardian.label.trim().length < 2) throw new Error("Give the guardian a label.");
      if (!isValidAddress(newGuardian.address)) throw new Error("Enter a valid guardian address.");
      const guardianId = await addGuardian({
        vaultId: vault._id,
        label: newGuardian.label.trim(),
        address: newGuardian.address.trim(),
      });
      await confirmGuardian({ vaultId: vault._id, guardianId });
      setNewGuardian({ label: "", address: "" });
      setShowAdd(false);
    }, "Guardian added with a simulated confirmation.");

  const handleCreateProposal = () =>
    run("propose", async () => {
      if (!isValidAddress(replacement)) throw new Error("Enter a valid replacement signer address.");
      if (initiationMode === "GUARDIAN") {
        if (!proposerGuardianId) throw new Error("Choose the guardian opening recovery.");
        await proposeAsGuardian({
          vaultId: vault._id,
          guardianId: proposerGuardianId as Doc<"guardians">["_id"],
          replacementAddress: replacement.trim(),
        });
      } else {
        await createProposal({ vaultId: vault._id, replacementAddress: replacement.trim() });
      }
      setReplacement("");
      setProposerGuardianId("");
    }, "Recovery proposal created. Two guardian approvals and the delay are required.");

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Guardian recovery"
          title="Replace the signer without giving guardians custody"
          description="A recovery request freezes withdrawals, requires two distinct guardian approvals and a delay, and only changes the signer. Guardians never receive the vault balance."
          actions={
            <>
              <StatusPill label={state.label} tone={state.tone} />
              <StatusPill label={`${data.guardianThreshold} of 3 required`} tone="neutral" />
              <StatusPill
                label={data.vaultMode === "DEMO" ? "Sandbox approvals" : "Contract approvals"}
                tone={data.vaultMode === "DEMO" ? "warn" : "safe"}
              />
            </>
          }
        />

        {error && (
          <p role="alert" className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.06] px-4 py-2.5 text-[11px] leading-5 text-[#F17676]">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-mint/20 bg-mint/[0.04] px-4 py-2.5 text-[11px] leading-5 text-mint/90">
            {notice}
          </p>
        )}

        <section
          className={cn(
            "overflow-hidden rounded-2xl border p-5 sm:p-6",
            activeProposal
              ? "border-[#E9B45E]/30 bg-[linear-gradient(135deg,#1a2417_0%,#0b1f17_58%,#0d2119_100%)]"
              : "border-hairline/70 bg-[#0b1f17]/75",
          )}
        >
          <div className="grid gap-5 xl:grid-cols-[1fr_250px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Recovery command</SectionLabel>
                <StatusPill
                  label={activeProposal ? "Approval in progress" : "No active recovery"}
                  tone={activeProposal ? "warn" : "safe"}
                />
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ivory">
                {activeProposal
                  ? `${activeProposal.approvalsCount} of ${activeProposal.threshold} guardians approved`
                  : "Guardian quorum is standing by"}
              </h2>
              <p className="mt-2 max-w-2xl text-[11px] leading-5 text-sage">
                {activeProposal
                  ? "Only confirmed guardian approvals count. The owner cannot bypass the delay, and this screen never signs on behalf of another wallet."
                  : "Open a recovery proposal only when the signer is lost or compromised. The vault stays normal until a proposal actually opens."}
              </p>
              {activeProposal ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Approvals", value: `${activeProposal.approvalsCount} / ${activeProposal.threshold}` },
                      { label: "Delay", value: `${data.recoveryDelayMinutes} min` },
                      {
                        label: "Proposed signer",
                        value: `${activeProposal.replacementAddress.slice(0, 6)}…${activeProposal.replacementAddress.slice(-4)}`,
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-hairline/50 bg-black/15 px-3 py-2.5">
                        <p className="text-[9px] uppercase tracking-[0.14em] text-sage">{item.label}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-ivory">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[9px] text-sage">
                      <span>Guardian quorum</span>
                      <span>Execution window closes {formatDateTime(activeProposal.executeAfter + data.executionWindowMs)}</span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {Array.from({ length: activeProposal.threshold }).map((_, index) => (
                        <span
                          key={index}
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            index < activeProposal.approvalsCount ? "bg-mint" : "bg-white/[0.08]",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href="#approval-actions"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright"
                    >
                      Review approvals <ArrowRight className="size-3.5" />
                    </a>
                    <Link
                      to="/testnet"
                      className="inline-flex h-9 items-center rounded-lg border border-hairline/70 px-3.5 text-[11px] text-sage hover:border-mint/30 hover:text-ivory"
                    >
                      Live guardian wallet path
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/protection"
                    className="inline-flex h-9 items-center rounded-lg border border-hairline/70 px-3.5 text-[11px] text-sage hover:border-mint/30 hover:text-ivory"
                  >
                    Review protection posture
                  </Link>
                  <Link
                    to="/testnet"
                    className="inline-flex h-9 items-center rounded-lg border border-mint/25 bg-mint/[0.05] px-3.5 text-[11px] text-mint hover:bg-mint/10"
                  >
                    Open live recovery console
                  </Link>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
              <p className="text-[9px] uppercase tracking-[0.16em] text-sage">
                {activeProposal ? (canExecute ? "Ready to execute" : "Delay remaining") : "Quorum"}
              </p>
              <p className="mt-2 font-tabular text-2xl font-semibold tracking-tight text-ivory">
                {activeProposal
                  ? canExecute
                    ? "Ready"
                    : formatRemaining(activeProposal.executeAfter, now)
                  : `${confirmedGuardians.length} / 3`}
              </p>
              <p className="mt-1 text-[9px] leading-4 text-sage">
                {activeProposal
                  ? canExecute
                    ? "All stored gates are satisfied. Execution still requires the owner action below."
                    : `The contract delay is authoritative. This countdown is display-only.`
                  : "Confirmed guardians available for a future recovery."}
              </p>
              {data.vaultMode === "DEMO" && (
                <p className="mt-3 rounded-md border border-[#E9B45E]/20 bg-[#E9B45E]/[0.05] px-2.5 py-2 text-[9px] leading-4 text-[#E9B45E]/90">
                  Sandbox guardians have no keys. Approvals on this screen are recorded as SIMULATED.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Recovery process</SectionLabel>
                <span className="text-[10px] text-sage">Four gates, all required</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {[
                  { icon: Lock, label: "Freeze at proposal", detail: "Opening recovery freezes exits immediately." },
                  { icon: KeyRound, label: "New signer", detail: "Name an address that is not the compromised one." },
                  { icon: Users, label: "Two approvals", detail: "Distinct guardians approve the exact proposal." },
                  { icon: Clock, label: "Delay elapsed", detail: "The vault stays locked until execution." },
                ].map((step, index) => (
                  <div key={step.label} className="rounded-lg border border-hairline/60 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <step.icon className="size-3.5 text-mint" />
                      <span className="font-mono text-[9px] text-sage/70">0{index + 1}</span>
                    </div>
                    <p className="mt-2 text-[10px] font-medium text-ivory">{step.label}</p>
                    <p className="mt-1 text-[9px] leading-4 text-sage">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <SectionLabel>Proposals</SectionLabel>
                <span className="text-[10px] text-sage">{data.proposals.length} recorded</span>
              </div>

              {!activeProposal && (
                <div className="border-b border-hairline/50 px-5 py-4">
                  <p className="text-[11px] leading-5 text-sage">
                    {locked
                      ? `The vault is ${state.label.toLowerCase()}. A replacement signer replaces the compromised one; the old signer is revoked and every old withdrawal is invalidated.`
                      : "Open recovery when the signer is lost or compromised. Opening a proposal freezes withdrawals immediately; the old owner key is not required for the guardian path."}
                  </p>
                  <div className="mt-3 flex gap-1.5 rounded-lg border border-hairline/60 bg-black/20 p-1">
                    {(["GUARDIAN", "OWNER"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setInitiationMode(mode)}
                        className={cn(
                          "flex-1 rounded-md px-2 py-1.5 text-[10px]",
                          initiationMode === mode
                            ? "bg-mint/[0.12] text-mint"
                            : "text-sage hover:text-ivory",
                        )}
                      >
                        {mode === "GUARDIAN" ? "Guardian-initiated" : "Owner-initiated"}
                      </button>
                    ))}
                  </div>
                  {initiationMode === "GUARDIAN" && (
                    <select
                      value={proposerGuardianId}
                      onChange={(event) => setProposerGuardianId(event.target.value)}
                      className="mt-2 h-9 w-full rounded-md border border-hairline bg-[#071310] px-2.5 text-[11px] text-ivory"
                    >
                      <option value="">Guardian opening recovery…</option>
                      {confirmedGuardians.map((guardian) => (
                        <option key={guardian._id} value={guardian._id}>
                          {guardian.label} · {guardian.address.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={replacement}
                      onChange={(event) => setReplacement(event.target.value)}
                      placeholder="0x replacement signer"
                      className="h-9 border-hairline bg-black/25 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => setReplacement(generateSandboxAddress())}
                      className="h-9 shrink-0 rounded-md border border-hairline px-3 text-[10px] text-sage hover:text-mint"
                    >
                      Generate sandbox signer
                    </button>
                  </div>
                  <Button
                    onClick={handleCreateProposal}
                    disabled={
                      Boolean(busy) ||
                      replacement.trim().length === 0 ||
                      (initiationMode === "GUARDIAN" && !proposerGuardianId)
                    }
                    className="mt-2 h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                  >
                    {busy === "propose" ? <Loader2 className="size-3.5 animate-spin" /> : "Open recovery proposal"}
                  </Button>
                  <p className="mt-2 text-[9px] leading-4 text-[#E9B45E]">
                    Demo guardian actions are recorded as simulated because sandbox guardians have
                    no keys. On testnet the contract requires real guardian transactions. The owner
                    cannot veto a guardian-initiated proposal; two guardians must cancel it.
                  </p>
                </div>
              )}

              {activeProposal && (
                <div id="approval-actions" className="border-b border-hairline/50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-sage">{activeProposal.reference}</span>
                      <StatusPill
                        label={incidentLabel(activeProposal.status)}
                        tone={activeProposal.status === "APPROVED" ? "safe" : "warn"}
                        className="text-[9px]"
                      />
                      <StatusPill
                        label={
                          (activeProposal.initiatedBy ?? "OWNER") === "OWNER"
                            ? "Owner-initiated"
                            : "Guardian-initiated · simulated"
                        }
                        tone="neutral"
                        className="text-[9px]"
                      />
                    </div>
                    <span className="text-[10px] text-sage">{timeAgo(activeProposal.createdAt)}</span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Compromised signer</p>
                      <Address value={activeProposal.replacedAddress} lead={5} tail={4} className="mt-1" />
                    </div>
                    <div className="rounded-lg border border-mint/25 bg-mint/[0.04] px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-mint/80">Replacement signer</p>
                      <Address value={activeProposal.replacementAddress} lead={5} tail={4} className="mt-1" />
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-sage">
                      <span>Guardian approvals</span>
                      <span>
                        {activeProposal.approvalsCount} of {activeProposal.threshold}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {Array.from({ length: activeProposal.threshold }).map((_, index) => (
                        <span
                          key={index}
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            index < activeProposal.approvalsCount ? "bg-mint" : "bg-white/[0.08]",
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-sage">
                      Guardian approvals
                    </p>
                    <span className="rounded-sm border border-[#E9B45E]/25 bg-[#E9B45E]/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-[#E9B45E]">
                      Sandbox · simulated
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeGuardians
                      .filter((guardian) => guardian.status === "CONFIRMED")
                      .map((guardian) => {
                        const approved = activeProposal.approvals.some(
                          (approval) => approval.guardianId === guardian._id,
                        );
                        return (
                          <button
                            key={guardian._id}
                            type="button"
                            disabled={approved || Boolean(busy) || activeProposal.status !== "AWAITING_GUARDIANS"}
                            onClick={() =>
                              void run(
                                `approve-${guardian._id}`,
                                async () => {
                                  await approve({
                                    vaultId: vault._id,
                                    proposalId: activeProposal._id,
                                    guardianId: guardian._id,
                                  });
                                },
                                "Simulated guardian approval recorded.",
                              )
                            }
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px]",
                              approved
                                ? "border-mint/30 bg-mint/[0.07] text-mint"
                                : "border-hairline text-sage hover:border-mint/25 hover:text-ivory",
                              "disabled:cursor-not-allowed",
                            )}
                          >
                            {busy === `approve-${guardian._id}` ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : approved ? (
                              <Check className="size-3" />
                            ) : (
                              <Plus className="size-3" />
                            )}
                            {guardian.label}
                          </button>
                        );
                      })}
                  </div>

                  {activeProposal.approvals.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {activeProposal.approvals.map((approval) => (
                        <li key={approval._id} className="flex flex-wrap items-center gap-2 text-[9px] text-sage">
                          <Address value={approval.address} lead={4} tail={4} className="text-[9px]" />
                          <span>{approval.signatureMode.toLowerCase()}</span>
                          <span>{formatDateTime(approval.approvedAt)}</span>
                          <span className="font-mono">{approval.messageHash.slice(0, 10)}…</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5 text-[10px] leading-5 text-sage">
                    Execution is available after {formatDateTime(activeProposal.executeAfter)}.
                    {now < activeProposal.executeAfter
                      ? ` The delay has not elapsed; ${formatRemaining(activeProposal.executeAfter, now)} remains.`
                      : activeProposal.approvalsCount < activeProposal.threshold
                        ? " The delay has elapsed; two guardian approvals are still required."
                        : " The delay has elapsed and the approval threshold is met."}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {confirmExecute ? (
                      <>
                        <Button
                          onClick={() =>
                            void run(
                              "execute",
                              async () => {
                                await execute({ vaultId: vault._id, proposalId: activeProposal._id });
                                setConfirmExecute(false);
                              },
                              "Recovery executed. The compromised signer was revoked and the vault is restored.",
                            )
                          }
                          disabled={Boolean(busy) || !canExecute}
                          className="h-9 rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                        >
                          {busy === "execute" ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm execution"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setConfirmExecute(false)}
                          className="text-[10px] text-sage hover:text-ivory"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <Button
                        onClick={() => setConfirmExecute(true)}
                        disabled={!canExecute || Boolean(busy)}
                        className="h-9 rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                      >
                        <ArrowRight className="size-3.5" /> Execute recovery
                      </Button>
                    )}

                    {(activeProposal.initiatedBy ?? "OWNER") === "GUARDIAN_SIMULATED" ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <span className="text-[10px] text-sage">
                          Guardian cancellation {(activeProposal.cancelApprovals ?? []).length}/2
                        </span>
                        {confirmedGuardians
                          .filter(
                            (guardian) =>
                              !(activeProposal.cancelApprovals ?? []).includes(
                                guardian._id,
                              ),
                          )
                          .map((guardian) => (
                            <button
                              key={guardian._id}
                              type="button"
                              onClick={() =>
                                void run(
                                  `cancel-${guardian._id}`,
                                  async () => {
                                    await cancelProposal({
                                      vaultId: vault._id,
                                      proposalId: activeProposal._id,
                                      guardianId: guardian._id,
                                    });
                                  },
                                  "Guardian cancellation vote recorded.",
                                )
                              }
                              disabled={Boolean(busy)}
                              className="rounded-md border border-[#F17676]/30 px-2.5 py-1.5 text-[10px] text-[#F17676] hover:bg-[#F17676]/10 disabled:opacity-40"
                            >
                              {guardian.label} cancels
                            </button>
                          ))}
                      </div>
                    ) : showReject ? (
                      <div className="flex flex-1 flex-col gap-1.5 sm:flex-row">
                        <Input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Reason for cancellation"
                          className="h-9 border-hairline bg-black/25 text-[11px]"
                        />
                        <Button
                          onClick={() =>
                            void run(
                              "reject",
                              async () => {
                                await reject({
                                  vaultId: vault._id,
                                  proposalId: activeProposal._id,
                                  reason: rejectReason.trim(),
                                });
                                setShowReject(false);
                                setRejectReason("");
                              },
                              "Owner-initiated proposal cancelled; the previous vault state was restored.",
                            )
                          }
                          disabled={Boolean(busy) || rejectReason.trim().length < 4}
                          variant="outline"
                          className="h-9 rounded-lg border-[#F17676]/30 bg-transparent text-[10px] text-[#F17676] hover:bg-[#F17676]/10 disabled:opacity-40"
                        >
                          Save cancellation
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="text-[10px] text-sage hover:text-ivory"
                      >
                        Cancel owner proposal
                      </button>
                    )}
                  </div>
                  {!canExecute && activeProposal.approvalsCount < activeProposal.threshold && (
                    <p className="mt-2 text-[10px] text-[#E9B45E]">
                      Two distinct guardian approvals are required before execution.
                    </p>
                  )}
                </div>
              )}

              {data.proposals.filter((proposal) => proposal.status !== activeProposal?.status || proposal._id !== activeProposal?._id).length > 0 && (
                <ul className="divide-y divide-hairline/40">
                  {data.proposals
                    .filter((proposal) => proposal._id !== activeProposal?._id)
                    .map((proposal) => (
                      <li key={proposal._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <div>
                          <p className="font-mono text-[10px] text-sage">{proposal.reference}</p>
                          <p className="mt-0.5 text-[10px] text-sage">
                            {timeAgo(proposal.createdAt)} · {proposal.approvalsCount}/{proposal.threshold} approvals
                          </p>
                        </div>
                        <StatusPill label={incidentLabel(proposal.status)} tone={proposal.status === "COMPLETED" ? "safe" : proposal.status === "REJECTED" ? "danger" : "neutral"} className="text-[9px]" />
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Guardians</SectionLabel>
                <span className="text-[10px] text-sage">{activeGuardians.length} of 3</span>
              </div>
              <ul className="mt-3 space-y-2">
                {data.guardians.map((guardian) => (
                  <li key={guardian._id} className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-ivory">{guardian.label}</span>
                      <StatusPill
                        label={guardian.status === "CONFIRMED" ? "Confirmed" : "Invited"}
                        tone={guardian.status === "CONFIRMED" ? "safe" : "warn"}
                        className="text-[9px]"
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <Address value={guardian.address} lead={5} tail={4} className="text-[10px]" />
                      <span className="text-[9px] uppercase tracking-wider text-sage">
                        {guardian.approvalMode.toLowerCase()}
                      </span>
                    </div>
                    {!locked && (
                      <div className="mt-1.5 flex gap-3">
                        {guardian.status !== "CONFIRMED" && (
                          <button
                            type="button"
                            onClick={() =>
                              void run(`confirm-${guardian._id}`, async () => {
                                await confirmGuardian({ vaultId: vault._id, guardianId: guardian._id });
                              })
                            }
                            disabled={Boolean(busy)}
                            className="text-[9px] text-mint hover:text-mint-bright"
                          >
                            Confirm (simulated)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void run(`remove-${guardian._id}`, async () => {
                              await removeGuardian({ vaultId: vault._id, guardianId: guardian._id });
                            })
                          }
                          disabled={Boolean(busy)}
                          className="text-[9px] text-sage hover:text-[#F17676]"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {data.guardians.length === 0 && (
                  <li className="rounded-lg border border-dashed border-hairline/70 px-3 py-4 text-center text-[10px] text-sage">
                    No guardians yet.
                  </li>
                )}
              </ul>

              {!locked && activeGuardians.length < 3 && (
                <>
                  {showAdd ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-hairline/70 bg-black/20 p-3">
                      <Input
                        value={newGuardian.label}
                        onChange={(event) => setNewGuardian({ ...newGuardian, label: event.target.value })}
                        placeholder="Guardian label"
                        className="h-8 border-hairline bg-black/25 text-[11px]"
                      />
                      <div className="flex gap-2">
                        <Input
                          value={newGuardian.address}
                          onChange={(event) => setNewGuardian({ ...newGuardian, address: event.target.value })}
                          placeholder="0x guardian address"
                          className="h-8 border-hairline bg-black/25 font-mono text-[10px]"
                        />
                        <button
                          type="button"
                          onClick={() => setNewGuardian({ ...newGuardian, address: generateSandboxAddress() })}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline text-sage hover:text-mint"
                          aria-label="Generate sandbox guardian address"
                        >
                          <KeyRound className="size-3" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddGuardian}
                          disabled={Boolean(busy)}
                          className="h-8 rounded-md bg-mint px-3 text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright"
                        >
                          {busy === "add-guardian" ? <Loader2 className="size-3 animate-spin" /> : "Add guardian"}
                        </Button>
                        <button type="button" onClick={() => setShowAdd(false)} className="text-[10px] text-sage">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline/80 py-2 text-[10px] text-sage hover:border-mint/30 hover:text-mint"
                    >
                      <Plus className="size-3" /> Add guardian
                    </button>
                  )}
                </>
              )}

              <p className="mt-3 text-[10px] leading-5 text-sage">
                Sandbox guardians have no keys. Their approval is recorded as SIMULATED and cannot
                satisfy a real signature requirement. On testnet, each guardian must connect their
                own wallet in the Testnet Console; NONCE never impersonates a guardian. Guardian set
                edits are initial-setup only; after funding, rotation must go through the contract's
                timelocked 2-of-3 process.
              </p>
              <Link
                to="/testnet"
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-mint hover:text-mint-bright"
              >
                Open guardian wallet path <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/60 p-5">
              <div className="flex items-center gap-2 text-[#E9B45E]">
                <AlertTriangle className="size-3.5" />
                <p className="text-[10px] uppercase tracking-[0.16em]">Residual risk</p>
              </div>
              <ul className="mt-2 space-y-1.5 text-[10px] leading-5 text-sage">
                <li>Two compromised guardians can approve a hostile replacement.</li>
                <li>A guardian who cannot be reached reduces the practical threshold.</li>
                <li>Recovery fixes the signer; it does not reverse a completed transfer.</li>
                <li>Anyone holding the new signer's key inherits control.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/60 p-5">
              <div className="flex items-center gap-2 text-mint">
                <ShieldCheck className="size-3.5" />
                <p className="text-[10px] uppercase tracking-[0.16em]">Owner signer</p>
              </div>
              <div className="mt-2">
                <Address value={data.ownerSigner} lead={8} tail={6} />
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">
                {confirmedGuardians.length} confirmed guardians protect this signer. Approval messages
                are bound to the proposal nonce so they cannot be replayed elsewhere.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
