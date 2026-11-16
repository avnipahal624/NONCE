import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import {
  getMonitorCheckpoint,
  getPrimaryWallet,
  getVaultForUser,
  requireVaultOwner,
  userIdOrNull,
} from "./db";
import { policyForSymbol, rollingSpentUnits } from "./policyRules";
import { DEFAULT_POLICY, NONCE_NETWORK, formatUnits } from "./shared";
import { buildProtection } from "./vaults";
import {
  buildCopilotBrief,
  buildPassport,
  evaluateWithdrawal,
  maskAddress,
  type CopilotIncident,
} from "../../lib/intelligence";

type IncidentDoc = Doc<"incidents">;

function passportStatus(status: string): "PASS" | "WARN" | "FAIL" {
  return status === "OK" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
}

async function loadScopedContext(
  ctx: Parameters<typeof getVaultForUser>[0],
  userId: NonNullable<Awaited<ReturnType<typeof userIdOrNull>>>,
) {
  const vault = await getVaultForUser(ctx, userId);
  const wallet = await getPrimaryWallet(ctx, userId);
  if (!vault) {
    return { vault: null, wallet, decoys: [], guardians: [], policy: null, checkpoint: null };
  }
  const [decoys, guardians, policy] = await Promise.all([
    ctx.db
      .query("decoys")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect(),
    ctx.db
      .query("guardians")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect(),
    ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first(),
  ]);
  const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
  return { vault, wallet, decoys, guardians, policy, checkpoint };
}

function toCopilotIncident(
  incident: IncidentDoc,
  evidenceCount: number,
): CopilotIncident {
  return {
    id: incident._id,
    reference: incident.reference,
    title: incident.title,
    summary: incident.summary,
    status: incident.status,
    risk: incident.riskLevel,
    detectedAt: incident.detectedAt,
    evidenceCount,
  };
}

async function loadIncidents(
  ctx: Parameters<typeof getVaultForUser>[0],
  incidents: IncidentDoc[],
) {
  return await Promise.all(
    incidents.map(async (incident) => {
      const evidence = await ctx.db
        .query("incidentEvidence")
        .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
        .collect();
      return toCopilotIncident(incident, evidence.length);
    }),
  );
}

export const securityPassport = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const { vault, wallet, decoys, guardians, policy, checkpoint } =
      await loadScopedContext(ctx, userId);
    if (!vault) return { configured: false as const };

    const protection = buildProtection({
      vault,
      wallet,
      decoys,
      guardians,
      policy,
      monitoringStatus: checkpoint?.health ?? "OFFLINE",
    });
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);
    const activeIncident = incidents.find(
      (incident) =>
        incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
    );
    const checks = protection.checklist.map((item) => ({
      id: item.key,
      label: item.label,
      status: passportStatus(item.status),
      detail: item.detail,
    }));

    return {
      configured: true as const,
      passport: buildPassport({
        holder: wallet?.address ?? vault.ownerSigner,
        network: `${vault.network} · chain ${vault.chainId}`,
        contractVersion: vault.contractVersion,
        mode: vault.mode,
        deploymentStatus: vault.deploymentStatus,
        ownershipVerified: wallet?.verification === "SIGNATURE",
        guardianCount: guardians.filter((guardian) => guardian.status === "CONFIRMED")
          .length,
        guardianThreshold: policy?.guardianThreshold ?? 2,
        policyConfigured: Boolean(policy),
        monitoringStatus: checkpoint?.health ?? "OFFLINE",
        activeIncident: Boolean(activeIncident),
        lastSyncedAt: vault.lastSyncedAt,
        contractAddress: vault.contractAddress,
        checks,
      }),
      protection,
      contract: {
        address: vault.contractAddress ?? null,
        maskedAddress: maskAddress(vault.contractAddress),
        deploymentStatus: vault.deploymentStatus,
        version: vault.contractVersion,
      },
    };
  },
});

export const copilot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const { vault, wallet, decoys, guardians, policy, checkpoint } =
      await loadScopedContext(ctx, userId);
    if (!vault) return { configured: false as const };

    const [incidents, assets, addressBook, withdrawals] = await Promise.all([
      ctx.db
        .query("incidents")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .order("desc")
        .take(10),
      ctx.db
        .query("vaultAssets")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect(),
      ctx.db
        .query("addressBookEntries")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect(),
      ctx.db
        .query("withdrawalRequests")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect(),
    ]);
    const mappedIncidents = await loadIncidents(ctx, incidents);
    const mappedActive =
      mappedIncidents.find(
        (incident) =>
          incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
      ) ?? null;
    const protection = buildProtection({
      vault,
      wallet,
      decoys,
      guardians,
      policy,
      monitoringStatus: checkpoint?.health ?? "OFFLINE",
    });
    const confirmedGuardians = guardians.filter(
      (guardian) => guardian.status === "CONFIRMED",
    ).length;
    const brief = buildCopilotBrief({
      generatedAt: Date.now(),
      mode: vault.mode,
      vaultState: vault.state,
      protectionLabel: protection.label,
      protectionScore: protection.score,
      mandatoryMet: protection.mandatoryMet,
      ownershipVerified: wallet?.verification === "SIGNATURE",
      deploymentStatus: vault.deploymentStatus,
      contractVersion: vault.contractVersion,
      network: `${vault.network} · chain ${vault.chainId}`,
      guardianCount: confirmedGuardians,
      guardianThreshold: policy?.guardianThreshold ?? 2,
      monitoringStatus: checkpoint?.health ?? "OFFLINE",
      policyConfigured: Boolean(policy),
      activeIncident: mappedActive,
      incidents: mappedIncidents,
      pendingWithdrawals: withdrawals.filter((request) =>
        ["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status),
      ).length,
      assets: assets.map((asset) => ({
        symbol: asset.symbol,
        balance: asset.balance,
        supported: asset.supported,
      })),
      addressBookCount: addressBook.length,
    });

    return {
      configured: true as const,
      brief,
      scope: {
        vaultId: vault._id,
        mode: vault.mode,
        network: vault.network,
        chainId: vault.chainId,
        fields: [
          "vault state and deployment status",
          "withdrawal policy",
          "guardian confirmation state",
          "monitor health",
          "incident summaries and evidence counts",
          "asset balances and address-book count",
        ],
        excluded: ["email address", "session token", "private keys", "seed phrases", "raw RPC credentials"],
      },
    };
  },
});

export const financeOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const { vault, wallet, decoys, guardians, policy, checkpoint } =
      await loadScopedContext(ctx, userId);
    if (!vault) return { configured: false as const };
    const protection = buildProtection({
      vault,
      wallet,
      decoys,
      guardians,
      policy,
      monitoringStatus: checkpoint?.health ?? "OFFLINE",
    });

    const [assets, addressBook, payments, activity] = await Promise.all([
      ctx.db
        .query("vaultAssets")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect(),
      ctx.db
        .query("addressBookEntries")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect(),
      ctx.db
        .query("withdrawalRequests")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .order("desc")
        .take(30),
      ctx.db
        .query("vaultTransactions")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .order("desc")
        .take(60),
    ]);

    return {
      configured: true as const,
      vault: {
        id: vault._id,
        name: vault.name,
        mode: vault.mode,
        network: vault.network,
        chainId: vault.chainId,
        state: vault.state,
        deploymentStatus: vault.deploymentStatus,
        contractVersion: vault.contractVersion,
        lastSyncedAt: vault.lastSyncedAt,
      },
      assets,
      policy,
      addressBook,
      pendingPayments: payments.filter((request) =>
        ["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status),
      ),
      activity,
      monitoring: checkpoint
        ? {
            status: checkpoint.health,
            lastProcessedAt: checkpoint.lastProcessedAt,
            lagBlocks: checkpoint.lagBlocks,
          }
        : { status: "OFFLINE" as const, lastProcessedAt: null, lagBlocks: 0 },
      guardiansConfirmed: guardians.filter(
        (guardian) => guardian.status === "CONFIRMED",
      ).length,
      risk: {
        level: protection.level,
        label: protection.label,
        summary: protection.summary,
        score: protection.score,
      },
      fiat: {
        status: "UNAVAILABLE" as const,
        reason:
          "No verified fiat price feed is configured. NONCE will not invent a USD value or timestamp.",
        timestamp: null,
      },
      feeAnalytics: {
        status: "UNAVAILABLE" as const,
        reason:
          "Sandbox actions have no gas. Live gas estimates come from the wallet/contract path and are not stored as fee history yet.",
      },
      support: {
        native: true,
        erc20: false,
        fiat: false,
        defi: false,
        subscriptions: false,
        nftPermissions: false,
        crossChain: false,
      },
      limited: [
        "ERC-20 balances shown as sandbox ledger entries only; no ERC-20 contract is connected.",
        "Subscriptions, token allowances and NFT marketplace permissions are not connected.",
        "DeFi, cross-chain and fiat values are intentionally unavailable rather than fabricated.",
      ],
    };
  },
});

export const analyzeWithdrawal = query({
  args: {
    vaultId: v.id("vaults"),
    assetId: v.id("vaultAssets"),
    amount: v.string(),
    destination: v.string(),
  },
  handler: async (ctx, args) => {
    const { vault } = await requireVaultOwner(ctx, args.vaultId);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.vaultId !== vault._id || !asset.supported) {
      return {
        ok: false as const,
        error: "Asset not found or unsupported on this vault.",
      };
    }
    const policy = await ctx.db
      .query("withdrawalPolicies")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .first();
    if (!policy) {
      return { ok: false as const, error: "Withdrawal policy is missing." };
    }
    const rules = policyForSymbol(
      {
        maxPerTransaction: policy.maxPerTransaction,
        rollingLimit: policy.rollingLimit ?? DEFAULT_POLICY.rollingLimit,
        delayMinutes: policy.delayMinutes,
        largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
      },
      asset.symbol,
    );
    const requests = await ctx.db
      .query("withdrawalRequests")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const spent = rollingSpentUnits(requests, asset.symbol, rules.decimals, Date.now());
    const addressBook = await ctx.db
      .query("addressBookEntries")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(10);
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    const activeIncident = incidents.some(
      (incident) =>
        incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
    );

    return {
      ok: true as const,
      assetSymbol: asset.symbol,
      result: evaluateWithdrawal({
        amount: args.amount,
        balance: asset.balance,
        decimals: rules.decimals,
        destination: args.destination,
        vaultState: vault.state,
        monitoringStatus: checkpoint?.health ?? "OFFLINE",
        activeIncident,
        allowlistOnly: policy.allowlistOnly,
        allowlist: policy.allowlist,
        addressBook: addressBook.map((entry) => entry.address),
        maxPerTransaction: rules.maxPerTransaction,
        rollingLimit: rules.rollingLimit,
        rollingSpent: formatUnits(spent, rules.decimals),
        largeWithdrawalThreshold: rules.largeWithdrawalThreshold,
        guardianThreshold: policy.guardianThreshold,
        delayMinutes: rules.delayMinutes,
      }),
    };
  },
});

export const featureFlags = query({
  args: {},
  handler: async () => ({
    engine: "LOCAL_RULES",
    flags: {
      copilot: true,
      financeOverview: true,
      securityPassport: true,
      transactionFirewall: true,
      addressBook: true,
      erc20Protection: false,
      multiVault: false,
      defiMonitoring: false,
      allowanceManager: false,
      nftPermissions: false,
      crossChainMonitoring: false,
      accountAbstraction: false,
      passkeys: false,
      gasSponsorship: false,
      batchedTransactions: false,
      developerApi: false,
      webhooks: false,
      emailNotifications: false,
      smsNotifications: false,
    },
  }),
});
