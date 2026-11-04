import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  audit,
  getMonitorCheckpoint,
  getPrimaryWallet,
  getVaultForUser,
  notify,
  recordVaultTransaction,
  requireUserId,
} from "./db";
import {
  DEFAULT_POLICY,
  NONCE_NETWORK,
  SUPPORTED_ASSETS,
  randomHex,
  simulationRef,
} from "./shared";

/**
 * Populates a sandbox vault so the whole lifecycle can be demonstrated without
 * a wallet extension or an RPC endpoint. Every row it creates is marked
 * simulated, and no transaction hash is invented.
 */
export const seedDemoVault = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const wallet = await getPrimaryWallet(ctx, userId);
    if (!wallet) {
      throw new Error("Attach a wallet before loading the demo vault.");
    }
    const existing = await getVaultForUser(ctx, userId);
    if (existing && (existing.state === "LOCKDOWN" || existing.state === "RECOVERY")) {
      throw new Error(
        "This vault is locked down. Complete recovery before loading demo data again.",
      );
    }
    const now = Date.now();
    let vaultId: Id<"vaults">;

    if (existing) {
      vaultId = existing._id;
    } else {
      vaultId = await ctx.db.insert("vaults", {
        userId,
        name: "NONCE Demo Vault",
        network: NONCE_NETWORK.id,
        chainId: NONCE_NETWORK.chainId,
        mode: "DEMO",
        contractVersion: "nonce-vault 0.1.0-demo",
        deploymentStatus: "SIMULATED",
        ownerSigner: wallet.address,
        state: "NORMAL",
        stateSource: "SIMULATED",
        stateUpdatedAt: now,
        monitoringEnabled: true,
        createdAt: now,
        activatedAt: now,
        lastSyncedAt: now,
      });
      for (const asset of SUPPORTED_ASSETS) {
        await ctx.db.insert("vaultAssets", {
          vaultId,
          symbol: asset.symbol,
          name: asset.name,
          kind: asset.kind,
          chainId: NONCE_NETWORK.chainId,
          decimals: asset.decimals,
          balance: "0",
          supported: true,
        });
      }
      await ctx.db.insert("withdrawalPolicies", {
        vaultId,
        maxPerTransaction: DEFAULT_POLICY.maxPerTransaction,
        delayMinutes: DEFAULT_POLICY.delayMinutes,
        largeWithdrawalThreshold: DEFAULT_POLICY.largeWithdrawalThreshold,
        guardianApprovalRequired: true,
        guardianThreshold: 2,
        allowlistOnly: false,
        allowlist: [],
        updatedAt: now,
        updatedBy: wallet.address,
      });
      await recordVaultTransaction(ctx, {
        vaultId,
        kind: "SECURITY",
        status: "SIMULATED",
        description:
          "Demo vault record created. No contract was deployed and no chain transaction exists.",
        source: "SIMULATED",
        simulationRef: simulationRef("DEPLOY"),
      });
    }

    const assets = await ctx.db
      .query("vaultAssets")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect();
    for (const asset of assets) {
      const target = asset.symbol === "ETH" ? "2.4" : "1250";
      if (asset.balance === "0") {
        await ctx.db.patch(asset._id, { balance: target });
        await recordVaultTransaction(ctx, {
          vaultId,
          kind: "DEPOSIT",
          symbol: asset.symbol,
          amount: target,
          status: "SIMULATED",
          description:
            "Demo ledger funding. These balances are not on-chain and have no transaction hash.",
          source: "SIMULATED",
          simulationRef: simulationRef("DEMO-FUND"),
        });
      }
    }

    const decoys = await ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect();
    if (decoys.length === 0) {
      for (let index = 1; index <= 3; index += 1) {
        const decoyId = await ctx.db.insert("decoys", {
          vaultId,
          label: `Decoy #${index}`,
          address: `0x${randomHex(20)}`,
          status: "ACTIVE",
          riskLevel: "LOW",
          signalCount: 0,
          lastCheckedAt: now,
          createdAt: now,
        });
        await ctx.db.insert("decoyPolicies", {
          decoyId,
          vaultId,
          monitorSignedTx: true,
          monitorNonceChanges: true,
          monitorContractCalls: true,
          cooldownMinutes: 5,
          updatedAt: now,
        });
      }
    }

    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect();
    if (guardians.length === 0) {
      for (let index = 1; index <= 3; index += 1) {
        await ctx.db.insert("guardians", {
          vaultId,
          label: `Guardian ${index}`,
          address: `0x${randomHex(20)}`,
          status: "CONFIRMED",
          approvalMode: "SIMULATED",
          invitedAt: now,
          confirmedAt: now,
        });
      }
    }

    await ctx.db.patch(vaultId, {
      monitoringEnabled: true,
      activatedAt: existing?.activatedAt ?? now,
      lastSyncedAt: now,
    });

    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    if (!checkpoint) {
      await ctx.db.insert("monitorCheckpoints", {
        network: NONCE_NETWORK.id,
        chainId: NONCE_NETWORK.chainId,
        workerId: "sandbox-monitor-01",
        lastProcessedBlock: 24_100_000,
        lastProcessedBlockHash: `sim-${simulationRef("BLOCK").toLowerCase()}`,
        lastProcessedAt: now,
        health: "ACTIVE",
        lagBlocks: 0,
        consecutiveFailures: 0,
        updatedAt: now,
      });
    }

    const services = await ctx.db.query("systemHealth").collect();
    if (services.length === 0) {
      await ctx.db.insert("systemHealth", {
        network: NONCE_NETWORK.id,
        chainId: NONCE_NETWORK.chainId,
        service: "event-watcher",
        status: "ACTIVE",
        detail:
          "Sandbox detector running in-app. No RPC endpoint is configured, so no chain data is read.",
        lastProcessedBlock: checkpoint?.lastProcessedBlock ?? 24_100_000,
        checkedAt: now,
      });
      await ctx.db.insert("systemHealth", {
        network: NONCE_NETWORK.id,
        chainId: NONCE_NETWORK.chainId,
        service: "vault-indexer",
        status: "ACTIVE",
        detail:
          "Simulated vault state index in Convex. On-chain reconciliation is not configured.",
        lastProcessedBlock: checkpoint?.lastProcessedBlock ?? 24_100_000,
        checkedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      vaultId,
      actorAddress: wallet.address,
      action: "DEMO_SEEDED",
      detail:
        "Demo vault provisioned with simulated balances, three decoys and three confirmed sandbox guardians.",
    });
    await notify(ctx, {
      userId,
      vaultId,
      category: "demo_seeded",
      title: "Demo environment ready",
      body: "Balances, decoys and guardians are sandbox data. Trigger a decoy signal from Protection to watch the incident pipeline.",
      severity: "INFO",
    });
    return { vaultId, simulated: true as const };
  },
});
