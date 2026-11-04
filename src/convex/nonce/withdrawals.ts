import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  audit,
  notify,
  recordVaultTransaction,
  requireVaultOwner,
  userIdOrNull,
  getVaultForUser,
} from "./db";
import {
  GUARDIAN_THRESHOLD,
  compareUnits,
  isValidAddress,
  isZeroAmount,
  normalizeAddress,
  parseUnits,
  simulationRef,
  subtractUnits,
} from "./shared";
import { internal } from "../_generated/api";

const CANCELLABLE: Doc<"withdrawalRequests">["status"][] = [
  "QUEUED",
  "AWAITING_GUARDIANS",
  "READY",
];

async function cancelPendingForVault(
  ctx: Parameters<typeof recordVaultTransaction>[0],
  vaultId: Id<"vaults">,
  reason: string,
): Promise<number> {
  const pending = await ctx.db
    .query("withdrawalRequests")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
  let cancelled = 0;
  for (const request of pending) {
    if (!CANCELLABLE.includes(request.status)) continue;
    await ctx.db.patch(request._id, {
      status: "CANCELLED",
      cancelReason: reason,
      finalizedAt: Date.now(),
    });
    cancelled += 1;
  }
  return cancelled;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return [];
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return [];
    return await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(40);
  },
});

export const updatePolicy = mutation({
  args: {
    vaultId: v.id("vaults"),
    maxPerTransaction: v.string(),
    delayMinutes: v.number(),
    largeWithdrawalThreshold: v.string(),
    guardianApprovalRequired: v.boolean(),
    guardianThreshold: v.number(),
    allowlistOnly: v.boolean(),
    allowlist: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error(
        "Withdrawal policy is frozen during lockdown. Policies can only be changed after recovery.",
      );
    }
    if (isZeroAmount(args.maxPerTransaction, 18)) {
      throw new Error("The per-transaction limit must be greater than zero.");
    }
    if (compareUnits(args.largeWithdrawalThreshold, args.maxPerTransaction, 18) > 0) {
      throw new Error(
        "The large-withdrawal threshold cannot be higher than the per-transaction limit.",
      );
    }
    if (!Number.isInteger(args.delayMinutes) || args.delayMinutes < 1) {
      throw new Error("The security delay must be at least one minute.");
    }
    if (args.delayMinutes > 1440) {
      throw new Error("The security delay cannot exceed 24 hours.");
    }
    if (args.guardianThreshold < GUARDIAN_THRESHOLD || args.guardianThreshold > 3) {
      throw new Error("Guardian approvals must be at least 2 of 3.");
    }
    const allowlist = args.allowlist.map((entry) => {
      if (!isValidAddress(entry)) {
        throw new Error(`"${entry}" is not a valid allowlist address.`);
      }
      return normalizeAddress(entry);
    });
    if (args.allowlistOnly && allowlist.length === 0) {
      throw new Error("Add at least one recipient before restricting withdrawals to an allowlist.");
    }
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) throw new Error("Withdrawal policy missing.");
    await ctx.db.patch(policy._id, {
      maxPerTransaction: args.maxPerTransaction,
      delayMinutes: args.delayMinutes,
      largeWithdrawalThreshold: args.largeWithdrawalThreshold,
      guardianApprovalRequired: args.guardianApprovalRequired,
      guardianThreshold: args.guardianThreshold,
      allowlistOnly: args.allowlistOnly,
      allowlist: Array.from(new Set(allowlist)).slice(0, 20),
      updatedAt: Date.now(),
      updatedBy: vault.ownerSigner,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "WITHDRAWAL_POLICY_UPDATED",
      detail: `Limit ${args.maxPerTransaction} ETH, delay ${args.delayMinutes}m above ${args.largeWithdrawalThreshold} ETH, guardian threshold ${args.guardianThreshold}.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "policy_changed",
      title: "Withdrawal protection updated",
      body: `Delays of ${args.delayMinutes} minutes now apply above ${args.largeWithdrawalThreshold} ETH.`,
      severity: "WARNING",
    });
  },
});

export const request = mutation({
  args: {
    vaultId: v.id("vaults"),
    assetId: v.id("vaultAssets"),
    amount: v.string(),
    destination: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "WITHDRAWAL_REJECTED_LOCKDOWN",
        detail: `Withdrawal of ${args.amount} blocked because the vault is in ${vault.state}.`,
      });
      throw new Error(
        "The vault is locked down. Ordinary withdrawals are blocked until guardian recovery completes.",
      );
    }
    if (!isValidAddress(args.destination)) {
      throw new Error("Enter a valid destination address.");
    }
    const destination = normalizeAddress(args.destination);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.vaultId !== vault._id) {
      throw new Error("Asset not found on this vault.");
    }
    if (!asset.supported) {
      throw new Error("This asset is not supported by the vault.");
    }
    if (isZeroAmount(args.amount, asset.decimals)) {
      throw new Error("Enter an amount greater than zero.");
    }
    if (compareUnits(args.amount, asset.balance, asset.decimals) > 0) {
      throw new Error("The requested amount exceeds the verified vault balance.");
    }
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) throw new Error("Withdrawal policy missing.");

    if (compareUnits(args.amount, policy.maxPerTransaction, 18) > 0) {
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "WITHDRAWAL_REJECTED_LIMIT",
        detail: `${args.amount} ${asset.symbol} exceeded the ${policy.maxPerTransaction} ETH per-transaction limit.`,
      });
      throw new Error(
        `This amount exceeds your ${policy.maxPerTransaction} ETH per-transaction limit. Lower the amount or update the policy.`,
      );
    }
    if (policy.allowlistOnly && !policy.allowlist.includes(destination)) {
      throw new Error(
        "Recipient is not on your withdrawal allowlist. Update the policy first.",
      );
    }

    const requiresGuardians =
      policy.guardianApprovalRequired &&
      compareUnits(args.amount, policy.largeWithdrawalThreshold, 18) >= 0;
    const requiresDelay =
      compareUnits(args.amount, policy.largeWithdrawalThreshold, 18) >= 0;
    const requiredApprovals = requiresGuardians ? policy.guardianThreshold : 0;
    const now = Date.now();
    const executeAfter = requiresDelay
      ? now + policy.delayMinutes * 60 * 1000
      : now;
    const ref = simulationRef("WITHDRAWAL");

    const reason = requiresDelay
      ? `Above ${policy.largeWithdrawalThreshold} ETH: ${policy.delayMinutes}-minute security delay${
          requiresGuardians ? ` and ${requiredApprovals} guardian approvals` : ""
        }.`
      : "Below the large-withdrawal threshold. No delay applies.";

    if (!requiresDelay) {
      const remaining = subtractUnits(asset.balance, args.amount, asset.decimals);
      await ctx.db.patch(asset._id, { balance: remaining });
      const requestId = await ctx.db.insert("withdrawalRequests", {
        vaultId: vault._id,
        userId,
        assetId: asset._id,
        symbol: asset.symbol,
        amount: args.amount,
        destination,
        status: "COMPLETED",
        reason,
        requiredApprovals: 0,
        approvals: [],
        createdAt: now,
        executeAfter: now,
        finalizedAt: now,
        simulationRef: ref,
      });
      await recordVaultTransaction(ctx, {
        vaultId: vault._id,
        kind: "WITHDRAWAL",
        symbol: asset.symbol,
        amount: args.amount,
        status: "SIMULATED",
        description: `Simulated withdrawal to ${destination}. No on-chain transfer occurred.`,
        source: "SIMULATED",
        simulationRef: ref,
      });
      await notify(ctx, {
        userId,
        vaultId: vault._id,
        category: "withdrawal_completed",
        title: "Sandbox withdrawal executed",
        body: `${args.amount} ${asset.symbol} left the demo ledger. This is a simulation, not a chain transaction.`,
        severity: "INFO",
      });
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        actorAddress: vault.ownerSigner,
        action: "WITHDRAWAL_SIMULATED",
        detail: `${args.amount} ${asset.symbol} to ${destination} (${ref}).`,
      });
      return { requestId, status: "COMPLETED" as const, executeAfter };
    }

    const requestId = await ctx.db.insert("withdrawalRequests", {
      vaultId: vault._id,
      userId,
      assetId: asset._id,
      symbol: asset.symbol,
      amount: args.amount,
      destination,
      status: requiresGuardians ? "AWAITING_GUARDIANS" : "QUEUED",
      reason,
      requiredApprovals,
      approvals: [],
      createdAt: now,
      executeAfter,
      simulationRef: ref,
    });
    await ctx.scheduler.runAfter(
      Math.max(executeAfter - now, 0),
      internal.nonce.withdrawals.finalize,
      { requestId },
    );
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "withdrawal_delayed",
      title: "Withdrawal held under guard",
      body: `${args.amount} ${asset.symbol} is queued until ${new Date(executeAfter).toLocaleTimeString()}. You can still cancel it during the delay.`,
      severity: "WARNING",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "WITHDRAWAL_QUEUED",
      detail: `${args.amount} ${asset.symbol} to ${destination}, executes after ${new Date(executeAfter).toISOString()}.`,
    });
    return { requestId, status: requiresGuardians ? ("AWAITING_GUARDIANS" as const) : ("QUEUED" as const), executeAfter };
  },
});

export const cancel = mutation({
  args: { vaultId: v.id("vaults"), requestId: v.id("withdrawalRequests") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.vaultId !== vault._id) {
      throw new Error("Withdrawal not found on this vault.");
    }
    if (!CANCELLABLE.includes(request.status)) {
      throw new Error(`This withdrawal is already ${request.status.toLowerCase()}.`);
    }
    await ctx.db.patch(request._id, {
      status: "CANCELLED",
      cancelReason: "Cancelled by vault owner before execution.",
      finalizedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "WITHDRAWAL_CANCELLED",
      detail: `Queued withdrawal ${request._id} of ${request.amount} ${request.symbol} cancelled.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "withdrawal_cancelled",
      title: "Withdrawal cancelled",
      body: `${request.amount} ${request.symbol} will stay in the vault.`,
      severity: "INFO",
    });
  },
});

/** Sandbox-only guardian approval. Labelled SIMULATED in the approval record. */
export const simulateGuardianApproval = mutation({
  args: {
    vaultId: v.id("vaults"),
    requestId: v.id("withdrawalRequests"),
    guardianId: v.id("guardians"),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Guardian approvals must be signed by the guardian wallet in live mode. That integration is not enabled.",
      );
    }
    const request = await ctx.db.get(args.requestId);
    if (!request || request.vaultId !== vault._id) {
      throw new Error("Withdrawal not found on this vault.");
    }
    if (request.status !== "AWAITING_GUARDIANS" && request.status !== "QUEUED") {
      throw new Error("This withdrawal is not awaiting approvals.");
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id || guardian.status !== "CONFIRMED") {
      throw new Error("Only confirmed guardians can approve this withdrawal.");
    }
    if (request.approvals.includes(guardian.address)) {
      throw new Error("This guardian has already approved. Duplicate approvals are ignored.");
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Approvals cannot unlock a withdrawal during lockdown.");
    }
    const approvals = [...request.approvals, guardian.address];
    const ready = approvals.length >= request.requiredApprovals;
    await ctx.db.patch(request._id, {
      approvals,
      status: ready ? "READY" : "AWAITING_GUARDIANS",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: guardian.address,
      action: "WITHDRAWAL_GUARDIAN_APPROVAL_SIMULATED",
      detail: `${guardian.label} approval recorded in sandbox mode (${approvals.length}/${request.requiredApprovals}).`,
    });
    if (ready) {
      const remaining = request.executeAfter - Date.now();
      if (remaining <= 0) {
        await ctx.scheduler.runAfter(0, internal.nonce.withdrawals.finalize, {
          requestId: request._id,
        });
      }
    }
    return { approvals: approvals.length, required: request.requiredApprovals };
  },
});

export const finalize = internalMutation({
  args: { requestId: v.id("withdrawalRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return;
    if (request.status === "COMPLETED" || request.status === "CANCELLED" || request.status === "BLOCKED") {
      return;
    }
    const vault = await ctx.db.get(request.vaultId);
    if (!vault) return;
    const now = Date.now();

    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      await ctx.db.patch(request._id, {
        status: "BLOCKED",
        cancelReason: `Blocked by vault ${vault.state.toLowerCase()} state.`,
        finalizedAt: now,
      });
      await notify(ctx, {
        userId: request.userId,
        vaultId: vault._id,
        category: "withdrawal_cancelled",
        title: "Withdrawal blocked by lockdown",
        body: `${request.amount} ${request.symbol} was not released.`,
        severity: "CRITICAL",
      });
      await audit(ctx, {
        userId: request.userId,
        vaultId: vault._id,
        action: "WITHDRAWAL_BLOCKED_LOCKDOWN",
        detail: `Queued withdrawal ${request._id} blocked by ${vault.state}.`,
      });
      return;
    }

    if (now < request.executeAfter) {
      await ctx.scheduler.runAfter(
        request.executeAfter - now,
        internal.nonce.withdrawals.finalize,
        { requestId: request._id },
      );
      return;
    }

    if (request.approvals.length < request.requiredApprovals) {
      if (request.status !== "AWAITING_GUARDIANS") {
        await ctx.db.patch(request._id, { status: "AWAITING_GUARDIANS" });
      }
      return;
    }

    const asset = await ctx.db.get(request.assetId);
    if (!asset) return;
    if (compareUnits(asset.balance, request.amount, asset.decimals) < 0) {
      await ctx.db.patch(request._id, {
        status: "FAILED",
        cancelReason: "Balance changed before execution; withdrawal not sent.",
        finalizedAt: now,
      });
      await notify(ctx, {
        userId: request.userId,
        vaultId: vault._id,
        category: "withdrawal_failed",
        title: "Withdrawal failed",
        body: "The vault balance no longer covers this withdrawal, so nothing was released.",
        severity: "CRITICAL",
      });
      return;
    }
    await ctx.db.patch(asset._id, {
      balance: subtractUnits(asset.balance, request.amount, asset.decimals),
    });
    await ctx.db.patch(request._id, { status: "COMPLETED", finalizedAt: now });
    await recordVaultTransaction(ctx, {
      vaultId: vault._id,
      kind: "WITHDRAWAL",
      symbol: request.symbol,
      amount: request.amount,
      status: "SIMULATED",
      description: `Simulated withdrawal to ${request.destination} after the security delay. No chain transaction was submitted.`,
      source: "SIMULATED",
      simulationRef: request.simulationRef,
    });
    await notify(ctx, {
      userId: request.userId,
      vaultId: vault._id,
      category: "withdrawal_completed",
      title: "Withdrawal delay complete",
      body: `${request.amount} ${request.symbol} left the sandbox vault. No on-chain transfer occurred.`,
      severity: "INFO",
    });
    await audit(ctx, {
      userId: request.userId,
      vaultId: vault._id,
      action: "WITHDRAWAL_EXECUTED_SIMULATED",
      detail: `${request.amount} ${request.symbol} released after delay (${request.simulationRef}).`,
    });
  },
});

export { cancelPendingForVault };
export type WithdrawalRequestDoc = Doc<"withdrawalRequests">;
export { parseUnits };
