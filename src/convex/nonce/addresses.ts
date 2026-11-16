import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { audit, requireVaultOwner } from "./db";
import { isValidAddress, normalizeAddress } from "./shared";

const MAX_ENTRIES = 50;

/** Owner-scoped recipient book. Addresses are public; labels are private. */
export const list = query({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const { vault } = await requireVaultOwner(ctx, args.vaultId);
    return await ctx.db
      .query("addressBookEntries")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
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
    const label = args.label.trim();
    if (label.length < 2 || label.length > 40) {
      throw new Error("Give the recipient a label between 2 and 40 characters.");
    }
    if (!isValidAddress(args.address)) {
      throw new Error("Enter a valid non-zero EVM address.");
    }
    const address = normalizeAddress(args.address);
    const existing = await ctx.db
      .query("addressBookEntries")
      .withIndex("by_vault_address", (q) =>
        q.eq("vaultId", vault._id).eq("address", address),
      )
      .first();
    if (existing) {
      throw new Error("That address is already saved in this vault’s address book.");
    }
    const entries = await ctx.db
      .query("addressBookEntries")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    if (entries.length >= MAX_ENTRIES) {
      throw new Error(`The address book is capped at ${MAX_ENTRIES} recipients.`);
    }
    const now = Date.now();
    const entryId = await ctx.db.insert("addressBookEntries", {
      userId,
      vaultId: vault._id,
      label,
      address,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "ADDRESS_BOOK_ENTRY_ADDED",
      detail: `Recipient "${label}" (${address}) added to the private address book.`,
    });
    return entryId;
  },
});

export const remove = mutation({
  args: { vaultId: v.id("vaults"), entryId: v.id("addressBookEntries") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.vaultId !== vault._id || entry.userId !== userId) {
      throw new Error("Address book entry not found.");
    }
    await ctx.db.delete(entry._id);
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "ADDRESS_BOOK_ENTRY_REMOVED",
      detail: `Recipient "${entry.label}" removed from the private address book.`,
    });
  },
});
