import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export async function userIdOrNull(ctx: Ctx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in is required for this action.");
  }
  return userId;
}

/**
 * Ownership is always resolved from the session, never from a client-supplied
 * user id. A vault id on its own grants nothing.
 */
export async function requireVaultOwner(
  ctx: Ctx,
  vaultId: Id<"vaults">,
): Promise<{ userId: Id<"users">; vault: Doc<"vaults"> }> {
  const userId = await requireUserId(ctx);
  const vault = await ctx.db.get(vaultId);
  if (!vault || vault.userId !== userId) {
    throw new Error("Vault not found or you do not have access to it.");
  }
  return { userId, vault };
}

export async function getPrimaryWallet(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"walletIdentities"> | null> {
  const wallets = await ctx.db
    .query("walletIdentities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const active = wallets.filter((wallet) => wallet.revokedAt === undefined);
  return active.find((wallet) => wallet.isPrimary) ?? active[0] ?? null;
}

export async function getVaultForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"vaults"> | null> {
  return await ctx.db
    .query("vaults")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    vaultId?: Id<"vaults">;
    category: string;
    title: string;
    body: string;
    severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  },
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("notifications", {
    userId: args.userId,
    vaultId: args.vaultId,
    category: args.category,
    title: args.title,
    body: args.body,
    severity: args.severity,
    createdAt: now,
    channel: "IN_APP",
    // In-app notifications are visible the moment the row exists, so delivery
    // is confirmed synchronously. External channels would stay undelivered
    // until a provider callback.
    deliveredAt: now,
  });
}

/** Append-only audit trail. Never updated or deleted by application code. */
export async function audit(
  ctx: MutationCtx,
  args: {
    userId?: Id<"users">;
    vaultId?: Id<"vaults">;
    actorAddress?: string;
    action: string;
    detail: string;
  },
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    userId: args.userId,
    vaultId: args.vaultId,
    actorAddress: args.actorAddress,
    action: args.action,
    detail: args.detail,
    createdAt: Date.now(),
  });
}

export async function recordVaultTransaction(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    kind: "DEPOSIT" | "WITHDRAWAL" | "SECURITY" | "RECOVERY";
    symbol?: string;
    amount?: string;
    status: string;
    description: string;
    source: "ONCHAIN" | "SIMULATED";
    simulationRef?: string;
    incidentId?: Id<"incidents">;
    txHash?: string;
  },
): Promise<void> {
  await ctx.db.insert("vaultTransactions", {
    ...args,
    createdAt: Date.now(),
  });
}

export async function getMonitorCheckpoint(
  ctx: Ctx,
  network: string,
): Promise<Doc<"monitorCheckpoints"> | null> {
  return await ctx.db
    .query("monitorCheckpoints")
    .withIndex("by_network", (q) => q.eq("network", network))
    .first();
}
