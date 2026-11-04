import { useState } from "react";
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
import { AppShell } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { formatDateTime, incidentLabel, timeAgo, vaultStateCopy } from "@/lib/nonce";
import { generateSandboxAddress, isValidAddress } from "@/lib/wallet";

export default function Recovery() {
  const { workspace } = useWorkspace();
  const data = useQuery(api.nonce.recovery.list);
  const addGuardian = useMutation(api.nonce.guardians.add);
  const confirmGuardian = useMutation(api.nonce.guardians.confirm);
  const removeGuardian = useMutation(api.nonce.guardians.remove);
  const createProposal = useMutation(api.nonce.recovery.createProposal);
  const approve = useMutation(api.nonce.recovery.simulateGuardianApproval);
  const execute = useMutation(api.nonce.recovery.execute);
  const reject = useMutation(api.nonce.recovery.reject);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [newGuardian, setNewGuardian] = useState({ label: "", address: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [confirmExecute, setConfirmExecute] = useState(false);

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
    Date.now() >= activeProposal.executeAfter;

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
      await createProposal({ vaultId: vault._id, replacementAddress: replacement.trim() });
      setReplacement("");
    }, "Recovery proposal created. Two guardian approvals and the delay are required.");

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Recovery"
          title="Replace the key, keep the ownership"
          description="Guardian recovery exists for compromise and for loss. It never bypasses the delay, and it never gives guardians custody of your assets."
          actions={
            <>
              <StatusPill label={state.label} tone={state.tone} />
              <StatusPill label="2 of 3 required" tone="neutral" />
              <StatusPill label={`${data.recoveryDelayMinutes} min delay`} tone="warn" />
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

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Recovery process</SectionLabel>
                <span className="text-[10px] text-sage">Four gates, all required</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {[
                  { icon: Lock, label: "Confirmed lockdown", detail: "Recovery starts only from LOCKDOWN or RECOVERY." },
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

              {!locked && !activeProposal && (
                <div className="px-5 py-4">
                  <p className="rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3 text-[11px] leading-5 text-sage">
                    No confirmed lockdown is active, so there is nothing to recover. Guardian recovery
                    is intentionally unavailable from a normal vault — a review action cannot unlock it
                    either.
                  </p>
                  <p className="mt-3 text-[10px] leading-5 text-sage">
                    To exercise the full path in this sandbox, produce a high-risk decoy signal from
                    Protection and wait for the lockdown to confirm.
                  </p>
                </div>
              )}

              {locked && !activeProposal && (
                <div className="border-b border-hairline/50 px-5 py-4">
                  <p className="text-[11px] leading-5 text-sage">
                    The vault is {state.label.toLowerCase()}. Name a replacement signer you control. The
                    compromised signer is not needed and will be revoked.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
                    disabled={Boolean(busy) || replacement.trim().length === 0}
                    className="mt-2 h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                  >
                    {busy === "propose" ? <Loader2 className="size-3.5 animate-spin" /> : "Start recovery proposal"}
                  </Button>
                </div>
              )}

              {activeProposal && (
                <div className="border-b border-hairline/50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-sage">{activeProposal.reference}</span>
                      <StatusPill
                        label={incidentLabel(activeProposal.status)}
                        tone={activeProposal.status === "APPROVED" ? "safe" : "warn"}
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

                  <div className="mt-3 flex flex-wrap gap-1.5">
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
                    {Date.now() < activeProposal.executeAfter
                      ? " The delay has not elapsed yet."
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

                    {showReject ? (
                      <div className="flex flex-1 flex-col gap-1.5 sm:flex-row">
                        <Input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Reason for rejection"
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
                              "Proposal rejected. The vault stays locked.",
                            )
                          }
                          disabled={Boolean(busy) || rejectReason.trim().length < 4}
                          variant="outline"
                          className="h-9 rounded-lg border-[#F17676]/30 bg-transparent text-[10px] text-[#F17676] hover:bg-[#F17676]/10 disabled:opacity-40"
                        >
                          Save rejection
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="text-[10px] text-sage hover:text-ivory"
                      >
                        Reject proposal
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
                satisfy a real signature requirement.
              </p>
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
