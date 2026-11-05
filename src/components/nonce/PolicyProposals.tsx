import { useEffect, useState } from "react";
import { Check, Clock, Loader2, ShieldAlert, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/nonce";

function countdown(target: number, now: number): string {
  const remaining = Math.max(0, target - now);
  if (remaining === 0) return "Timelock elapsed";
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s remaining`;
}

export function PolicyProposals({
  guardians,
  vaultState,
}: {
  guardians: Doc<"guardians">[];
  vaultState: string;
}) {
  const state = useQuery(api.nonce.policy.state);
  const approve = useMutation(api.nonce.policy.approve);
  const execute = useMutation(api.nonce.policy.execute);
  const cancel = useMutation(api.nonce.policy.cancel);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardianId, setGuardianId] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!state || state.proposals.length === 0) return null;

  const pending = state.proposals.find((proposal) => proposal.status === "PENDING");
  const confirmed = guardians.filter((guardian) => guardian.status === "CONFIRMED");
  const frozen = vaultState === "LOCKDOWN" || vaultState === "RECOVERY";
  const approvalsMet = pending
    ? pending.classification !== "WEAKENING" || pending.approvals.length >= 2
    : false;
  const timeMet = pending ? now >= pending.executeAfter : false;
  const canExecute = Boolean(pending && approvalsMet && timeMet && !frozen);
  const isExpired = Boolean(
    pending && now > pending.executeAfter + state.executionWindowMs,
  );

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That policy action did not complete.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-[#E9B45E]/25 bg-[#E9B45E]/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-[#E9B45E]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E9B45E]">
            Pending policy change
          </p>
        </div>
        <StatusPill
          label={pending?.classification === "WEAKENING" ? "Weakening · 2 approvals" : "Timelocked"}
          tone={pending?.classification === "WEAKENING" ? "danger" : "warn"}
        />
      </div>

      {pending && (
        <>
          <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <span className="text-sage">Per transfer</span>
              <span className="text-ivory">{pending.policy.maxPerTransaction} ETH</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-sage">Rolling 24h</span>
              <span className="text-ivory">{pending.policy.rollingLimit} ETH</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-sage">Delay above</span>
              <span className="text-ivory">
                {pending.policy.largeWithdrawalThreshold} ETH
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-sage">Hold duration</span>
              <span className="text-ivory">{pending.policy.delayMinutes} min</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-sage">Guardian approvals</span>
              <span className="text-ivory">
                {pending.classification === "WEAKENING"
                  ? `${pending.approvals.length}/2`
                  : "Not required"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-sage">Executable</span>
              <span className="font-mono text-[10px] text-ivory">
                {formatDateTime(pending.executeAfter)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2 text-[10px] text-sage">
            <Clock className="size-3.5 text-mint" />
            {countdown(pending.executeAfter, now)}
            {isExpired && (
              <span className="text-[#F17676]">
                · expired; cancel and create a new proposal
              </span>
            )}
          </div>

          {pending.classification === "WEAKENING" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={guardianId}
                onChange={(event) => setGuardianId(event.target.value)}
                className="h-9 flex-1 rounded-md border border-hairline bg-[#071310] px-2.5 text-[11px] text-ivory"
              >
                <option value="">Record a guardian approval…</option>
                {confirmed
                  .filter((guardian) => !pending.approvals.includes(guardian._id))
                  .map((guardian) => (
                    <option key={guardian._id} value={guardian._id}>
                      {guardian.label}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                disabled={!guardianId || Boolean(busy) || pending.approvals.length >= 2}
                onClick={() =>
                  guardianId &&
                  run("approve", () =>
                    approve({
                      vaultId: pending.vaultId,
                      proposalId: pending._id,
                      guardianId: guardianId as Doc<"guardians">["_id"],
                    }),
                  )
                }
                className="h-9 rounded-lg border border-hairline bg-transparent px-3 text-[11px] text-ivory hover:border-mint/30"
              >
                {busy === "approve" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="size-3.5" /> Simulate approval
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canExecute || Boolean(busy)}
              onClick={() =>
                run("execute", () =>
                  execute({ vaultId: pending.vaultId, proposalId: pending._id }),
                )
              }
              className="h-8 rounded-lg bg-mint px-3 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
            >
              {busy === "execute" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : approvalsMet ? (
                "Execute policy change"
              ) : (
                "Approval missing"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy) || frozen}
              onClick={() =>
                run("cancel", () =>
                  cancel({ vaultId: pending.vaultId, proposalId: pending._id }),
                )
              }
              className="h-8 rounded-lg border-hairline bg-transparent px-3 text-[11px] text-sage hover:text-ivory"
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-sage/80">
            Guardian approvals shown here are simulated. The testnet contract verifies
            guardian signatures on-chain. A weakening change cannot execute without
            quorum, even if the owner presses execute.
          </p>
        </>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[10px] leading-5 text-[#F17676]">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {state.proposals
          .filter((proposal) => proposal.status !== "PENDING")
          .slice(0, 3)
          .map((proposal) => (
            <div
              key={proposal._id}
              className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-sage"
            >
              <span>
                {formatDateTime(proposal.createdAt)} ·{" "}
                {proposal.classification.toLowerCase()} policy
              </span>
              <span className="uppercase tracking-[0.12em]">{proposal.status}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
