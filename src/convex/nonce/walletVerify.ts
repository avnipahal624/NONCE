"use node";

import { v } from "convex/values";
import { verifyMessage } from "viem";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

type ChallengeRecord = {
  challenge: Doc<"authChallenges">;
  accountEmail: string | null;
};

/**
 * Real wallet-ownership verification.
 *
 * The server built the exact EIP-4361 style message, stores it with a one-time
 * nonce and short expiry, and verifies the EIP-191 signature against the
 * address in that message. A connected address alone can never authenticate.
 */
export const verifySignature = action({
  args: { nonce: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<{ address: string; chainId: number }> => {
    if (!/^0x[0-9a-fA-F]{130}$/.test(args.signature)) {
      throw new Error("Wallet returned an unexpected signature format.");
    }
    const record: ChallengeRecord | null = await ctx.runQuery(
      internal.nonce.wallets.getChallenge,
      { nonce: args.nonce },
    );
    if (!record) throw new Error("Signature challenge not found.");
    const { challenge } = record;
    if (challenge.usedAt !== undefined) {
      throw new Error("This signature challenge was already used.");
    }
    if (challenge.expiresAt < Date.now()) {
      throw new Error("This signature challenge expired. Request a new one.");
    }

    const valid = await verifyMessage({
      address: challenge.address as `0x${string}`,
      message: challenge.message,
      signature: args.signature as `0x${string}`,
    });
    if (!valid) {
      throw new Error("Signature verification failed for this address.");
    }

    await ctx.runMutation(internal.nonce.wallets.consumeChallenge, {
      nonce: challenge.nonce,
      address: challenge.address,
      signature: args.signature,
    });
    return { address: challenge.address, chainId: challenge.chainId };
  },
});
