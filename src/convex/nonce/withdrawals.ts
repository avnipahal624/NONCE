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
  DEFAULT_POLICY,
  GUARDIAN_THRESHOLD,
  MIN_WITHDRAWAL_DELAY_MINUTES,
  WITHDRAWAL_EXPIRY_MS,
  compareUnits,
  isValidAddress,
  isZeroAmount,
  normalizeAddress,
  parseUnits,
  simulationRef,
  subtractUnits,
} from "./shared";
import {
  formatPolicyUnits,
  normalizePolicyInput,
  pendingReservedUnits,
  policyForSymbol,
  rollingSpentUnits,
} from "./policyRules";
import { internal } from "../_generated/api";

const CANCELLABLE: Doc<"withdrawalRequests">["status"][] = [
  "QUEUED",
  "AWAITING_GUARDIANS",
  "READY",
];

function isPending(status: Doc<"withdrawalRequests">["status"]): boolean {
  return CANCELLABLE.includes(status);
}

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
    if (!isPending(request.status)) continue;
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

/**
 * Initial policy configuration only. Once the vault holds assets or has any
 * withdrawal history, changes must go through `policy.propose`, which enforces
 * the timelock and guardian quorum.
 */
export const updatePolicy = mutation({
  args: {
    vaultId: v.id("vaults"),
    maxPerTransaction: v.string(),
    rollingLimit: v.optional(v.string()),
    delayMinutes: v.number(),
    largeWithdrawalThreshold: v.string(),
    guardianApprovalRequired: v.boolean(),
    guardianThreshold: v.number(),
    allowlistOnly: v.boolean(),
    allowlist: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Testnet policy changes must be sent to the vault contract from the owner wallet.",
      );
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Withdrawal policy is frozen during lockdown or recovery.");
    }
    if (args.guardianApprovalRequired === false) {
      throw new Error(
        "Guardian approval for large withdrawals cannot be disabled. It is an immutable safeguard.",
      );
    }

    const assets = await ctx.db
      .query("vaultAssets")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const hasBalance = assets.some((asset) => parseUnits(asset.balance, asset.decimals) > 0n);
    const priorRequests = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (hasBalance || priorRequests) {
      throw new Error(
        "The vault already holds assets or has withdrawal history. Use a timelocked policy proposal instead of editing the policy directly.",
      );
    }

    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) throw new Error("Withdrawal policy missing.");

    const normalized = normalizePolicyInput({
      maxPerTransaction: args.maxPerTransaction,
      rollingLimit: args.rollingLimit ?? policy.rollingLimit ?? DEFAULT_POLICY.rollingLimit,
      delayMinutes: args.delayMinutes,
      largeWithdrawalThreshold: args.largeWithdrawalThreshold,
      guardianThreshold: args.guardianThreshold,
      allowlistOnly: args.allowlistOnly,
      allowlist: args.allowlist,
    });

    await ctx.db.patch(policy._id, {
      ...normalized,
      guardianApprovalRequired: true,
      updatedAt: Date.now(),
      updatedBy: vault.ownerSigner,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "WITHDRAWAL_POLICY_INITIALISED",
      detail: `Initial policy: ${normalized.maxPerTransaction} ETH per transfer, ${normalized.rollingLimit} ETH per 24h, ${normalized.delayMinutes}m delay, ${normalized.guardianThreshold}-of-3 guardians.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "policy_changed",
      title: "Initial withdrawal policy saved",
      body: "Later changes are timelocked. Security-reducing edits need two guardian approvals.",
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
    if (vault.mode !== "DEMO") {
      throw new Error(
        "This withdrawal path is simulated. Submit the withdrawal to the testnet contract from the owner wallet.",
      );
    }
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
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) throw new Error("Withdrawal policy missing.");

    if (policy.allowlistOnly && !policy.allowlist.includes(destination)) {
      throw new Error(
        "Recipient is not on your withdrawal allowlist. Adding a recipient now requires a timelocked policy change.",
      );
    }

    const rules = policyForSymbol(
      {
        maxPerTransaction: policy.maxPerTransaction,
        rollingLimit: policy.rollingLimit ?? DEFAULT_POLICY.rollingLimit,
        delayMinutes: policy.delayMinutes,
        largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
      },
      asset.symbol,
    );
    const amountUnits = parseUnits(args.amount, rules.decimals);
    const balanceUnits = parseUnits(asset.balance, rules.decimals);

    if (amountUnits > parseUnits(rules.maxPerTransaction, rules.decimals)) {
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "WITHDRAWAL_REJECTED_LIMIT",
        detail: `${args.amount} ${asset.symbol} exceeded the ${rules.maxPerTransaction} ${asset.symbol} per-transaction limit.`,
      });
      throw new Error(
        `This amount exceeds the ${rules.maxPerTransaction} ${asset.symbol} per-transaction limit.`,
      );
    }

    const requests = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const reserved = pendingReservedUnits(requests, asset.symbol, rules.decimals);
    if (amountUnits + reserved > balanceUnits) {
      throw new Error(
        "The requested amount exceeds the unreserved vault balance. Pending withdrawals already reserve part of it.",
      );
    }

    const now = Date.now();
    const alreadySpent = rollingSpentUnits(
      requests,
      asset.symbol,
      rules.decimals,
      now,
    );
    const requiresGuardians =
      amountUnits >= parseUnits(rules.largeWithdrawalThreshold, rules.decimals) ||
      alreadySpent + amountUnits >=
        parseUnits(rules.largeWithdrawalThreshold, rules.decimals);
    const requiredApprovals = requiresGuardians ? GUARDIAN_THRESHOLD : 0;
    const delayMinutes = requiresGuardians
      ? rules.delayMinutes
      : MIN_WITHDRAWAL_DELAY_MINUTES;
    const executeAfter = now + delayMinutes * 60 * 1000;
    const expiresAt = executeAfter + WITHDRAWAL_EXPIRY_MS;
    const ref = simulationRef("WITHDRAWAL");

    const reason = requiresGuardians
      ? `At or above the ${rules.largeWithdrawalThreshold} ${asset.symbol} cumulative threshold: ${delayMinutes}-minute delay and ${requiredApprovals} guardian approvals.`
      : `Mandatory ${delayMinutes}-minute delay. Cumulative spending stays inside the ${rules.rollingLimit} ${asset.symbol} 24-hour budget.`;

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
      expiresAt,
      epoch: vault.securityEpoch ?? 1,
      simulationRef: ref,
    });
    await ctx.scheduler.runAfter(
      Math.max(executeAfter - now, 0),
      internal.nonce.withdrawals.finalize,
      { requestId },
    );
    await ctx.scheduler.runAfter(
      Math.max(expiresAt - now, 0),
      internal.nonce.withdrawals.expire,
      { requestId },
    );
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "withdrawal_delayed",
      title: "Withdrawal held under guard",
      body: `${args.amount} ${asset.symbol} is queued until ${new Date(executeAfter).toLocaleTimeString()}. Every withdrawal now has a minimum delay so it can be cancelled.`,
      severity: "WARNING",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "WITHDRAWAL_QUEUED",
      detail: `${args.amount} ${asset.symbol} to ${destination}, executes after ${new Date(executeAfter).toISOString()}, expires ${new Date(expiresAt).toISOString()}.`,
    });
    return {
      requestId,
      status: requiresGuardians ? ("AWAITING_GUARDIANS" as const) : ("QUEUED" as const),
      executeAfter,
    };
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
    if (!isPending(request.status)) {
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
      detail: `Queued withdrawal ${request._id} of ${request.amount} ${request.symbol} cancelled. Reservation released.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "withdrawal_cancelled",
      title: "Withdrawal cancelled",
      body: `${request.amount} ${request.symbol} stays in the vault and its rolling allowance is released.`,
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
        "Testnet withdrawals must be approved by the guardian wallet on-chain.",
      );
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Approvals cannot release a withdrawal during lockdown or recovery.");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request || request.vaultId !== vault._id) {
      throw new Error("Withdrawal not found on this vault.");
    }
    if (!isPending(request.status)) {
      throw new Error(`This withdrawal is already ${request.status.toLowerCase()}.`);
    }
    if (!request.requiresGuardians || request.requiredApprovals === 0) {
      throw new Error("This withdrawal does not require guardian approval.");
    }
    if (request.expiresAt && Date.now() > request.expiresAt) {
      throw new Error("This withdrawal expired. Nothing can be approved.");
    }
    if ((request.epoch ?? 1) !== (vault.securityEpoch ?? 1)) {
      throw new Error("This withdrawal belongs to an older security epoch.");
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id || guardian.status !== "CONFIRMED") {
      throw new Error("Only confirmed guardians can approve this withdrawal.");
    }
    if (request.approvals.includes(guardian.address)) {
      throw new Error("This guardian already approved. Duplicate approvals are rejected.");
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
    if (ready && request.executeAfter <= Date.now()) {
      await ctx.scheduler.runAfter(0, internal.nonce.withdrawals.finalize, {
        requestId: request._id,
      });
    }
    return { approvals: approvals.length, required: request.requiredApprovals };
  },
});

export const expire = internalMutation({
  args: { requestId: v.id("withdrawalRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || !isPending(request.status)) return;
    if (request.expiresAt && Date.now() <= request.expiresAt) return;
    await ctx.db.patch(request._id, {
      status: "CANCELLED",
      cancelReason: "Expired without execution. The reservation was released.",
      finalizedAt: Date.now(),
    });
    await audit(ctx, {
      userId: request.userId,
      vaultId: request.vaultId,
      action: "WITHDRAWAL_EXPIRED",
      detail: `Withdrawal ${request._id} expired and released its reservation.`,
    });
  },
});

export const finalize = internalMutation({
  args: { requestId: v.id("withdrawalRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return;
    if (!isPending(request.status)) return;
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

    if ((request.epoch ?? 1) !== (vault.securityEpoch ?? 1)) {
      await ctx.db.patch(request._id, {
        status: "BLOCKED",
        cancelReason: "Security epoch changed during recovery.",
        finalizedAt: now,
      });
      return;
    }

    if (request.expiresAt && now > request.expiresAt) {
      await ctx.db.patch(request._id, {
        status: "CANCELLED",
        cancelReason: "Expired without execution.",
        finalizedAt: now,
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
export { parseUnits, formatPolicyUnits };
