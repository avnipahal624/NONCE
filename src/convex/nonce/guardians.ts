import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { audit, notify, requireVaultOwner, userIdOrNull, getVaultForUser } from "./db";
import { GUARDIAN_THRESHOLD, REQUIRED_GUARDIANS, isValidAddress, normalizeAddress } from "./shared";

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
    return {
      threshold: GUARDIAN_THRESHOLD,
      required: REQUIRED_GUARDIANS,
      guardians: guardians.filter((guardian) => guardian.status !== "REMOVED"),
    };
  },
});

export const add = mutation({
  args: {
    vaultId: v.id("vaults"),
    label: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error(
        "Guardian settings are frozen while the vault is locked down. Complete recovery first.",
      );
    }
    if (!isValidAddress(args.address)) {
      throw new Error("Enter a valid EVM address for the guardian.");
    }
    const address = normalizeAddress(args.address);
    if (address === normalizeAddress(vault.ownerSigner)) {
      throw new Error("A guardian must be a different address from your vault signer.");
    }
    const existing = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const active = existing.filter((guardian) => guardian.status !== "REMOVED");
    if (active.length >= REQUIRED_GUARDIANS) {
      throw new Error(`This vault already has ${REQUIRED_GUARDIANS} guardians.`);
    }
    if (active.some((guardian) => guardian.address === address)) {
      throw new Error("That address is already a guardian.");
    }
    const label = args.label.trim().slice(0, 40) || `Guardian ${active.length + 1}`;
    const now = Date.now();
    const guardianId = await ctx.db.insert("guardians", {
      vaultId: vault._id,
      label,
      address,
      status: "INVITED",
      approvalMode: vault.mode === "DEMO" ? "SIMULATED" : "SIGNATURE",
      invitedAt: now,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "GUARDIAN_INVITED",
      detail:
        vault.mode === "DEMO"
          ? `${label} (${address}) added in sandbox mode. Confirmations are simulated and no guardian account exists.`
          : `${label} (${address}) invited as guardian.`,
    });
    return guardianId;
  },
});

/**
 * Sandbox confirmation. It is recorded as SIMULATED and shown that way in the
 * UI — a real guardian must confirm from their own verified wallet.
 */
export const confirm = mutation({
  args: { vaultId: v.id("vaults"), guardianId: v.id("guardians") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id) {
      throw new Error("Guardian not found on this vault.");
    }
    if (guardian.status === "CONFIRMED") return;
    if (vault.mode !== "DEMO") {
      throw new Error(
        "Live guardian confirmation requires a signed acceptance from the guardian wallet. That integration is not enabled in this build.",
      );
    }
    await ctx.db.patch(guardian._id, {
      status: "CONFIRMED",
      confirmedAt: Date.now(),
      approvalMode: "SIMULATED",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "GUARDIAN_CONFIRMED_SIMULATED",
      detail: `${guardian.label} marked confirmed in sandbox mode. No guardian signature was collected.`,
    });
    const confirmed = (
      await ctx.db
        .query("guardians")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect()
    ).filter((entry) => entry.status === "CONFIRMED").length;
    if (confirmed >= REQUIRED_GUARDIANS) {
      await notify(ctx, {
        userId,
        vaultId: vault._id,
        category: "guardians_ready",
        title: "Guardian recovery is ready",
        body: "Two of three guardian approvals are now required to replace a compromised signer.",
        severity: "SUCCESS",
      });
    }
  },
});

export const remove = mutation({
  args: { vaultId: v.id("vaults"), guardianId: v.id("guardians") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("Guardians cannot be changed during lockdown or recovery.");
    }
    const guardian = await ctx.db.get(args.guardianId);
    if (!guardian || guardian.vaultId !== vault._id) {
      throw new Error("Guardian not found on this vault.");
    }
    const approvals = await ctx.db
      .query("guardianApprovals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    if (approvals.some((approval) => approval.guardianId === guardian._id)) {
      throw new Error(
        "This guardian has signed a recovery approval. Their record stays for the audit trail.",
      );
    }
    await ctx.db.patch(guardian._id, { status: "REMOVED" });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "GUARDIAN_REMOVED",
      detail: `${guardian.label} (${guardian.address}) removed from the guardian set.`,
    });
  },
});
