import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  audit,
  getPrimaryWallet,
  requireVaultOwner,
  userIdOrNull,
  getVaultForUser,
  notify,
} from "./db";
import {
  GUARDIAN_THRESHOLD,
  isValidAddress,
  normalizeAddress,
  randomHex,
  recoveryReference,
} from "./shared";
import { sha256Hex } from "./hash";

const RECOVERY_DELAY_MS = 2 * 60 * 1000;
const RECOVERY_EXECUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function assertEligible(
  ctx: MutationCtx,
  vault: Doc<"vaults">,
  replacementAddress: string,
  incidentId?: Id<"incidents">,
  guardianId?: Id<"guardians">,
): Promise<Doc<"guardians">[]> {
  if (vault.mode !== "DEMO") {
    throw new Error(
      "Guardian recovery on testnet is executed by the contract from guardian wallets, not through the demo backend.",
    );
  }
  if (!isValidAddress(replacementAddress)) {
    throw new Error("Enter a valid replacement signer address.");
  }
  const replacement = normalizeAddress(replacementAddress);
  if (
    replacement === normalizeAddress(vault.ownerSigner) ||
    (vault.monitorAddress && replacement === normalizeAddress(vault.monitorAddress))
  ) {
    throw new Error(
      "The replacement signer must be different from the owner and monitor.",
    );
  }

  const guardians = (
    await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect()
  ).filter((guardian) => guardian.status !== "REMOVED");
  const confirmed = guardians.filter((guardian) => guardian.status === "CONFIRMED");
  if (confirmed.length < 3) {
    throw new Error(
      "Recovery needs three confirmed guardians so that two of three can approve.",
    );
  }
  if (guardians.some((guardian) => guardian.address === replacement)) {
    throw new Error("A guardian cannot become the vault signer. Keep the roles separate.");
  }
  if (guardianId) {
    const proposer = confirmed.find((guardian) => guardian._id === guardianId);
    if (!proposer) throw new Error("The proposing guardian is not confirmed.");
  }

  const existing = await ctx.db
    .query("recoveryProposals")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .collect();
  const active = existing.find(
    (proposal) =>
      proposal.status === "AWAITING_GUARDIANS" ||
      proposal.status === "APPROVED" ||
      proposal.status === "EXECUTING",
  );
  if (active) {
    throw new Error("A recovery proposal is already in progress for this vault.");
  }

  if (incidentId) {
    const incident = await ctx.db.get(incidentId);
    if (!incident || incident.vaultId !== vault._id) {
      throw new Error("Incident not found on this vault.");
    }
  }
  return confirmed;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return null;
    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const proposals = await ctx.db
      .query("recoveryProposals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .collect();
    const withApprovals = await Promise.all(
      proposals.map(async (proposal) => {
        const approvals = await ctx.db
          .query("guardianApprovals")
          .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
          .collect();
        return { ...proposal, approvals };
      }),
    );
    return {
      vaultState: vault.state,
      vaultMode: vault.mode,
      ownerSigner: vault.ownerSigner,
      securityEpoch: vault.securityEpoch ?? 1,
      guardianThreshold: GUARDIAN_THRESHOLD,
      guardians: guardians.filter((guardian) => guardian.status !== "REMOVED"),
      proposals: withApprovals,
      recoveryDelayMinutes: RECOVERY_DELAY_MS / 60000,
      executionWindowMs: RECOVERY_EXECUTION_WINDOW_MS,
      requiredGuardians: 3,
    };
  },
});

/**
 * Owner-initiated recovery. Useful when the owner still controls the account
 * but wants to replace a signer. Guardians may instead initiate independently
 * through `proposeAsGuardian`; the owner cannot cancel that proposal.
 */
export const createProposal = mutation({
  args: {
    vaultId: v.id("vaults"),
    replacementAddress: v.string(),
    incidentId: v.optional(v.id("incidents")),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    await assertEligible(ctx, vault, args.replacementAddress, args.incidentId);
    const replacement = normalizeAddress(args.replacementAddress);
    const now = Date.now();
    const proposalId = await ctx.db.insert("recoveryProposals", {
      vaultId: vault._id,
      incidentId: args.incidentId,
      reference: recoveryReference(),
      proposedByUserId: userId,
      replacedAddress: vault.ownerSigner,
      replacementAddress: replacement,
      status: "AWAITING_GUARDIANS",
      threshold: GUARDIAN_THRESHOLD,
      approvalsCount: 0,
      nonce: randomHex(16),
      createdAt: now,
      executeAfter: now + RECOVERY_DELAY_MS,
      initiatedBy: "OWNER",
      cancelApprovals: [],
      priorState: vault.state,
      epoch: vault.securityEpoch ?? 1,
    });
    await ctx.db.patch(vault._id, {
      state: "RECOVERY",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
    });
    if (args.incidentId) {
      await ctx.db.patch(args.incidentId, {
        status: "RECOVERY",
        responseStatus: "Owner-initiated guardian recovery is in progress.",
      });
    }
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "recovery_proposed",
      title: "Recovery proposal created",
      body: `Two of three guardians must approve replacing ${vault.ownerSigner.slice(0, 6)}… with ${replacement.slice(0, 6)}….`,
      severity: "WARNING",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "RECOVERY_PROPOSED",
      detail: `Owner-initiated replacement of ${vault.ownerSigner} with ${replacement}; ${RECOVERY_DELAY_MS / 60000}-minute delay started.`,
    });
    return proposalId;
  },
});

/**
 * Guardian-initiated recovery for the demo path.
 *
 * DEMO LIMITATION: guardian wallets in the sandbox have no keys and no NONCE
 * accounts. The signed-in account records the proposal on behalf of a chosen
 * confirmed guardian, and the interface labels it as simulated. The contract
 * enforces real guardian initiation and signatures on testnet.
 */
export const proposeAsGuardian = mutation({
  args: {
    vaultId: v.id("vaults"),
    guardianId: v.id("guardians"),
    replacementAddress: v.string(),
    incidentId: v.optional(v.id("incidents")),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const confirmed = await assertEligible(
      ctx,
      vault,
      args.replacementAddress,
      args.incidentId,
      args.guardianId,
    );
    const proposer = confirmed.find((guardian) => guardian._id === args.guardianId);
    if (!proposer) throw new Error("Guardian not found on this vault.");
    const replacement = normalizeAddress(args.replacementAddress);
    const now = Date.now();
    const nonce = randomHex(16);
    const proposalId = await ctx.db.insert("recoveryProposals", {
      vaultId: vault._id,
      incidentId: args.incidentId,
      reference: recoveryReference(),
      proposedByUserId: userId,
      replacedAddress: vault.ownerSigner,
      replacementAddress: replacement,
      status: "AWAITING_GUARDIANS",
      threshold: GUARDIAN_THRESHOLD,
      approvalsCount: 1,
      nonce,
      createdAt: now,
      executeAfter: now + RECOVERY_DELAY_MS,
      initiatedBy: "GUARDIAN_SIMULATED",
      proposerGuardianId: proposer._id,
      cancelApprovals: [],
      priorState: vault.state,
      epoch: vault.securityEpoch ?? 1,
    });
    const messageHash = sha256Hex(
      [
        "NONCE_RECOVERY_PROPOSAL",
        vault._id,
        String(vault.chainId),
        nonce,
        vault.ownerSigner,
        replacement,
        proposer.address,
      ].join("|"),
    );
    await ctx.db.insert("guardianApprovals", {
      proposalId,
      vaultId: vault._id,
      guardianId: proposer._id,
      address: proposer.address,
      approvedAt: now,
      signatureMode: "SIMULATED",
      messageHash,
    });
    await ctx.db.patch(vault._id, {
      state: "RECOVERY",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
    });
    if (args.incidentId) {
      await ctx.db.patch(args.incidentId, {
        status: "RECOVERY",
        responseStatus:
          "Guardian-initiated recovery is in progress. The owner cannot cancel it.",
      });
    }
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "recovery_proposed",
      title: "Guardian recovery opened",
      body: `${proposer.label} proposed replacing the signer. One more guardian approval is required. This is a simulated guardian action.`,
      severity: "CRITICAL",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: proposer.address,
      action: "RECOVERY_GUARDIAN_INITIATED_SIMULATED",
      detail: `${proposer.label} opened recovery without the owner. One approval recorded; the owner cannot cancel this proposal.`,
    });
    return proposalId;
  },
});

export const simulateGuardianApproval = mutation({
  args: {
    vaultId: v.id("vaults"),
    proposalId: v.id("recoveryProposals"),
    guardianId: v.id("guardians"),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Testnet approvals must be signed by the guardian wallet.");
    }
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if (proposal.status !== "AWAITING_GUARDIANS") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    if (Date.now() > proposal.executeAfter + RECOVERY_EXECUTION_WINDOW_MS) {
      throw new Error("This recovery proposal expired. Create a new one.");
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id || guardian.status !== "CONFIRMED") {
      throw new Error("Only confirmed guardians can approve recovery.");
    }
    const approvals = await ctx.db
      .query("guardianApprovals")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
      .collect();
    if (approvals.some((approval) => approval.guardianId === guardian._id)) {
      throw new Error("This guardian already approved. Duplicate approvals are rejected.");
    }
    const messageHash = sha256Hex(
      [
        "NONCE_RECOVERY_APPROVAL",
        vault._id,
        String(vault.chainId),
        proposal.nonce,
        proposal.replacedAddress,
        proposal.replacementAddress,
        guardian.address,
      ].join("|"),
    );
    if (approvals.some((approval) => approval.messageHash === messageHash)) {
      throw new Error("That approval was already used.");
    }
    await ctx.db.insert("guardianApprovals", {
      proposalId: proposal._id,
      vaultId: vault._id,
      guardianId: guardian._id,
      address: guardian.address,
      approvedAt: Date.now(),
      signatureMode: "SIMULATED",
      messageHash,
    });
    const total = approvals.length + 1;
    await ctx.db.patch(proposal._id, {
      approvalsCount: total,
      status: total >= proposal.threshold ? "APPROVED" : "AWAITING_GUARDIANS",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: guardian.address,
      action: "RECOVERY_APPROVAL_SIMULATED",
      detail: `${guardian.label} approval recorded (${total}/${proposal.threshold}), bound to ${messageHash.slice(0, 16)}…`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "guardian_approval",
      title: `Guardian approval ${total}/${proposal.threshold}`,
      body:
        total >= proposal.threshold
          ? "Threshold met. Recovery can execute after the recovery delay."
          : "One more guardian approval is required.",
      severity: total >= proposal.threshold ? "SUCCESS" : "INFO",
    });
    return { approvals: total, threshold: proposal.threshold };
  },
});

/**
 * Cancellation rules mirror the contract:
 * - owner-initiated proposals: the owner may cancel;
 * - guardian-initiated proposals: two distinct guardians must cancel, so a
 *   compromised owner cannot veto guardian recovery.
 */
export const cancel = mutation({
  args: {
    vaultId: v.id("vaults"),
    proposalId: v.id("recoveryProposals"),
    guardianId: v.optional(v.id("guardians")),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if (proposal.status !== "AWAITING_GUARDIANS" && proposal.status !== "APPROVED") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    const now = Date.now();

    if ((proposal.initiatedBy ?? "OWNER") === "OWNER") {
      await ctx.db.patch(proposal._id, {
        status: "REJECTED",
        rejectionReason: "Cancelled by the owner before execution.",
      });
      await ctx.db.patch(vault._id, {
        state: proposal.priorState ?? "NORMAL",
        stateSource: "SIMULATED",
        stateUpdatedAt: now,
      });
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "RECOVERY_CANCELLED_OWNER",
        detail: `Owner-initiated recovery ${proposal.reference} cancelled.`,
      });
      return { cancelled: true, approvals: 0 };
    }

    if (!args.guardianId) {
      throw new Error(
        "Guardian-initiated recovery can only be cancelled by two distinct guardians. Select a guardian cancellation.",
      );
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id || guardian.status !== "CONFIRMED") {
      throw new Error("Only a confirmed guardian can cancel a guardian proposal.");
    }
    const cancelApprovals = proposal.cancelApprovals ?? [];
    if (cancelApprovals.includes(guardian._id)) {
      throw new Error("This guardian already voted to cancel.");
    }
    const next = [...cancelApprovals, guardian._id];
    await ctx.db.patch(proposal._id, {
      cancelApprovals: next,
      status: next.length >= 2 ? "REJECTED" : proposal.status,
      rejectionReason:
        next.length >= 2
          ? "Cancelled by two distinct guardians."
          : proposal.rejectionReason,
    });
    if (next.length >= 2) {
      await ctx.db.patch(vault._id, {
        state: proposal.priorState ?? "NORMAL",
        stateSource: "SIMULATED",
        stateUpdatedAt: now,
      });
    }
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: guardian.address,
      action: "RECOVERY_CANCEL_APPROVAL_SIMULATED",
      detail: `${guardian.label} voted to cancel guardian-initiated recovery (${next.length}/2).`,
    });
    return { cancelled: next.length >= 2, approvals: next.length };
  },
});

export const execute = mutation({
  args: { vaultId: v.id("vaults"), proposalId: v.id("recoveryProposals") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Execute on-chain recovery from a guardian wallet. The backend cannot sign for the vault.",
      );
    }
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if (proposal.status !== "APPROVED") {
      throw new Error(
        `Recovery cannot execute while the proposal is ${proposal.status.toLowerCase()} (${proposal.approvalsCount}/${proposal.threshold} approvals).`,
      );
    }
    if (Date.now() < proposal.executeAfter) {
      throw new Error(
        `Recovery delay is still active until ${new Date(proposal.executeAfter).toLocaleTimeString()}.`,
      );
    }
    if (Date.now() > proposal.executeAfter + RECOVERY_EXECUTION_WINDOW_MS) {
      throw new Error("Recovery proposal expired. Open a fresh proposal.");
    }
    const replacement = normalizeAddress(proposal.replacementAddress);
    if (
      replacement === normalizeAddress(vault.ownerSigner) ||
      (vault.monitorAddress && replacement === normalizeAddress(vault.monitorAddress))
    ) {
      throw new Error("Role conflict: the replacement cannot be the owner or monitor.");
    }
    const guardian = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    if (guardian.some((entry) => entry.address === replacement)) {
      throw new Error("Role conflict: a guardian cannot become the vault signer.");
    }
    if (vault.state !== "LOCKDOWN" && vault.state !== "RECOVERY") {
      throw new Error("The vault is not in a recoverable state.");
    }

    const approvals = await ctx.db
      .query("guardianApprovals")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
      .collect();
    if (approvals.length < proposal.threshold) {
      throw new Error("Guardian approval threshold is not met.");
    }

    const now = Date.now();
    const nextEpoch = (vault.securityEpoch ?? 1) + 1;
    const wallets = await ctx.db
      .query("walletIdentities")
      .withIndex("by_user", (q) => q.eq("userId", vault.userId))
      .collect();
    const oldSigner = wallets.find(
      (wallet) =>
        wallet.address === normalizeAddress(proposal.replacedAddress) &&
        wallet.revokedAt === undefined,
    );
    for (const wallet of wallets.filter((entry) => entry.isPrimary && !entry.revokedAt)) {
      await ctx.db.patch(wallet._id, { isPrimary: false });
    }
    if (oldSigner) {
      await ctx.db.patch(oldSigner._id, {
        revokedAt: now,
        isPrimary: false,
        label: "Recovered — revoked as compromised",
      });
    }
    const replacementExisting = wallets.find(
      (wallet) => wallet.address === replacement && wallet.revokedAt === undefined,
    );
    if (replacementExisting) {
      await ctx.db.patch(replacementExisting._id, { isPrimary: true });
    } else {
      await ctx.db.insert("walletIdentities", {
        userId: vault.userId,
        address: replacement,
        chainId: vault.chainId,
        label: "Recovery signer",
        verification: "DEMO_SIGNER",
        isPrimary: true,
        verifiedAt: now,
      });
    }

    await ctx.db.patch(vault._id, {
      state: "RESTORED",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
      ownerSigner: replacement,
      securityEpoch: nextEpoch,
      lastSyncedAt: now,
    });
    await ctx.db.patch(proposal._id, {
      status: "COMPLETED",
      completedAt: now,
    });

    const requests = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    let cancelled = 0;
    for (const request of requests) {
      if (["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status)) {
        await ctx.db.patch(request._id, {
          status: "CANCELLED",
          cancelReason: `Cancelled during recovery. Security epoch advanced to ${nextEpoch}.`,
          finalizedAt: now,
        });
        cancelled += 1;
      }
    }

    const pendingPolicies = await ctx.db
      .query("securityProposals")
      .withIndex("by_vault_status", (q) =>
        q.eq("vaultId", vault._id).eq("status", "PENDING"),
      )
      .collect();
    for (const pending of pendingPolicies) {
      await ctx.db.patch(pending._id, {
        status: "CANCELLED",
        cancelledAt: now,
      });
    }

    if (proposal.incidentId) {
      await ctx.db.patch(proposal.incidentId, {
        status: "RESOLVED",
        closedAt: now,
        responseStatus:
          "Recovery complete. Compromised signer revoked and pending withdrawals cleared.",
        resolutionNote: `Signer replaced via ${proposal.threshold}-of-3 guardian approval.`,
      });
    }
    const signals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    for (const signal of signals) {
      if (signal.detectionState !== "RESOLVED") {
        await ctx.db.patch(signal._id, { detectionState: "RESOLVED" });
      }
    }
    await ctx.db.insert("vaultTransactions", {
      vaultId: vault._id,
      kind: "RECOVERY",
      status: "SIMULATED",
      description: `Recovery completed at security epoch ${nextEpoch}. Signer replaced, ${cancelled} pending withdrawal(s) cancelled. Simulated chain execution.`,
      source: "SIMULATED",
      simulationRef: `REC-${proposal.reference}`,
      incidentId: proposal.incidentId,
      createdAt: now,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "recovery_completed",
      title: "Vault restored",
      body: `The previous signer was revoked and the security epoch advanced to ${nextEpoch}. Old withdrawals are invalid.`,
      severity: "SUCCESS",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: replacement,
      action: "RECOVERY_EXECUTED",
      detail: `Signer ${proposal.replacedAddress} revoked; ${replacement} armed; epoch ${nextEpoch}; ${cancelled} pending withdrawals cancelled; pending policies invalidated.`,
    });
    return { state: "RESTORED" as const, securityEpoch: nextEpoch };
  },
});

/** Retention shim for older UI code; owner cancellation only. */
export const reject = mutation({
  args: {
    vaultId: v.id("vaults"),
    proposalId: v.id("recoveryProposals"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if ((proposal.initiatedBy ?? "OWNER") !== "OWNER") {
      throw new Error(
        "A guardian-initiated proposal cannot be rejected by the owner. Two guardians must cancel it.",
      );
    }
    if (proposal.status === "COMPLETED") {
      throw new Error("Completed recovery cannot be rejected.");
    }
    await ctx.db.patch(proposal._id, {
      status: "REJECTED",
      rejectionReason: args.reason.slice(0, 300),
    });
    await ctx.db.patch(vault._id, {
      state: proposal.priorState ?? "NORMAL",
      stateSource: "SIMULATED",
      stateUpdatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "RECOVERY_REJECTED",
      detail: `Proposal ${proposal.reference} rejected: ${args.reason.slice(0, 200)}`,
    });
  },
});

export type RecoveryProposalId = Id<"recoveryProposals">;
export { getPrimaryWallet };
