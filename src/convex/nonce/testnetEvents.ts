import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { userIdOrNull } from "./db";
import { readTestnetConfig } from "./testnetConfig";

/**
 * The demo monitor and the real Base Sepolia indexer must not share a
 * checkpoint: one is a synthetic block sequence, the other is RPC truth.
 */
export const TESTNET_INDEX_NETWORK = "base-sepolia-testnet";

const severityValidator = v.union(
  v.literal("INFO"),
  v.literal("WARNING"),
  v.literal("HIGH"),
  v.literal("CRITICAL"),
);

const alertValidator = v.object({
  severity: severityValidator,
  category: v.string(),
  reason: v.string(),
});

const indexedEventValidator = v.object({
  uniqueKey: v.string(),
  blockNumber: v.number(),
  blockHash: v.string(),
  txHash: v.string(),
  logIndex: v.number(),
  eventType: v.string(),
  payload: v.string(),
  alert: v.optional(alertValidator),
});

export const checkpoint = internalQuery({
  args: { network: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("monitorCheckpoints")
      .withIndex("by_network", (q) => q.eq("network", args.network))
      .first();
  },
});

/**
 * Removes logs from a reorged range. The next batch re-reads that range from
 * the canonical chain. Checkpoints are only advanced by recordBatch.
 */
export const rewind = internalMutation({
  args: {
    network: v.string(),
    fromBlock: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_network_block", (q) =>
        q.eq("network", args.network).gte("blockNumber", args.fromBlock),
      )
      .collect();

    let removed = 0;
    for (const event of events) {
      const alerts = await ctx.db
        .query("testnetAlerts")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const alert of alerts) {
        await ctx.db.delete(alert._id);
      }
      await ctx.db.delete(event._id);
      removed += 1;
    }
    return { removed };
  },
});

/**
 * Idempotent batch insertion. A unique key is chainId:contract:tx:logIndex, so
 * retries and overlapping ranges cannot duplicate a log or an alert.
 */
export const recordBatch = internalMutation({
  args: {
    network: v.string(),
    chainId: v.number(),
    contractAddress: v.string(),
    fromBlock: v.number(),
    toBlock: v.number(),
    blockHash: v.string(),
    finalized: v.boolean(),
    observedAt: v.number(),
    events: v.array(indexedEventValidator),
  },
  handler: async (ctx, args) => {
    const contractAddress = args.contractAddress.toLowerCase();
    let inserted = 0;
    let duplicates = 0;
    let alerts = 0;

    for (const event of args.events) {
      const existing = await ctx.db
        .query("blockchainEvents")
        .withIndex("by_unique_key", (q) => q.eq("uniqueKey", event.uniqueKey))
        .first();
      if (existing) {
        duplicates += 1;
        continue;
      }

      const eventId = await ctx.db.insert("blockchainEvents", {
        uniqueKey: event.uniqueKey,
        chainId: args.chainId,
        network: args.network,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        txHash: event.txHash,
        logIndex: event.logIndex,
        eventType: event.eventType,
        source: "ONCHAIN",
        address: contractAddress,
        observedAt: args.observedAt,
        finalized: args.finalized,
        evidenceHash: event.uniqueKey,
        payload: event.payload,
      });
      inserted += 1;

      if (event.alert) {
        const existingAlert = await ctx.db
          .query("testnetAlerts")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .first();
        if (!existingAlert) {
          await ctx.db.insert("testnetAlerts", {
            chainId: args.chainId,
            contractAddress,
            eventId,
            eventType: event.eventType,
            severity: event.alert.severity,
            category: event.alert.category,
            reason: event.alert.reason,
            txHash: event.txHash,
            blockNumber: event.blockNumber,
            createdAt: args.observedAt,
          });
          alerts += 1;
        }
      }
    }

    const current = await ctx.db
      .query("monitorCheckpoints")
      .withIndex("by_network", (q) => q.eq("network", args.network))
      .first();
    if (current) {
      await ctx.db.patch(current._id, {
        chainId: args.chainId,
        workerId: "convex-testnet-indexer",
        lastProcessedBlock: args.toBlock,
        lastProcessedBlockHash: args.blockHash,
        lastProcessedAt: args.observedAt,
        updatedAt: args.observedAt,
        health: "ACTIVE",
        lagBlocks: 0,
        consecutiveFailures: 0,
      });
    } else {
      await ctx.db.insert("monitorCheckpoints", {
        network: args.network,
        chainId: args.chainId,
        workerId: "convex-testnet-indexer",
        lastProcessedBlock: args.toBlock,
        lastProcessedBlockHash: args.blockHash,
        lastProcessedAt: args.observedAt,
        health: "ACTIVE",
        lagBlocks: 0,
        consecutiveFailures: 0,
        updatedAt: args.observedAt,
      });
    }

    const health = await ctx.db
      .query("systemHealth")
      .withIndex("by_service", (q) => q.eq("service", "testnet-indexer"))
      .first();
    const detail = `Indexed ${args.fromBlock}–${args.toBlock}; ${inserted} new log(s), ${duplicates} duplicate(s), ${alerts} alert(s).`;
    if (health) {
      await ctx.db.patch(health._id, {
        network: args.network,
        chainId: args.chainId,
        status: "ACTIVE",
        detail,
        lastProcessedBlock: args.toBlock,
        checkedAt: args.observedAt,
      });
    } else {
      await ctx.db.insert("systemHealth", {
        network: args.network,
        chainId: args.chainId,
        service: "testnet-indexer",
        status: "ACTIVE",
        detail,
        lastProcessedBlock: args.toBlock,
        checkedAt: args.observedAt,
      });
    }

    return { inserted, duplicates, alerts };
  },
});

/** Failed/retry bookkeeping: do not silently claim a healthy checkpoint. */
export const recordFailure = internalMutation({
  args: {
    network: v.string(),
    chainId: v.number(),
    message: v.string(),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("monitorCheckpoints")
      .withIndex("by_network", (q) => q.eq("network", args.network))
      .first();
    if (checkpoint) {
      await ctx.db.patch(checkpoint._id, {
        health: "DEGRADED",
        consecutiveFailures: checkpoint.consecutiveFailures + 1,
        updatedAt: args.observedAt,
      });
    }
    const health = await ctx.db
      .query("systemHealth")
      .withIndex("by_service", (q) => q.eq("service", "testnet-indexer"))
      .first();
    if (health) {
      await ctx.db.patch(health._id, {
        status: "DEGRADED",
        detail: args.message.slice(0, 500),
        checkedAt: args.observedAt,
      });
    } else {
      await ctx.db.insert("systemHealth", {
        network: args.network,
        chainId: args.chainId,
        service: "testnet-indexer",
        status: "DEGRADED",
        detail: args.message.slice(0, 500),
        lastProcessedBlock: checkpoint?.lastProcessedBlock ?? 0,
        checkedAt: args.observedAt,
      });
    }
  },
});

/**
 * Authenticated read. The testnet console is currently a single configured
 * contract, so every signed-in account sees the same chain facts. That is
 * documented as a known limitation, not presented as per-user ownership.
 */
export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) {
      return { configured: false, events: [], alerts: [], checkpoint: null };
    }
    const config = readTestnetConfig();
    const limit = Math.min(args.limit ?? 30, 80);
    if (!config.contractAddress) {
      return {
        configured: false,
        chainId: config.chainId,
        contractAddress: null,
        events: [],
        alerts: [],
        checkpoint: null,
        blockers: config.blockers,
      };
    }

    const address = config.contractAddress.toLowerCase();
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_network_block", (q) => q.eq("network", TESTNET_INDEX_NETWORK))
      .order("desc")
      .take(limit * 2);
    const alerts = await ctx.db
      .query("testnetAlerts")
      .withIndex("by_contract", (q) => q.eq("contractAddress", address))
      .order("desc")
      .take(limit);
    const checkpoint = await ctx.db
      .query("monitorCheckpoints")
      .withIndex("by_network", (q) => q.eq("network", TESTNET_INDEX_NETWORK))
      .first();

    return {
      configured: true,
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      events: events
        .filter((event) => event.address.toLowerCase() === address)
        .slice(0, limit)
        .map((event) => ({
          id: event._id as Id<"blockchainEvents">,
          eventType: event.eventType,
          blockNumber: event.blockNumber,
          blockHash: event.blockHash,
          txHash: event.txHash ?? null,
          logIndex: event.logIndex,
          observedAt: event.observedAt,
          finalized: event.finalized,
          payload: event.payload,
        })),
      alerts: alerts.map((alert) => ({
        id: alert._id,
        eventId: alert.eventId,
        eventType: alert.eventType,
        severity: alert.severity,
        category: alert.category,
        reason: alert.reason,
        txHash: alert.txHash ?? null,
        blockNumber: alert.blockNumber,
        createdAt: alert.createdAt,
      })),
      checkpoint: checkpoint
        ? {
            lastProcessedBlock: checkpoint.lastProcessedBlock,
            lastProcessedBlockHash: checkpoint.lastProcessedBlockHash,
            lastProcessedAt: checkpoint.lastProcessedAt,
            health: checkpoint.health,
            lagBlocks: checkpoint.lagBlocks,
            consecutiveFailures: checkpoint.consecutiveFailures,
          }
        : null,
      blockers: config.blockers,
    };
  },
});
