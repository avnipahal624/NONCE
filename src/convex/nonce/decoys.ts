import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { audit, notify, requireVaultOwner, userIdOrNull, getVaultForUser } from "./db";
import {
  NONCE_NETWORK,
  REQUIRED_DECOYS,
  isValidAddress,
  normalizeAddress,
  randomHex,
  simulationRef,
} from "./shared";

const MAX_DECOYS = 4;

function sandboxAddress(): string {
  return `0x${randomHex(20)}`;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return [];
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return [];
    const decoys = await ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    return await Promise.all(
      decoys.map(async (decoy) => {
        const policy = await ctx.db
          .query("decoyPolicies")
          .withIndex("by_decoy", (q) => q.eq("decoyId", decoy._id))
          .first();
        return { ...decoy, policy };
      }),
    );
  },
});

export const create = mutation({
  args: {
    vaultId: v.id("vaults"),
    label: v.string(),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const existing = await ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    if (existing.length >= MAX_DECOYS) {
      throw new Error(
        `This vault already has ${MAX_DECOYS} decoys. Pause one before adding another.`,
      );
    }
    const label = args.label.trim().slice(0, 40) || `Decoy ${existing.length + 1}`;
    let address: string;
    if (args.address && args.address.trim().length > 0) {
      if (!isValidAddress(args.address)) {
        throw new Error("Enter a valid EVM address for the decoy, or leave it blank.");
      }
      address = normalizeAddress(args.address);
    } else {
      if (vault.mode !== "DEMO") {
        throw new Error(
          "Live decoys must be generated outside NONCE and registered by address. NONCE never holds decoy keys.",
        );
      }
      address = sandboxAddress();
    }
    if (existing.some((decoy) => decoy.address === address)) {
      throw new Error("That address is already registered as a decoy.");
    }
    if (normalizeAddress(vault.ownerSigner) === address) {
      throw new Error("A decoy cannot be your vault signer.");
    }
    const now = Date.now();
    const decoyId = await ctx.db.insert("decoys", {
      vaultId: vault._id,
      label,
      address,
      status: "ACTIVE",
      riskLevel: "LOW",
      signalCount: 0,
      lastCheckedAt: now,
      createdAt: now,
    });
    await ctx.db.insert("decoyPolicies", {
      decoyId,
      vaultId: vault._id,
      monitorSignedTx: true,
      monitorNonceChanges: true,
      monitorContractCalls: true,
      cooldownMinutes: 5,
      updatedAt: now,
    });

    const activeCount = existing.filter((decoy) => decoy.status === "ACTIVE").length + 1;
    if (activeCount >= REQUIRED_DECOYS) {
      await ctx.db.patch(vault._id, { monitoringEnabled: true });
    }

    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "DECOY_REGISTERED",
      detail:
        vault.mode === "DEMO"
          ? `Sandbox decoy ${label} (${address}) registered. No private key exists for this sandbox address; monitoring is simulated.`
          : `Decoy ${label} (${address}) registered for monitoring.`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "decoy_added",
      title: `${label} is now monitoring`,
      body:
        "Decoys act like alarms. Unexpected use of this address raises a security signal.",
      severity: "INFO",
    });
    return { decoyId, address, simulationRef: simulationRef("DECOY") };
  },
});

export const setStatus = mutation({
  args: {
    vaultId: v.id("vaults"),
    decoyId: v.id("decoys"),
    status: v.union(v.literal("ACTIVE"), v.literal("PAUSED")),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const decoy = await ctx.db.get(args.decoyId);
    if (!decoy || decoy.vaultId !== vault._id) {
      throw new Error("Decoy not found on this vault.");
    }
    if (vault.state === "LOCKDOWN" && args.status === "ACTIVE") {
      throw new Error("Decoys stay paused or active as configured during lockdown.");
    }
    await ctx.db.patch(decoy._id, {
      status: args.status,
      lastCheckedAt: Date.now(),
    });
    const active = (
      await ctx.db
        .query("decoys")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect()
    ).filter((entry) => entry.status === "ACTIVE").length;
    await ctx.db.patch(vault._id, { monitoringEnabled: active > 0 });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: args.status === "ACTIVE" ? "DECOY_ACTIVATED" : "DECOY_PAUSED",
      detail: `${decoy.label} ${args.status === "ACTIVE" ? "resumed" : "paused"} monitoring.`,
    });
  },
});

export const updatePolicy = mutation({
  args: {
    vaultId: v.id("vaults"),
    decoyId: v.id("decoys"),
    monitorSignedTx: v.boolean(),
    monitorNonceChanges: v.boolean(),
    monitorContractCalls: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const decoy = await ctx.db.get(args.decoyId);
    if (!decoy || decoy.vaultId !== vault._id) {
      throw new Error("Decoy not found on this vault.");
    }
    const policy = await ctx.db
      .query("decoyPolicies")
      .withIndex("by_decoy", (q) => q.eq("decoyId", decoy._id))
      .first();
    if (!policy) throw new Error("Decoy policy missing.");
    if (
      !args.monitorSignedTx &&
      !args.monitorNonceChanges &&
      !args.monitorContractCalls
    ) {
      throw new Error(
        "At least one detection condition must stay enabled, otherwise the decoy is a mute alarm.",
      );
    }
    await ctx.db.patch(policy._id, {
      monitorSignedTx: args.monitorSignedTx,
      monitorNonceChanges: args.monitorNonceChanges,
      monitorContractCalls: args.monitorContractCalls,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "DECOY_POLICY_UPDATED",
      detail: `Detection conditions for ${decoy.label}: signed=${args.monitorSignedTx}, nonce=${args.monitorNonceChanges}, contractCalls=${args.monitorContractCalls}.`,
    });
  },
});

export type DecoyWithPolicy = Doc<"decoys"> & {
  policy: Doc<"decoyPolicies"> | null;
};
export { NONCE_NETWORK };
