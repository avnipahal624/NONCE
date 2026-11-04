import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { audit, getPrimaryWallet, requireVaultOwner, userIdOrNull, getVaultForUser, notify } from "./db";
import { isValidAddress, normalizeAddress, randomHex, recoveryReference } from "./shared";
import { sha256Hex } from "./hash";
import type { Id } from "../_generated/dataModel";

const RECOVERY_DELAY_MS = 2 * 60 * 1000;

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
      guardianThreshold: 2,
      guardians: guardians.filter((guardian) => guardian.status !== "REMOVED"),
      proposals: withApprovals,
      recoveryDelayMinutes: RECOVERY_DELAY_MS / 60000,
    };
  },
});

export const createProposal = mutation({
  args: {
    vaultId: v.id("vaults"),
    replacementAddress: v.string(),
    incidentId: v.optional(v.id("incidents")),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state !== "LOCKDOWN" && vault.state !== "RECOVERY") {
      throw new Error(
        "Guardian recovery only starts after a confirmed lockdown. There is nothing to recover yet.",
      );
    }
    if (!isValidAddress(args.replacementAddress)) {
      throw new Error("Enter a valid replacement signer address.");
    }
    const replacement = normalizeAddress(args.replacementAddress);
    if (replacement === normalizeAddress(vault.ownerSigner)) {
      throw new Error("The replacement signer must be different from the compromised signer.");
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
        "Recovery needs three configured guardians so that two of three can approve. Add and confirm guardians before an incident.",
      );
    }
    if (guardians.some((guardian) => guardian.address === replacement)) {
      throw new Error("A guardian cannot become the vault signer. Keep the roles separate.");
    }
    const confirmedLockdown = await ctx.db
      .query("lockdownRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    if (!confirmedLockdown.some((request) => request.status === "CONFIRMED")) {
      throw new Error(
        "No confirmed lockdown was found on chain. Recovery cannot begin from an unconfirmed freeze.",
      );
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
    if (args.incidentId) {
      const incident = await ctx.db.get(args.incidentId);
      if (!incident || incident.vaultId !== vault._id) {
        throw new Error("Incident not found on this vault.");
      }
    }
    const now = Date.now();
    const proposalId = await ctx.db.insert("recoveryProposals", {
      vaultId: vault._id,
      incidentId: args.incidentId,
      reference: recoveryReference(),
      proposedByUserId: userId,
      replacedAddress: vault.ownerSigner,
      replacementAddress: replacement,
      status: "AWAITING_GUARDIANS",
      threshold: 2,
      approvalsCount: 0,
      nonce: randomHex(16),
      createdAt: now,
      executeAfter: now + RECOVERY_DELAY_MS,
    });
    await ctx.db.patch(vault._id, {
      state: "RECOVERY",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
    });
    if (args.incidentId) {
      await ctx.db.patch(args.incidentId, {
        status: "RECOVERY",
        responseStatus: "Guardian recovery in progress.",
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
      detail: `Replacement signer ${replacement} proposed; ${RECOVERY_DELAY_MS / 60000}-minute recovery delay started.`,
    });
    return proposalId;
  },
});

/**
 * Sandbox guardian approval. Recorded as SIMULATED with a bound message hash so
 * an approval can never be replayed against another proposal, vault or chain.
 */
export const simulateGuardianApproval = mutation({
  args: {
    vaultId: v.id("vaults"),
    proposalId: v.id("recoveryProposals"),
    guardianId: v.id("guardians"),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Live approvals must be signed by the guardian wallet.");
    }
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if (proposal.status !== "AWAITING_GUARDIANS") {
      throw new Error(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    if (proposal.executeAfter < Date.now() && proposal.approvalsCount >= proposal.threshold) {
      throw new Error("The recovery window already passed. Create a new proposal.");
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
      throw new Error("That approval signature was already used.");
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

export const execute = mutation({
  args: { vaultId: v.id("vaults"), proposalId: v.id("recoveryProposals") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Executing recovery requires a deployed vault signer. No live executor is configured in this build.",
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
    if (vault.state !== "LOCKDOWN" && vault.state !== "RECOVERY") {
      throw new Error("The vault is not in a recoverable state.");
    }
    const now = Date.now();

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
      (wallet) => wallet.address === proposal.replacementAddress && wallet.revokedAt === undefined,
    );
    if (replacementExisting) {
      await ctx.db.patch(replacementExisting._id, { isPrimary: true });
    } else {
      await ctx.db.insert("walletIdentities", {
        userId: vault.userId,
        address: proposal.replacementAddress,
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
      ownerSigner: proposal.replacementAddress,
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
          cancelReason: "Cancelled during guardian recovery.",
          finalizedAt: now,
        });
        cancelled += 1;
      }
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
      description: `Recovery completed. Signer replaced, ${cancelled} pending withdrawal(s) cleared. Simulated chain execution.`,
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
      body: "The compromised signer was revoked. Review your decoys and guardians before returning to normal use.",
      severity: "SUCCESS",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: proposal.replacementAddress,
      action: "RECOVERY_EXECUTED",
      detail: `Signer ${proposal.replacedAddress} revoked; ${proposal.replacementAddress} armed; ${cancelled} pending withdrawals cancelled.`,
    });
    return { state: "RESTORED" as const };
  },
});

export const reject = mutation({
  args: { vaultId: v.id("vaults"), proposalId: v.id("recoveryProposals"), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.vaultId !== vault._id) {
      throw new Error("Recovery proposal not found.");
    }
    if (proposal.status === "COMPLETED") {
      throw new Error("Completed recovery cannot be rejected.");
    }
    await ctx.db.patch(proposal._id, {
      status: "REJECTED",
      rejectionReason: args.reason.slice(0, 300),
    });
    if (vault.state === "RECOVERY") {
      await ctx.db.patch(vault._id, {
        state: "LOCKDOWN",
        stateSource: "SIMULATED",
        stateUpdatedAt: Date.now(),
      });
    }
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
