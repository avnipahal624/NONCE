import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  audit,
  getMonitorCheckpoint,
  getPrimaryWallet,
  getVaultForUser,
  notify,
  recordVaultTransaction,
  requireUserId,
  requireVaultOwner,
  userIdOrNull,
} from "./db";
import {
  DEFAULT_POLICY,
  NONCE_NETWORK,
  REQUIRED_DECOYS,
  REQUIRED_GUARDIANS,
  addUnits,
  compareUnits,
  isZeroAmount,
  parseUnits,
  riskWeight,
  simulationRef,
  SUPPORTED_ASSETS,
} from "./shared";
import type { VaultState } from "../schema";

type ChecklistStatus = "OK" | "PENDING" | "MISSING" | "WARN" | "BLOCKED";

type ChecklistItem = {
  key: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
};

function buildProtection(args: {
  vault: Doc<"vaults"> | null;
  wallet: Doc<"walletIdentities"> | null;
  decoys: Doc<"decoys">[];
  guardians: Doc<"guardians">[];
  policy: Doc<"withdrawalPolicies"> | null;
  monitoringStatus: "ACTIVE" | "DEGRADED" | "OFFLINE";
}) {
  const { vault, wallet, decoys, guardians, policy, monitoringStatus } = args;
  if (!vault) {
    return {
      level: "UNCONFIGURED" as const,
      score: 0,
      label: "No vault yet",
      summary: "Create a vault to start configuring protection.",
      checklist: [] as ChecklistItem[],
      mandatoryMet: false,
      ownershipVerified: false,
    };
  }

  const activeDecoys = decoys.filter((decoy) => decoy.status === "ACTIVE");
  const confirmedGuardians = guardians.filter(
    (guardian) => guardian.status === "CONFIRMED",
  );
  const ownershipVerified = wallet?.verification === "SIGNATURE";

  const checklist: ChecklistItem[] = [
    {
      key: "wallet",
      label: "Wallet ownership",
      status: ownershipVerified ? "OK" : "WARN",
      detail: ownershipVerified
        ? "Proven by signature over a server-issued nonce."
        : "Demo signer attached. Ownership was not proven by a wallet signature.",
    },
    {
      key: "decoy",
      label: "Decoy sensors",
      status: activeDecoys.length >= REQUIRED_DECOYS ? "OK" : "MISSING",
      detail: `${activeDecoys.length} of ${REQUIRED_DECOYS} required decoys monitoring.`,
    },
    {
      key: "guardians",
      label: "Guardian recovery",
      status:
        confirmedGuardians.length >= REQUIRED_GUARDIANS ? "OK" : "MISSING",
      detail: `${confirmedGuardians.length} of ${REQUIRED_GUARDIANS} guardians confirmed.`,
    },
    {
      key: "withdrawal",
      label: "Withdrawal policy",
      status: policy && policy.delayMinutes > 0 ? "OK" : "MISSING",
      detail: policy
        ? `Delays above ${policy.largeWithdrawalThreshold} ETH held for ${policy.delayMinutes} minutes.`
        : "No withdrawal policy has been set.",
    },
    {
      key: "monitoring",
      label: "Monitoring health",
      status:
        monitoringStatus === "ACTIVE"
          ? "OK"
          : monitoringStatus === "DEGRADED"
            ? "WARN"
            : "BLOCKED",
      detail:
        monitoringStatus === "ACTIVE"
          ? vault.mode === "DEMO"
            ? "Simulated monitor is running. No RPC watcher is configured."
            : "Chain watcher is processing blocks."
          : `Monitoring is ${monitoringStatus.toLowerCase()}. On-chain withdrawal delays still apply.`,
    },
  ];

  const mandatory = checklist.filter((item) => item.key !== "wallet");
  const mandatoryMet = mandatory.every((item) => item.status === "OK");
  const score = Math.round(
    (checklist.filter((item) => item.status === "OK").length / checklist.length) *
      100,
  );

  let level:
    | "PROTECTED"
    | "PARTIAL"
    | "AT_RISK"
    | "LOCKDOWN"
    | "RECOVERY"
    | "UNCONFIGURED" = "PARTIAL";
  let label = "Partially configured";
  let summary =
    "Some mandatory safeguards are still missing. Assets in the vault keep their existing on-chain withdrawal rules.";

  if (vault.state === "LOCKDOWN") {
    level = "LOCKDOWN";
    label = "Locked down";
    summary =
      "Ordinary withdrawals are blocked. Recovery needs two of three guardians.";
  } else if (vault.state === "RECOVERY") {
    level = "RECOVERY";
    label = "Recovery in progress";
    summary =
      "Guardian recovery is active. Normal withdrawals stay blocked until permissions are replaced.";
  } else if (mandatoryMet && ownershipVerified) {
    level = "PROTECTED";
    label = "Protected";
    summary =
      vault.mode === "DEMO"
        ? "Every safeguard is configured in demo mode. Protection is simulated, not enforced on-chain."
        : "All configured safeguards are active and monitoring is healthy.";
  } else if (!mandatoryMet) {
    level = monitoringStatus === "OFFLINE" ? "AT_RISK" : "PARTIAL";
    label = monitoringStatus === "OFFLINE" ? "Degraded" : "Partially configured";
  }

  return { level, score, label, summary, checklist, mandatoryMet, ownershipVerified };
}

export const workspace = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const account = await ctx.db.get(userId);
    const vault = await getVaultForUser(ctx, userId);
    const wallet = await getPrimaryWallet(ctx, userId);

    const wallets = (
      await ctx.db
        .query("walletIdentities")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    )
      .filter((entry) => entry.revokedAt === undefined)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    if (!vault) {
      return {
        account: {
          displayName: account?.displayName ?? account?.name ?? null,
          email: account?.email ?? null,
          isAnonymous: account?.isAnonymous ?? false,
        },
        wallet,
        wallets,
        vault: null,
        assets: [] as Doc<"vaultAssets">[],
        policy: null,
        decoys: [] as Doc<"decoys">[],
        guardians: [] as Doc<"guardians">[],
        monitoring: null,
        protection: buildProtection({
          vault: null,
          wallet,
          decoys: [],
          guardians: [],
          policy: null,
          monitoringStatus: "OFFLINE",
        }),
        activeIncident: null,
        pendingWithdrawals: [] as Doc<"withdrawalRequests">[],
        recentActivity: [] as Doc<"vaultTransactions">[],
        unreadNotifications: 0,
      };
    }

    const assets = await ctx.db
      .query("vaultAssets")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    const decoys = await ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    const monitoringStatus = checkpoint?.health ?? "OFFLINE";

    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);
    const activeIncident =
      incidents.find(
        (incident) =>
          incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
      ) ?? null;

    const withdrawals = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(25);
    const pendingWithdrawals = withdrawals.filter((request) =>
      ["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status),
    );

    const recentActivity = await ctx.db
      .query("vaultTransactions")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(8);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const unreadNotifications = notifications.filter(
      (entry) => entry.readAt === undefined,
    ).length;

    return {
      account: {
        displayName: account?.displayName ?? account?.name ?? null,
        email: account?.email ?? null,
        isAnonymous: account?.isAnonymous ?? false,
      },
      wallet,
      wallets,
      vault,
      assets,
      policy,
      decoys,
      guardians,
      monitoring: checkpoint
        ? {
            status: checkpoint.health,
            lastProcessedBlock: checkpoint.lastProcessedBlock,
            lastProcessedAt: checkpoint.lastProcessedAt,
            lagBlocks: checkpoint.lagBlocks,
            network: checkpoint.network,
          }
        : null,
      protection: buildProtection({
        vault,
        wallet,
        decoys,
        guardians,
        policy,
        monitoringStatus,
      }),
      activeIncident,
      pendingWithdrawals,
      recentActivity,
      unreadNotifications,
    };
  },
});

export const protection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const vault = await getVaultForUser(ctx, userId);
    const wallet = await getPrimaryWallet(ctx, userId);
    if (!vault) {
      return buildProtection({
        vault: null,
        wallet,
        decoys: [],
        guardians: [],
        policy: null,
        monitoringStatus: "OFFLINE",
      });
    }
    const decoys = await ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    return buildProtection({
      vault,
      wallet,
      decoys,
      guardians,
      policy,
      monitoringStatus: checkpoint?.health ?? "OFFLINE",
    });
  },
});

/**
 * Creates a vault in the sandbox. `deploymentStatus: SIMULATED` is permanent
 * for this mode: the UI never presents it as a deployed contract.
 */
export const createDemoVault = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await getVaultForUser(ctx, userId);
    if (existing) {
      throw new Error("You already have a vault on this account.");
    }
    const wallet = await getPrimaryWallet(ctx, userId);
    if (!wallet) {
      throw new Error("Attach a wallet before creating a vault.");
    }
    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      name: (args.name ?? "My NONCE Vault").slice(0, 60),
      network: NONCE_NETWORK.id,
      chainId: NONCE_NETWORK.chainId,
      mode: "DEMO",
      contractVersion: "nonce-vault 0.1.0-demo",
      deploymentStatus: "SIMULATED",
      ownerSigner: wallet.address,
      state: "NORMAL",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
      monitoringEnabled: false,
      createdAt: now,
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
      guardianApprovalRequired: DEFAULT_POLICY.guardianApprovalRequired,
      guardianThreshold: DEFAULT_POLICY.guardianThreshold,
      allowlistOnly: DEFAULT_POLICY.allowlistOnly,
      allowlist: [],
      updatedAt: now,
      updatedBy: wallet.address,
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

    await recordVaultTransaction(ctx, {
      vaultId,
      kind: "SECURITY",
      status: "SIMULATED",
      description:
        "Vault record created in sandbox mode. No contract was deployed and no chain transaction was submitted.",
      source: "SIMULATED",
      simulationRef: simulationRef("DEPLOY"),
    });
    await audit(ctx, {
      userId,
      vaultId,
      actorAddress: wallet.address,
      action: "VAULT_CREATED",
      detail: `Sandbox vault created on ${NONCE_NETWORK.label} (chain ${NONCE_NETWORK.chainId}) in DEMO mode. Deployment is simulated.`,
    });
    await notify(ctx, {
      userId,
      vaultId,
      category: "vault_created",
      title: "Sandbox vault created",
      body: "Your vault starts unprotected. Complete the security checklist before relying on it.",
      severity: "INFO",
    });
    return vaultId;
  },
});

export const rename = mutation({
  args: { vaultId: v.id("vaults"), name: v.string() },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const name = args.name.trim().slice(0, 60);
    if (name.length < 2) throw new Error("Vault name is too short.");
    await ctx.db.patch(vault._id, { name });
    await audit(ctx, {
      userId,
      vaultId: args.vaultId,
      action: "VAULT_RENAMED",
      detail: `Vault renamed to "${name}".`,
    });
  },
});

/**
 * Sandbox funding. There is no RPC connection in demo mode, so this explicitly
 * records a simulated balance rather than pretending a deposit was mined.
 */
export const fundDemoAsset = mutation({
  args: {
    vaultId: v.id("vaults"),
    symbol: v.string(),
    amount: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Demo funding is only available on sandbox vaults.");
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error(
        "The vault is locked down. Deposits cannot be simulated while recovery is pending.",
      );
    }
    const asset = await ctx.db
      .query("vaultAssets")
      .withIndex("by_vault_symbol", (q) =>
        q.eq("vaultId", vault._id).eq("symbol", args.symbol),
      )
      .first();
    if (!asset || !asset.supported) {
      throw new Error(
        "That asset is not supported by this vault. Use the supported test assets only.",
      );
    }
    if (isZeroAmount(args.amount, asset.decimals)) {
      throw new Error("Enter an amount greater than zero.");
    }
    const cap = parseUnits(
      args.symbol === "ETH" ? "10" : "25000",
      asset.decimals,
    );
    if (parseUnits(args.amount, asset.decimals) > cap) {
      throw new Error("Sandbox funding is capped. Use a smaller amount.");
    }
    const balance = addUnits(asset.balance, args.amount, asset.decimals);
    await ctx.db.patch(asset._id, { balance });
    const ref = simulationRef("DEPOSIT");
    await ctx.db.patch(vault._id, { lastSyncedAt: Date.now() });
    await recordVaultTransaction(ctx, {
      vaultId: vault._id,
      kind: "DEPOSIT",
      symbol: asset.symbol,
      amount: args.amount,
      status: "SIMULATED",
      description:
        "Simulated sandbox deposit. Balances are not on-chain and no transaction hash exists.",
      source: "SIMULATED",
      simulationRef: ref,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "DEMO_DEPOSIT",
      detail: `Simulated deposit of ${args.amount} ${asset.symbol} (${ref}).`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "deposit_simulated",
      title: "Sandbox balance updated",
      body: `${args.amount} ${asset.symbol} was added to the demo ledger. This is not an on-chain deposit.`,
      severity: "INFO",
    });
    return { balance, ref };
  },
});

/**
 * Refreshes sandbox monitoring metadata. In LIVE mode this is where an RPC
 * reconciliation worker would be invoked; without one, the mutation refuses to
 * report a successful chain sync.
 */
export const sync = mutation({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("No RPC watcher is configured, so a live sync cannot be claimed.");
    }
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    if (!checkpoint) throw new Error("Monitor checkpoint missing.");
    const now = Date.now();
    await ctx.db.patch(checkpoint._id, {
      lastProcessedAt: now,
      updatedAt: now,
      lagBlocks: 0,
      health: "ACTIVE",
    });
    await ctx.db.patch(vault._id, { lastSyncedAt: now });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "SANDBOX_SYNC",
      detail: "Sandbox monitor heartbeat refreshed. No chain data was read.",
    });
    return { syncedAt: now };
  },
});

export function vaultStateTone(state: VaultState): "safe" | "warn" | "danger" {
  if (state === "NORMAL" || state === "RESTORED") return "safe";
  if (state === "RESTRICTED" || state === "RECOVERY") return "warn";
  return "danger";
}

export type { ChecklistItem, ChecklistStatus };
export type VaultDoc = Doc<"vaults">;
export type AssetDoc = Doc<"vaultAssets">;
export type GuardianDoc = Doc<"guardians">;
export type DecoyDoc = Doc<"decoys">;
export type PolicyDoc = Doc<"withdrawalPolicies">;
export type WithdrawalDoc = Doc<"withdrawalRequests">;
export type VaultId = Id<"vaults">;
export { compareUnits, riskWeight };
