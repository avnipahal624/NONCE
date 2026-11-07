import type { Doc } from "@/convex/_generated/dataModel";
import { useNow } from "@/hooks/use-now";
import { formatDateTime, formatRemaining } from "@/lib/nonce";
import { Timeline, type TimelineStep } from "./Timeline";

/**
 * The timeline is derived from the stored request only. It never advances a
 * stage because a local timer fired; the countdown is display-only and the
 * backend/contract remains the execution authority.
 */
export function WithdrawalTimeline({
  request,
  className,
}: {
  request: Doc<"withdrawalRequests">;
  className?: string;
}) {
  const now = useNow();
  const delayElapsed = now >= request.executeAfter;
  const approvalsMet =
    request.requiredApprovals === 0 || request.approvals.length >= request.requiredApprovals;
  const waiting = ["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status);
  const completed = request.status === "COMPLETED";
  const failed = ["FAILED", "BLOCKED", "CANCELLED"].includes(request.status);
  const executed = completed;

  const steps: TimelineStep[] = [
    {
      key: "submitted",
      title: "Request submitted",
      description: "Owner-authorized request recorded with a destination and amount.",
      timestamp: formatDateTime(request.createdAt),
      state: "complete",
    },
    {
      key: "recorded",
      title: request.txHash ? "Transaction confirmed" : "Recorded in NONCE",
      description: request.txHash
        ? "A confirmed transaction hash is attached to this request."
        : "Sandbox ledger only. No chain transaction exists for this request.",
      timestamp: request.txHash ? `${request.txHash.slice(0, 10)}…` : request.simulationRef,
      state: "complete",
    },
    {
      key: "waiting",
      title: "Waiting period",
      description: delayElapsed
        ? "The minimum delay has elapsed. Execution still requires every other gate."
        : `Unlocks in ${formatRemaining(request.executeAfter, now)}. The frontend timer cannot bypass the stored delay.`,
      timestamp: formatDateTime(request.executeAfter),
      state: delayElapsed || executed ? "complete" : "current",
    },
  ];

  if (request.requiredApprovals > 0) {
    steps.push({
      key: "approvals",
      title: "Guardian approvals",
      description: `${request.approvals.length} of ${request.requiredApprovals} distinct approvals recorded.`,
      state: approvalsMet ? "complete" : waiting ? "current" : "pending",
    });
  }

  if (completed) {
    steps.push({
      key: "completed",
      title: "Completed",
      description: request.txHash
        ? "The withdrawal transaction was confirmed."
        : "The sandbox ledger marked this withdrawal complete. No chain transaction occurred.",
      timestamp: request.finalizedAt ? formatDateTime(request.finalizedAt) : undefined,
      state: "complete",
    });
  } else if (failed) {
    steps.push({
      key: "terminal",
      title:
        request.status === "CANCELLED"
          ? "Cancelled"
          : request.status === "BLOCKED"
            ? "Blocked by vault state"
            : "Failed",
      description:
        request.cancelReason ??
        (request.status === "BLOCKED"
          ? "A lockdown or recovery invalidated this request before execution."
          : "The request did not execute."),
      timestamp: request.finalizedAt ? formatDateTime(request.finalizedAt) : undefined,
      state: "failed",
    });
  } else {
    steps.push({
      key: "eligible",
      title: request.status === "READY" ? "Ready to execute" : "Eligible for execution",
      description:
        delayElapsed && approvalsMet
          ? "Every stored gate is satisfied. Execution is the next available action."
          : "This stage cannot complete until the delay and any guardian quorum are satisfied.",
      timestamp: request.expiresAt ? `Expires ${formatDateTime(request.expiresAt)}` : undefined,
      state: request.status === "READY" ? "current" : "pending",
    });
  }

  return <Timeline steps={steps} ariaLabel="Withdrawal progress" className={className} />;
}
