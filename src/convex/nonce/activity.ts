import { v } from "convex/values";
import { query } from "../_generated/server";
import { getVaultForUser, userIdOrNull } from "./db";
import type { Id } from "../_generated/dataModel";

type FeedKind =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "SECURITY"
  | "RECOVERY"
  | "GUARDIAN"
  | "INCIDENT";

export type ActivityItem = {
  id: string;
  kind: FeedKind;
  title: string;
  description: string;
  timestamp: number;
  status: string;
  tone: "safe" | "warn" | "danger" | "neutral";
  amount?: string;
  symbol?: string;
  incidentId?: Id<"incidents">;
  withdrawalId?: Id<"withdrawalRequests">;
  simulationRef?: string;
  simulated: boolean;
};

export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return [];
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return [];
    const limit = Math.min(args.limit ?? 30, 80);

    const transactions = await ctx.db
      .query("vaultTransactions")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(limit);
    const withdrawals = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(limit);
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(limit);
    const proposals = await ctx.db
      .query("recoveryProposals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);
    const approvals = await ctx.db
      .query("guardianApprovals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);

    const items: ActivityItem[] = [];

    for (const tx of transactions) {
      const tone =
        tx.status === "FAILED"
          ? "danger"
          : tx.status === "LOCKDOWN_CONFIRMED"
            ? "danger"
            : tx.kind === "RECOVERY"
              ? "safe"
              : "neutral";
      items.push({
        id: tx._id,
        kind:
          tx.kind === "WITHDRAWAL"
            ? "WITHDRAWAL"
            : tx.kind === "DEPOSIT"
              ? "DEPOSIT"
              : tx.kind === "RECOVERY"
                ? "RECOVERY"
                : "SECURITY",
        title:
          tx.kind === "WITHDRAWAL"
            ? "Withdrawal"
            : tx.kind === "DEPOSIT"
              ? "Sandbox deposit"
              : tx.kind === "RECOVERY"
                ? "Guardian recovery"
                : tx.status === "LOCKDOWN_CONFIRMED"
                  ? "Vault locked down"
                  : "Security event",
        description: tx.description,
        timestamp: tx.createdAt,
        status: tx.status.replace(/_/g, " "),
        tone,
        amount: tx.amount,
        symbol: tx.symbol,
        incidentId: tx.incidentId,
        simulationRef: tx.simulationRef,
        simulated: tx.source === "SIMULATED",
      });
    }

    for (const request of withdrawals) {
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(request.status)) {
        items.push({
          id: `w-${request._id}`,
          kind: "WITHDRAWAL",
          title:
            request.status === "CANCELLED"
              ? "Withdrawal cancelled"
              : "Withdrawal failed",
          description:
            request.cancelReason ?? "The withdrawal did not complete.",
          timestamp: request.finalizedAt ?? request.createdAt,
          status: request.status.toLowerCase(),
          tone: request.status === "FAILED" ? "danger" : "neutral",
          amount: request.amount,
          symbol: request.symbol,
          withdrawalId: request._id,
          simulationRef: request.simulationRef,
          simulated: true,
        });
        continue;
      }
      items.push({
        id: `w-${request._id}`,
        kind: "WITHDRAWAL",
        title:
          request.status === "AWAITING_GUARDIANS"
            ? "Withdrawal awaiting guardians"
            : request.status === "READY"
              ? "Withdrawal ready to release"
              : "Withdrawal held under guard",
        description: request.reason,
        timestamp: request.createdAt,
        status: request.status.replace(/_/g, " ").toLowerCase(),
        tone: "warn",
        amount: request.amount,
        symbol: request.symbol,
        withdrawalId: request._id,
        simulationRef: request.simulationRef,
        simulated: true,
      });
    }

    for (const incident of incidents) {
      const tone =
        incident.riskLevel === "HIGH"
          ? "danger"
          : incident.riskLevel === "MEDIUM"
            ? "warn"
            : "neutral";
      items.push({
        id: `i-${incident._id}`,
        kind: "INCIDENT",
        title: incident.title,
        description: incident.responseStatus,
        timestamp: incident.detectedAt,
        status: incident.status.replace(/_/g, " ").toLowerCase(),
        tone: incident.status === "RESOLVED" ? "safe" : tone,
        incidentId: incident._id,
        simulated: true,
      });
    }

    for (const proposal of proposals) {
      items.push({
        id: `r-${proposal._id}`,
        kind: "RECOVERY",
        title: `Recovery ${proposal.reference}`,
        description: `Replace ${proposal.replacedAddress.slice(0, 6)}… with ${proposal.replacementAddress.slice(0, 6)}… · ${proposal.approvalsCount}/${proposal.threshold} guardian approvals`,
        timestamp: proposal.completedAt ?? proposal.createdAt,
        status: proposal.status.replace(/_/g, " ").toLowerCase(),
        tone: proposal.status === "COMPLETED" ? "safe" : "warn",
        simulated: true,
      });
    }

    for (const approval of approvals) {
      items.push({
        id: `a-${approval._id}`,
        kind: "GUARDIAN",
        title: "Guardian approval recorded",
        description: `${approval.address.slice(0, 8)}… approved a recovery proposal (${approval.signatureMode.toLowerCase()}).`,
        timestamp: approval.approvedAt,
        status: approval.signatureMode.toLowerCase(),
        tone: "warn",
        simulated: approval.signatureMode === "SIMULATED",
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  },
});

export const securityLog = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return { events: [], health: [] };
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return { events: [], health: [] };
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(60);
    const health = await ctx.db.query("systemHealth").collect();
    const checkpoint = await ctx.db
      .query("monitorCheckpoints")
      .withIndex("by_network", (q) => q.eq("network", vault.network))
      .first();
    return { events, health, checkpoint, mode: vault.mode };
  },
});
