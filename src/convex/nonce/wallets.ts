import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { audit, requireUserId, userIdOrNull } from "./db";
import {
  NONCE_NETWORK,
  isValidAddress,
  normalizeAddress,
  randomHex,
} from "./shared";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function buildChallengeMessage(args: {
  domain: string;
  uri: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
    "Sign in to NONCE. This signature proves you control this wallet. It does not authorise any transaction, transfer or spending approval.",
    "",
    `URI: ${args.uri}`,
    "Version: 1",
    `Chain ID: ${args.chainId}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${args.issuedAt}`,
    `Expiration Time: ${args.expiresAt}`,
  ].join("\n");
}

function assertAllowedDomain(domain: string): void {
  if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(domain)) {
    throw new Error("Invalid signing domain.");
  }
  const configured = (process.env.NONCE_ALLOWED_DOMAINS ?? process.env.SITE_URL ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (configured.length === 0) return;
  const host = domain.split(":")[0];
  const allowed = configured.some((entry) => {
    const candidate = entry.replace(/^https?:\/\//, "").split("/")[0];
    return candidate.split(":")[0] === host;
  });
  if (!allowed) {
    throw new Error("This domain is not authorised to request NONCE signatures.");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return [];
    const wallets = await ctx.db
      .query("walletIdentities")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return wallets
      .filter((wallet) => wallet.revokedAt === undefined)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  },
});

export const createChallenge = mutation({
  args: {
    address: v.string(),
    chainId: v.number(),
    domain: v.string(),
    uri: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isValidAddress(args.address)) {
      throw new Error("Enter a valid EVM wallet address (0x + 40 hex characters).");
    }
    assertAllowedDomain(args.domain);
    const address = normalizeAddress(args.address);
    const now = Date.now();
    const expiresAt = now + CHALLENGE_TTL_MS;
    const nonce = randomHex(16);
    const message = buildChallengeMessage({
      domain: args.domain,
      uri: args.uri,
      address,
      chainId: args.chainId,
      nonce,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    });
    await ctx.db.insert("authChallenges", {
      userId,
      address,
      nonce,
      domain: args.domain,
      chainId: args.chainId,
      message,
      createdAt: now,
      expiresAt,
    });
    return { nonce, message, expiresAt, chainId: args.chainId };
  },
});

/**
 * Explicit demo path. It does NOT claim wallet ownership: the identity is
 * stored as DEMO_SIGNER, surfaced in the UI as unverified, and never used to
 * satisfy a real signature requirement.
 */
export const registerDemoSigner = mutation({
  args: { address: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isValidAddress(args.address)) {
      throw new Error("Enter a valid EVM address to use as a demo signer.");
    }
    const address = normalizeAddress(args.address);
    const existing = await ctx.db
      .query("walletIdentities")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const already = existing.find(
      (wallet) => wallet.address === address && wallet.revokedAt === undefined,
    );
    if (already) return already._id;

    for (const wallet of existing.filter((entry) => entry.isPrimary && !entry.revokedAt)) {
      await ctx.db.patch(wallet._id, { isPrimary: false });
    }
    const walletId = await ctx.db.insert("walletIdentities", {
      userId,
      address,
      chainId: NONCE_NETWORK.chainId,
      label: args.label ?? "Demo signer",
      verification: "DEMO_SIGNER",
      isPrimary: true,
      verifiedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      actorAddress: address,
      action: "WALLET_DEMO_SIGNER_ATTACHED",
      detail:
        "Demo signer added. Ownership was not proven by signature; this identity is labelled DEMO_SIGNER throughout the app.",
    });
    return walletId;
  },
});

async function setPrimaryFlags(
  ctx: MutationCtx,
  userId: Id<"users">,
  walletId: Id<"walletIdentities">,
): Promise<void> {
  const wallets = await ctx.db
    .query("walletIdentities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const wallet of wallets) {
    await ctx.db.patch(wallet._id, { isPrimary: wallet._id === walletId });
  }
}

export const setPrimaryWallet = mutation({
  args: { walletId: v.id("walletIdentities") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.userId !== userId || wallet.revokedAt !== undefined) {
      throw new Error("Wallet not found on this account.");
    }
    await setPrimaryFlags(ctx, userId, args.walletId);
    await audit(ctx, {
      userId,
      actorAddress: wallet.address,
      action: "WALLET_PRIMARY_CHANGED",
      detail: `Primary wallet set to ${wallet.address} (${wallet.verification}).`,
    });
  },
});

export const revokeWallet = mutation({
  args: { walletId: v.id("walletIdentities") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.userId !== userId) {
      throw new Error("Wallet not found on this account.");
    }
    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (vault && normalizeAddress(vault.ownerSigner) === wallet.address) {
      throw new Error(
        "This wallet signs for your vault. Use guardian recovery to replace a vault signer instead of removing it here.",
      );
    }
    await ctx.db.patch(wallet._id, {
      revokedAt: Date.now(),
      isPrimary: false,
    });
    await audit(ctx, {
      userId,
      actorAddress: wallet.address,
      action: "WALLET_REVOKED",
      detail: `Wallet ${wallet.address} removed from the account.`,
    });
  },
});

/** Used only by the Node action that verifies a real wallet signature. */
export const getChallenge = internalQuery({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("authChallenges")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
    if (!challenge) return null;
    const account = await ctx.db.get(challenge.userId);
    return { challenge, accountEmail: account?.email ?? null };
  },
});

export const consumeChallenge = internalMutation({
  args: {
    nonce: v.string(),
    address: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("authChallenges")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
    if (!challenge) throw new Error("Signature challenge not found.");
    if (challenge.usedAt !== undefined) {
      throw new Error("This signature challenge was already used.");
    }
    if (challenge.expiresAt < Date.now()) {
      throw new Error("This signature challenge expired. Request a new one.");
    }
    if (challenge.address !== normalizeAddress(args.address)) {
      throw new Error("Signed address does not match the challenge.");
    }
    await ctx.db.patch(challenge._id, { usedAt: Date.now() });

    const existing = await ctx.db
      .query("walletIdentities")
      .withIndex("by_user", (q) => q.eq("userId", challenge.userId))
      .collect();
    const match = existing.find(
      (wallet) => wallet.address === challenge.address && wallet.revokedAt === undefined,
    );
    for (const wallet of existing.filter((entry) => entry.isPrimary && !entry.revokedAt)) {
      await ctx.db.patch(wallet._id, { isPrimary: false });
    }
    let walletId: Id<"walletIdentities">;
    if (match) {
      await ctx.db.patch(match._id, {
        verification: "SIGNATURE",
        verifiedAt: Date.now(),
        isPrimary: true,
        chainId: challenge.chainId,
      });
      walletId = match._id;
    } else {
      walletId = await ctx.db.insert("walletIdentities", {
        userId: challenge.userId,
        address: challenge.address,
        chainId: challenge.chainId,
        verification: "SIGNATURE",
        isPrimary: true,
        verifiedAt: Date.now(),
      });
    }
    await audit(ctx, {
      userId: challenge.userId,
      actorAddress: challenge.address,
      action: "WALLET_SIGNATURE_VERIFIED",
      detail: `Wallet ownership proven by EIP-191 signature over a server nonce on chain ${challenge.chainId}.`,
    });
    return walletId;
  },
});

export type WalletIdentityView = Pick<
  Doc<"walletIdentities">,
  "address" | "chainId" | "verification" | "isPrimary" | "verifiedAt" | "label"
>;
