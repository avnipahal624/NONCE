import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Check,
  FileWarning,
  Fingerprint,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AppShell } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { Timeline, type TimelineStep } from "@/components/nonce/Timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  explorerTx,
  formatDateTime,
  incidentLabel,
  incidentTone,
  riskTone,
  timeAgo,
  vaultStateCopy,
} from "@/lib/nonce";

export default function IncidentDetail() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const detail = useQuery(api.nonce.incidents.detail, {
    incidentId: incidentId as Id<"incidents">,
  });
  const acknowledge = useMutation(api.nonce.incidents.acknowledge);
  const markFalsePositive = useMutation(api.nonce.incidents.markFalsePositive);
  const requestLockdown = useMutation(api.nonce.monitor.requestManualLockdown);
  const retryLockdown = useMutation(api.nonce.monitor.retryLockdown);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmLockdown, setConfirmLockdown] = useState(false);
  const [falsePositiveOpen, setFalsePositiveOpen] = useState(false);
  const [note, setNote] = useState("");

  if (detail === undefined) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-mint" />
        </div>
      </AppShell>
    );
  }

  if (detail === null) {
    return (
      <AppShell>
        <EmptyState
          icon={<FileWarning className="size-4" />}
          title="Incident not found"
          description="This record does not exist on your vault, or you are not signed in to its owner account."
          action={
            <Button onClick={() => navigate("/activity")} variant="outline" className="h-9 rounded-lg border-hairline text-xs">
              <ArrowLeft className="size-3.5" /> Back to activity
            </Button>
          }
        />
      </AppShell>
    );
  }

  const { incident, evidence, signals, assessments, lockdownRequests, recoveryProposal, vaultState } = detail;
  const state = vaultStateCopy(vaultState);
  const latestLockdown = lockdownRequests[0];
  const locked = vaultState === "LOCKDOWN" || vaultState === "RECOVERY";
  const closed = incident.status === "RESOLVED" || incident.status === "FALSE_POSITIVE";
  const reviewedAt = incident.closedAt ?? incident.acknowledgedAt;
  const timelineSteps: TimelineStep[] = [
    {
      key: "detected",
      title: "Suspicious interaction detected",
      description: incident.triggerReason,
      timestamp: formatDateTime(incident.detectedAt),
      state: "complete",
    },
    {
      key: "alert",
      title: "Security alert generated",
      description: `Incident ${incident.reference} recorded with an evidence hash.`,
      timestamp: incident.verifiedAt ? formatDateTime(incident.verifiedAt) : undefined,
      state: "complete",
    },
    {
      key: "response",
      title: "Authorized response requested",
      description: latestLockdown
        ? "A freeze request exists; submission and confirmation are tracked separately."
        : "No freeze request is recorded for this incident.",
      timestamp: latestLockdown ? formatDateTime(latestLockdown.requestedAt) : undefined,
      state: latestLockdown ? "complete" : "pending",
    },
    {
      key: "submitted",
      title: "Freeze transaction submitted",
      description: latestLockdown
        ? `${latestLockdown.mode} path · attempt ${latestLockdown.attempt}`
        : "Nothing has been submitted.",
      timestamp: latestLockdown?.submittedAt
        ? formatDateTime(latestLockdown.submittedAt)
        : undefined,
      state: latestLockdown?.submittedAt
        ? "complete"
        : latestLockdown
          ? "current"
          : "pending",
    },
    {
      key: "confirmed",
      title: "Freeze confirmed on-chain",
      description:
        latestLockdown?.status === "CONFIRMED"
          ? "The vault state is confirmed frozen by the contract evidence."
          : latestLockdown?.status === "FAILED"
            ? latestLockdown.failureReason ?? "The submission failed. The vault is not called frozen."
            : "A submitted transaction is not a confirmed freeze.",
      timestamp: latestLockdown?.confirmedAt
        ? formatDateTime(latestLockdown.confirmedAt)
        : undefined,
      state:
        latestLockdown?.status === "CONFIRMED"
          ? "complete"
          : latestLockdown?.status === "FAILED"
            ? "failed"
            : "pending",
    },
    {
      key: "reviewed",
      title: "Incident reviewed",
      description: reviewedAt
        ? incident.resolutionNote ?? "Acknowledged by the vault owner."
        : "No owner review has been recorded.",
      timestamp: reviewedAt ? formatDateTime(reviewedAt) : undefined,
      state: closed ? "complete" : reviewedAt ? "current" : "pending",
    },
  ];

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
        <Link to="/activity" className="inline-flex items-center gap-1.5 text-[11px] text-sage hover:text-ivory">
          <ArrowLeft className="size-3.5" /> Activity
        </Link>

        <PageHeader
          eyebrow={`Incident ${incident.reference}`}
          title={incident.title}
          description={incident.summary}
          actions={
            <>
              <StatusPill label={incidentLabel(incident.status)} tone={incidentTone(incident.status)} />
              <StatusPill label={`${incident.riskLevel} risk`} tone={riskTone(incident.riskLevel)} />
              <StatusPill label={state.label} tone={state.tone} />
            </>
          }
        />

        <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SectionLabel>Response timeline</SectionLabel>
              <p className="mt-1 text-[10px] text-sage">
                A stage is complete only when the corresponding record or timestamp exists.
              </p>
            </div>
            <StatusPill
              label={latestLockdown ? `Freeze ${latestLockdown.status.toLowerCase()}` : "No freeze request"}
              tone={
                latestLockdown?.status === "CONFIRMED"
                  ? "danger"
                  : latestLockdown?.status === "FAILED"
                    ? "danger"
                    : latestLockdown
                      ? "warn"
                      : "neutral"
              }
            />
          </div>
          <Timeline steps={timelineSteps} className="mt-5" ariaLabel="Incident response progress" />
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <SectionLabel>What was observed</SectionLabel>
              <dl className="mt-3 space-y-3">
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Trigger</dt>
                  <dd className="mt-1 text-[12px] leading-6 text-ivory/90">{incident.triggerReason}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Response status</dt>
                  <dd className="mt-1 text-[12px] leading-6 text-ivory/90">{incident.responseStatus}</dd>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Detected</dt>
                    <dd className="mt-1 text-[11px] text-ivory/85">{formatDateTime(incident.detectedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Verified</dt>
                    <dd className="mt-1 text-[11px] text-ivory/85">
                      {incident.verifiedAt ? formatDateTime(incident.verifiedAt) : "Not verified yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Affected decoy</dt>
                    <dd className="mt-1 text-[11px] text-ivory/85">
                      {detail.decoy ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {detail.decoy.label} <Address value={detail.decoy.address} lead={4} tail={4} />
                        </span>
                      ) : (
                        "None linked"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Detection source</dt>
                    <dd className="mt-1 text-[11px] text-ivory/85">
                      {evidence[0]?.source === "ONCHAIN" ? "On-chain monitor evidence" : "Sandbox monitor evidence"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.16em] text-sage">Evidence hash</dt>
                    <dd className="mt-1 break-all font-mono text-[10px] text-sage">{incident.evidenceHash}</dd>
                  </div>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <SectionLabel>Lockdown attempts</SectionLabel>
                <span className="text-[10px] text-sage">{lockdownRequests.length} attempts</span>
              </div>
              {lockdownRequests.length === 0 ? (
                <p className="px-5 py-5 text-[11px] text-sage">
                  No lockdown was requested for this incident. Detection alone never claims a vault
                  is frozen.
                </p>
              ) : (
                <ul className="divide-y divide-hairline/40">
                  {lockdownRequests.map((request) => (
                    <li key={request._id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-ivory">Attempt {request.attempt}</span>
                          <StatusPill
                            label={request.status}
                            tone={
                              request.status === "CONFIRMED"
                                ? "danger"
                                : request.status === "FAILED"
                                  ? "danger"
                                  : "warn"
                            }
                            className="text-[9px]"
                          />
                          <span className="text-[9px] uppercase tracking-wider text-sage">{request.mode}</span>
                        </div>
                        <span className="font-mono text-[9px] text-sage">{request.simulationRef}</span>
                      </div>
                      <div className="mt-2 grid gap-1 text-[10px] text-sage sm:grid-cols-2">
                        <span>Requested {formatDateTime(request.requestedAt)}</span>
                        <span>Submitted {request.submittedAt ? formatDateTime(request.submittedAt) : "—"}</span>
                        <span>Confirmed {request.confirmedAt ? formatDateTime(request.confirmedAt) : "—"}</span>
                        <span>Failed {request.failedAt ? formatDateTime(request.failedAt) : "—"}</span>
                        {request.latencyMs !== undefined && <span>Latency {request.latencyMs} ms</span>}
                      </div>
                      {request.failureReason && (
                        <p className="mt-2 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[10px] leading-5 text-[#F17676]">
                          {request.failureReason}
                        </p>
                      )}
                      {request.status === "FAILED" && (
                        <Button
                          onClick={() =>
                            void run(
                              "retry",
                              async () => {
                                await retryLockdown({ vaultId: incident.vaultId, incidentId: incident._id });
                              },
                              "Retry submitted. The vault stays unlocked until confirmation is observed.",
                            )
                          }
                          disabled={Boolean(busy)}
                          variant="outline"
                          className="mt-2 h-8 rounded-md border-hairline bg-transparent text-[10px] text-ivory hover:border-mint/30"
                        >
                          {busy === "retry" ? <Loader2 className="size-3 animate-spin" /> : <><RotateCcw className="size-3" /> Retry lockdown</>}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-hairline/50 px-5 py-3">
                <p className="text-[10px] leading-5 text-sage">
                  Submission and confirmation are separate facts. A failed or pending transaction is
                  never displayed as a locked vault.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                <SectionLabel>Evidence</SectionLabel>
                <span className="text-[10px] text-sage">{evidence.length} records</span>
              </div>
              {evidence.length === 0 ? (
                <p className="px-5 py-5 text-[11px] text-sage">No evidence records are attached.</p>
              ) : (
                <ul className="divide-y divide-hairline/40">
                  {evidence.map((entry) => (
                    <li key={entry._id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-ivory">{entry.label}</span>
                        <StatusPill
                          label={`${entry.verificationStatus} · ${entry.source}`}
                          tone={entry.source === "SIMULATED" ? "warn" : "neutral"}
                          className="text-[9px]"
                        />
                      </div>
                      <p className="mt-1 break-all font-mono text-[10px] leading-5 text-sage">
                        {entry.evidenceHash}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-sage/80">
                        <span>Block {entry.blockNumber.toLocaleString()}</span>
                        <span>Log {entry.logIndex}</span>
                        <span>{formatDateTime(entry.observedAt)}</span>
                        {entry.source === "ONCHAIN" && entry.txHash ? (
                          <a
                            href={explorerTx(entry.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-mint underline-offset-4 hover:underline"
                          >
                            Tx {entry.txHash.slice(0, 12)}…
                          </a>
                        ) : (
                          <span>{entry.txHash ? `Tx ${entry.txHash.slice(0, 12)}…` : "No transaction hash"}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <SectionLabel>Assessment</SectionLabel>
              {assessments.length === 0 ? (
                <p className="mt-3 text-[11px] text-sage">
                  No assessment was recorded. The incident was therefore not escalated automatically.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {assessments.map((assessment) => (
                    <li key={assessment._id} className="rounded-lg border border-hairline/60 bg-black/20 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={`${assessment.risk} · score ${assessment.score}`} tone={riskTone(assessment.risk)} className="text-[9px]" />
                        <span className="text-[9px] text-sage">{formatDateTime(assessment.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-6 text-ivory/85">{assessment.rationale}</p>
                      <p className="mt-1 text-[10px] leading-5 text-sage">
                        Automated action: {assessment.automatedAction}
                      </p>
                      {assessment.signalsUsed.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {assessment.signalsUsed.map((signal) => (
                            <span key={signal} className="rounded-sm bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-sage">
                              {signal}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {signals.length > 0 && (
                <div className="mt-4 border-t border-hairline/50 pt-3">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-sage">Signals used</p>
                  <ul className="mt-2 space-y-1.5">
                    {signals.map(({ signal, event }) => (
                      <li key={signal._id} className="flex flex-wrap items-center gap-2 text-[10px] text-sage">
                        <span className="text-ivory/85">{signal.category}</span>
                        <StatusPill label={signal.severity} tone={riskTone(signal.severity)} className="text-[8px]" />
                        <span>{signal.reason}</span>
                        {event?.txHash && <span className="font-mono">{event.txHash.slice(0, 10)}…</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Response authority</SectionLabel>
                <Lock className="size-3.5 text-[#E9B45E]" />
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">
                NONCE records the incident and can request a sandbox response. It cannot sign for
                the monitor, unfreeze the vault, or approve recovery. Those are contract-authorized
                wallet actions.
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex gap-2 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                  <Siren className="mt-0.5 size-3 shrink-0 text-[#E9B45E]" />
                  <p className="text-[9px] leading-4 text-sage">
                    On testnet, only the configured monitor can freeze. A sandbox freeze request is
                    labelled simulated and does not move the live contract.
                  </p>
                </div>
                <div className="flex gap-2 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-mint/70" />
                  <p className="text-[9px] leading-4 text-sage">
                    A confirmed freeze is a contract state. A submitted hash or an acknowledged
                    incident is not enough.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Vault state</SectionLabel>
                <StatusPill label={state.label} tone={state.tone} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-sage">{state.description}</p>

              <div className="mt-3 space-y-2 text-[10px] text-sage">
                <p>Acknowledged: {incident.acknowledgedAt ? timeAgo(incident.acknowledgedAt) : "No"}</p>
                <p>Closed: {incident.closedAt ? formatDateTime(incident.closedAt) : "No"}</p>
                {incident.resolutionNote && <p>Resolution: {incident.resolutionNote}</p>}
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[10px] leading-5 text-[#F17676]">
                  {error}
                </p>
              )}
              {notice && (
                <p className="mt-3 rounded-md border border-mint/20 bg-mint/[0.04] px-3 py-2 text-[10px] leading-5 text-mint/90">{notice}</p>
              )}

              <div className="mt-4 space-y-2">
                {!incident.acknowledgedAt && (
                  <Button
                    onClick={() =>
                      void run(
                        "ack",
                        async () => {
                          await acknowledge({ incidentId: incident._id });
                        },
                        "Incident acknowledged. This does not change the vault state.",
                      )
                    }
                    disabled={Boolean(busy)}
                    variant="outline"
                    className="h-9 w-full rounded-lg border-hairline bg-transparent text-[11px] text-ivory hover:border-mint/30"
                  >
                    {busy === "ack" ? <Loader2 className="size-3.5 animate-spin" /> : <><Check className="size-3.5" /> Acknowledge</>}
                  </Button>
                )}

                {!locked && !closed && (
                  <>
                    {latestLockdown?.status === "CONFIRMED" ? (
                      <p className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2 text-[10px] leading-5 text-sage">
                        A lockdown is already confirmed for this incident.
                      </p>
                    ) : confirmLockdown ? (
                      <div className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.05] p-3">
                        <p className="text-[10px] leading-5 text-[#F17676]">
                          Request a lockdown now? It freezes withdrawals but cannot undo a transfer
                          already confirmed.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            onClick={() =>
                              void run(
                                "lock",
                                async () => {
                                  await requestLockdown({ vaultId: incident.vaultId, incidentId: incident._id });
                                  setConfirmLockdown(false);
                                },
                                "Lockdown requested. Await confirmation before calling the vault locked.",
                              )
                            }
                            disabled={Boolean(busy)}
                            className="h-8 rounded-md bg-[#F17676] px-3 text-[10px] font-semibold text-[#2a0b0b] hover:bg-[#ff8a8a]"
                          >
                            {busy === "lock" ? <Loader2 className="size-3 animate-spin" /> : "Confirm request"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setConfirmLockdown(false)}
                            className="text-[10px] text-sage hover:text-ivory"
                          >
                            Keep waiting
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setConfirmLockdown(true)}
                        variant="outline"
                        className="h-9 w-full rounded-lg border-[#F17676]/25 bg-transparent text-[11px] text-[#F17676] hover:bg-[#F17676]/10"
                      >
                        <Siren className="size-3.5" /> Request manual lockdown
                      </Button>
                    )}

                    {falsePositiveOpen ? (
                      <div className="rounded-lg border border-hairline/70 bg-black/20 p-3">
                        <p className="text-[10px] leading-5 text-sage">
                          Explain why this was not an intrusion. The note is stored with the incident.
                        </p>
                        <Input
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Reason"
                          className="mt-2 h-8 border-hairline bg-black/25 text-[11px]"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            onClick={() =>
                              void run(
                                "false",
                                async () => {
                                  await markFalsePositive({ incidentId: incident._id, note: note.trim() });
                                  setFalsePositiveOpen(false);
                                  setNote("");
                                },
                                "Marked as a false positive with your note.",
                              )
                            }
                            disabled={Boolean(busy) || note.trim().length < 4}
                            className="h-8 rounded-md bg-mint px-3 text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                          >
                            {busy === "false" ? <Loader2 className="size-3 animate-spin" /> : "Save review"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setFalsePositiveOpen(false)}
                            className="text-[10px] text-sage hover:text-ivory"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFalsePositiveOpen(true)}
                        className="w-full rounded-lg border border-hairline px-3 py-2 text-[10px] text-sage hover:border-mint/25 hover:text-ivory"
                      >
                        Review as false positive
                      </button>
                    )}
                  </>
                )}

                {(locked || closed) && (
                  <p className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2 text-[10px] leading-5 text-sage">
                    {locked
                      ? "Review actions cannot release a locked vault. Complete guardian recovery."
                      : "This incident is closed. The audit trail remains available."}
                  </p>
                )}
              </div>
            </div>

            {recoveryProposal && (
              <div className="rounded-2xl border border-[#E9B45E]/25 bg-[#E9B45E]/[0.04] p-5">
                <div className="flex items-center gap-2 text-[#E9B45E]">
                  <ShieldCheck className="size-3.5" />
                  <p className="text-[10px] uppercase tracking-[0.16em]">Linked recovery</p>
                </div>
                <p className="mt-2 font-mono text-[10px] text-sage">{recoveryProposal.reference}</p>
                <p className="mt-1 text-[11px] text-ivory">
                  {recoveryProposal.approvalsCount} of {recoveryProposal.threshold} approvals ·{" "}
                  {incidentLabel(recoveryProposal.status)}
                </p>
                <Link to="/recovery" className="mt-3 inline-flex items-center gap-1 text-[11px] text-[#E9B45E] hover:underline">
                  Open recovery <Lock className="size-3" />
                </Link>
              </div>
            )}

            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/60 p-5">
              <div className="flex items-center gap-2 text-sage">
                <Fingerprint className="size-3.5 text-mint/70" />
                <p className="text-[10px] uppercase tracking-[0.16em]">Evidence limits</p>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">
                Hashes help preserve integrity but are not a legal guarantee. This incident does not
                identify an attacker or prove intent. Sandbox evidence is simulated and carries no
                transaction hash.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-sage">
                <ShieldAlert className="size-3 text-[#E9B45E]" />
                {incident.falsePositive ? "Recorded as a false positive" : "Recorded as a security event"}
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
