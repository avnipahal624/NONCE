import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  audit,
  notify,
  requireVaultOwner,
  userIdOrNull,
  getVaultForUser,
} from "./db";
import {
  DEMO_POLICY_DELAY_MINUTES,
  GUARDIAN_THRESHOLD,
  MIN_POLICY_DELAY_MINUTES,
  MIN_WITHDRAWAL_DELAY_MINUTES,
  PROPOSAL_EXECUTION_WINDOW_MS,
  REQUIRED_GUARDIANS,
  STABLE_POLICY,
  WITHDRAWAL_EXPIRY_MS,
} from "./shared";
import {
  classifyPolicyChange,
  normalizePolicyInput,
  type PolicyInput,
  type PolicyView,
} from "./policyRules";

const policyValidator = v.object({
  maxPerTransaction: v.string(),
  rollingLimit: v.string(),
  delayMinutes: v.number(),
  largeWithdrawalThreshold: v.string(),
  guardianThreshold: v.number(),
  allowlistOnly: v.boolean(),
  allowlist: v.array(v.string()),
});

function viewOf(policy: Doc<"withdrawalPolicies">): PolicyView {
  return {
    maxPerTransaction: policy.maxPerTransaction,
    rollingLimit: policy.rollingLimit ?? "2.5",
    delayMinutes: policy.delayMinutes,
    largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
    guardianThreshold: policy.guardianThreshold,
    allowlistOnly: policy.allowlistOnly,
    allowlist: policy.allowlist,
    guardianApprovalRequired: true,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

function isExpired(proposal: Doc<"securityProposals">, now: number): boolean {
  return now > proposal.executeAfter + PROPOSAL_EXECUTION_WINDOW_MS;
}

export const state = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return null;

    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    const proposals = await ctx.db
      .query("securityProposals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);

    const now = Date.now();
    return {
      policy: policy ? viewOf(policy) : null,
      proposals: proposals.map((proposal) => ({
        ...proposal,
        expired: proposal.status === "PENDING" && isExpired(proposal, now),
      })),
      pending: proposals.find((proposal) => proposal.status === "PENDING") ?? null,
      mode: vault.mode,
      vaultState: vault.state,
      demoPolicyDelayMinutes: DEMO_POLICY_DELAY_MINUTES,
      contractMinimumPolicyDelayMinutes: MIN_POLICY_DELAY_MINUTES,
      contractMinimumWithdrawalDelayMinutes: MIN_WITHDRAWAL_DELAY_MINUTES,
      guardianThreshold: GUARDIAN_THRESHOLD,
      requiredGuardians: REQUIRED_GUARDIANS,
      stablePolicy: STABLE_POLICY,
      executionWindowMs: PROPOSAL_EXECUTION_WINDOW_MS,
      withdrawalExpiryMs: WITHDRAWAL_EXPIRY_MS,
    };
  },
});

/**
 * Creates a timelocked policy proposal. Weakening changes additionally need a
 * confirmed 2-of-3 guardian quorum. The demo compresses the contract's 24-hour
 * minimum delay to two minutes and labels that compression in the interface.
 */
export const propose = mutation({
  args: { vaultId: v.id("vaults"), policy: policyValidator },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Policy changes on a testnet vault must be submitted to the contract from the owner wallet.",
      );
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Policy changes are frozen during lockdown or recovery.");
    }

    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) throw new Error("Withdrawal policy missing.");
    const current = viewOf(policy);
    const next = normalizePolicyInput(args.policy as PolicyInput);
    const { classification, reasons } = classifyPolicyChange(current, next);
    if (classification === "NEUTRAL") {
      throw new Error("This change does not alter the policy.");
    }

    const existing = await ctx.db
      .query("securityProposals")
      .withIndex("by_vault_status", (q) =>
        q.eq("vaultId", vault._id).eq("status", "PENDING"),
      )
      .collect();
    const now = Date.now();
    for (const proposal of existing) {
      if (isExpired(proposal, now)) {
        await ctx.db.patch(proposal._id, { status: "EXPIRED" });
        continue;
      }
      throw new Error(
        "A policy proposal is already pending. Execute or cancel it before proposing another change.",
      );
    }

    if (classification === "WEAKENING") {
      const guardians = await ctx.db
        .query("guardians")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect();
      const confirmed = guardians.filter(
        (guardian) => guardian.status === "CONFIRMED",
      );
      if (confirmed.length < REQUIRED_GUARDIANS) {
        throw new Error(
          "A weakening change needs three configured guardians so that two can approve.",
        );
      }
    }

    const executeAfter = now + DEMO_POLICY_DELAY_MINUTES * 60 * 1000;
    const proposalId = await ctx.db.insert("securityProposals", {
      vaultId: vault._id,
      userId,
      kind: "WITHDRAWAL_POLICY",
      policy: next,
      classification,
      status: "PENDING",
      approvals: [],
      createdAt: now,
      executeAfter,
    });

    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "POLICY_PROPOSED",
      detail: `${classification} policy change proposed. ${
        classification === "WEAKENING"
          ? "Two guardian approvals are required. "
          : ""
      }Effective after ${new Date(executeAfter).toISOString()}. ${reasons.join("; ")}.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "policy_proposed",
      title:
        classification === "WEAKENING"
          ? "Security-reducing change is pending"
          : "Security-strengthening change is pending",
      body:
        classification === "WEAKENING"
          ? "Two guardian approvals and the activation delay must pass before this takes effect."
          : "The change is timelocked; current protections remain in force.",
      severity: classification === "WEAKENING" ? "WARNING" : "INFO",
    });

    return { proposalId, classification, executeAfter };
  },
});

export const approve = mutation({
  args: {
    vaultId: v.id("vaults"),
    proposalId: v.id("securityProposals"),
    guardianId: v.id("guardians"),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Guardian approvals must be signed by guardian wallets on testnet.");
    }
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Policy proposal not found on this vault.");
    }
    if (proposal.status !== "PENDING") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    if (isExpired(proposal, Date.now())) {
      await ctx.db.patch(proposal._id, { status: "EXPIRED" });
      throw new Error("This proposal expired. Create a new one.");
    }
    if (proposal.classification !== "WEAKENING") {
      throw new Error(
        "This change strengthens or preserves protection. It only needs the timelock.",
      );
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id || guardian.status !== "CONFIRMED") {
      throw new Error("Only a confirmed guardian can approve this change.");
    }
    if (proposal.approvals.includes(guardian._id)) {
      throw new Error("This guardian already approved. Duplicate approvals are rejected.");
    }
    const approvals = [...proposal.approvals, guardian._id];
    await ctx.db.patch(proposal._id, { approvals });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: guardian.address,
      action: "POLICY_APPROVAL_SIMULATED",
      detail: `${guardian.label} approved policy proposal ${proposal._id} (${approvals.length}/2). Sandbox approval, not a guardian signature.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "policy_approval",
      title: `Policy approval ${Math.min(approvals.length, 2)}/2`,
      body:
        approvals.length >= GUARDIAN_THRESHOLD
          ? "Guardian quorum met. The change can execute after the timelock."
          : "One more guardian approval is required.",
      severity: approvals.length >= GUARDIAN_THRESHOLD ? "SUCCESS" : "INFO",
    });
    return { approvals: approvals.length, threshold: GUARDIAN_THRESHOLD };
  },
});

export const cancel = mutation({
  args: { vaultId: v.id("vaults"), proposalId: v.id("securityProposals") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Policy proposal not found on this vault.");
    }
    if (proposal.status !== "PENDING") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    await ctx.db.patch(proposal._id, {
      status: "CANCELLED",
      cancelledAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "POLICY_PROPOSAL_CANCELLED",
      detail: `Policy proposal ${proposal._id} cancelled before activation.`,
    });
  },
});

/**
 * Applies a pending policy only after its timelock and, for weakening changes,
 * after two distinct confirmed guardians approved. The classification is
 * recomputed against the policy in force at execution time.
 */
export const execute = mutation({
  args: { vaultId: v.id("vaults"), proposalId: v.id("securityProposals") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Execute the on-chain policy proposal from the owner wallet.");
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Policy execution is blocked while the vault is locked down.");
    }
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Policy proposal not found on this vault.");
    }
    if (proposal.status !== "PENDING") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    const now = Date.now();
    if (now < proposal.executeAfter) {
      throw new Error(
        `The timelock is active until ${new Date(proposal.executeAfter).toLocaleTimeString()}.`,
      );
    }
    if (isExpired(proposal, now)) {
      await ctx.db.patch(proposal._id, { status: "EXPIRED" });
      throw new Error("This proposal expired. Create a new one.");
    }

    const currentRecord = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!currentRecord) throw new Error("Withdrawal policy missing.");
    const current = viewOf(currentRecord);
    const { classification } = classifyPolicyChange(current, proposal.policy);
    if (classification === "WEAKENING") {
      const guardians = await ctx.db
        .query("guardians")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect();
      const confirmedIds = new Set(
        guardians
          .filter((guardian) => guardian.status === "CONFIRMED")
          .map((guardian) => guardian._id),
      );
      const validApprovals = proposal.approvals.filter((id) => confirmedIds.has(id));
      if (validApprovals.length < GUARDIAN_THRESHOLD) {
        throw new Error(
          `This change is security-reducing and needs two confirmed guardian approvals (${validApprovals.length}/${GUARDIAN_THRESHOLD}).`,
        );
      }
    }

    await ctx.db.patch(currentRecord._id, {
      maxPerTransaction: proposal.policy.maxPerTransaction,
      rollingLimit: proposal.policy.rollingLimit,
      delayMinutes: proposal.policy.delayMinutes,
      largeWithdrawalThreshold: proposal.policy.largeWithdrawalThreshold,
      guardianApprovalRequired: true,
      guardianThreshold: proposal.policy.guardianThreshold,
      allowlistOnly: proposal.policy.allowlistOnly,
      allowlist: proposal.policy.allowlist,
      updatedAt: now,
      updatedBy: vault.ownerSigner,
    });
    await ctx.db.patch(proposal._id, { status: "EXECUTED", executedAt: now });

    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "POLICY_EXECUTED",
      detail: `Policy activated: ${proposal.policy.maxPerTransaction} ETH per transfer, ${proposal.policy.rollingLimit} ETH per 24h, delay ${proposal.policy.delayMinutes}m above ${proposal.policy.largeWithdrawalThreshold} ETH.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "policy_changed",
      title: "Withdrawal protection updated",
      body: `New limits are active. Every withdrawal now has at least a ${MIN_WITHDRAWAL_DELAY_MINUTES}-minute delay.`,
      severity: "WARNING",
    });
    return { classification };
  },
});
