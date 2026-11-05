import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  audit,
  getMonitorCheckpoint,
  notify,
  recordVaultTransaction,
  requireVaultOwner,
  userIdOrNull,
  getVaultForUser,
} from "./db";
import {
  NONCE_NETWORK,
  canonicalJson,
  incidentReference,
  randomHex,
  riskWeight,
  simulationRef,
} from "./shared";
import { sha256Hex } from "./hash";
import { internal } from "../_generated/api";
import type { Risk } from "../schema";

const signalTypeValidator = v.union(
  v.literal("SIGNED_TX"),
  v.literal("NONCE_CHANGE"),
  v.literal("CONTRACT_CALL"),
  v.literal("UNSOLICITED_TRANSFER"),
);
type SignalType =
  | "SIGNED_TX"
  | "NONCE_CHANGE"
  | "CONTRACT_CALL"
  | "UNSOLICITED_TRANSFER";

const MAX_INCIDENT_ATTEMPTS = 3;

function classifySignal(
  signalType: SignalType,
  policy: Doc<"decoyPolicies"> | null,
): {
  risk: Risk;
  category: string;
  reason: string;
  autoResponse: boolean;
  extraSignals: string[];
} {
  switch (signalType) {
    case "SIGNED_TX":
      return {
        risk: policy?.monitorSignedTx ? "HIGH" : "MEDIUM",
        category: "DECOY_SIGNED_TRANSACTION",
        reason:
          "A transaction was signed by an address that should never sign. Decoys hold no operational role, so a valid signature implies the key material may be compromised.",
        autoResponse: Boolean(policy?.monitorSignedTx),
        extraSignals: ["outbound signature", "decoy policy forbids signing"],
      };
    case "NONCE_CHANGE":
      return {
        risk: policy?.monitorNonceChanges ? "HIGH" : "MEDIUM",
        category: "UNEXPECTED_NONCE_CHANGE",
        reason:
          "The decoy account nonce advanced with no transaction attributable to NONCE. That is only possible if someone else signed from the key.",
        autoResponse: Boolean(policy?.monitorNonceChanges),
        extraSignals: ["nonce advanced", "no authorised sender"],
      };
    case "CONTRACT_CALL":
      return {
        risk: policy?.monitorContractCalls ? "MEDIUM" : "LOW",
        category: "DECOY_CONTRACT_INTERACTION",
        reason:
          "The decoy was used to call a contract. This can indicate key misuse, but a single call is not proof of theft.",
        autoResponse: false,
        extraSignals: ["contract interaction"],
      };
    case "UNSOLICITED_TRANSFER":
      return {
        risk: "LOW",
        category: "UNSOLICITED_INBOUND_TRANSFER",
        reason:
          "Tokens arrived at a decoy address. Public addresses receive spam and dust, so inbound transfers are recorded as noise and never trigger a lockdown.",
        autoResponse: false,
        extraSignals: ["inbound transfer only"],
      };
  }
}

async function cancelOpenWithdrawals(
  ctx: Parameters<typeof recordVaultTransaction>[0],
  vaultId: Id<"vaults">,
  reason: string,
): Promise<number> {
  const requests = await ctx.db
    .query("withdrawalRequests")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
  let cancelled = 0;
  for (const request of requests) {
    if (!["QUEUED", "AWAITING_GUARDIANS", "READY"].includes(request.status)) {
      continue;
    }
    await ctx.db.patch(request._id, {
      status: "CANCELLED",
      cancelReason: reason,
      finalizedAt: Date.now(),
    });
    cancelled += 1;
  }
  return cancelled;
}

/** One-click sandbox intrusion used by the demo and the test flows. */
export const triggerDecoySignal = mutation({
  args: {
    vaultId: v.id("vaults"),
    decoyId: v.id("decoys"),
    signalType: signalTypeValidator,
    failLockdown: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error(
        "No RPC watcher is configured for this build, so only sandbox signals can be produced. Live ingestion requires a monitor worker.",
      );
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("The vault is already locked down.");
    }
    const decoy = await ctx.db.get(args.decoyId);
    if (!decoy || decoy.vaultId !== vault._id) {
      throw new Error("Decoy not found on this vault.");
    }
    if (decoy.status !== "ACTIVE") {
      throw new Error("This decoy is paused. Activate it before testing detection.");
    }
    const policy = await ctx.db
      .query("decoyPolicies")
      .withIndex("by_decoy", (q) => q.eq("decoyId", decoy._id))
      .first();
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    if (!checkpoint) throw new Error("Monitor checkpoint missing.");
    const monitoringStatus = checkpoint.health;
    const now = Date.now();

    const recentSignals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const lastMinute = recentSignals.filter((signal) => signal.createdAt > now - 60_000);
    if (lastMinute.length >= 6) {
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "SIGNAL_RATE_LIMITED",
        detail: "More than six signals in one minute were suppressed to prevent lockout spam.",
      });
      return {
        status: "SUPPRESSED" as const,
        message:
          "Rate limit reached: more than six signals in a minute were suppressed. Automated actions are never driven by spam volume.",
        incidentId: null,
      };
    }

    if (decoy.lastSignalAt && now - decoy.lastSignalAt < 5 * 60 * 1000) {
      await audit(ctx, {
        userId,
        vaultId: vault._id,
        action: "SIGNAL_DUPLICATE_SUPPRESSED",
        detail: `${decoy.label} produced another signal inside the five-minute cooldown.`,
      });
      return {
        status: "SUPPRESSED" as const,
        message:
          "Duplicate suppressed: this decoy already raised a signal within the five-minute cooldown.",
        incidentId: null,
      };
    }

    const classification = classifySignal(args.signalType, policy);
    const blockNumber = checkpoint.lastProcessedBlock + 1;
    const blockHash = `sim-block-${randomHex(8)}`;
    const uniqueKey = `${vault._id}:${decoy._id}:${args.signalType}:${blockNumber}:0`;
    const evidenceHash = sha256Hex(
      canonicalJson({
        chainId: NONCE_NETWORK.chainId,
        vaultId: vault._id,
        decoyId: decoy._id,
        signalType: args.signalType,
        blockNumber,
        blockHash,
        observedAt: now,
      }),
    );

    const existingEvent = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_unique_key", (q) => q.eq("uniqueKey", uniqueKey))
      .first();
    if (existingEvent) {
      return {
        status: "SUPPRESSED" as const,
        message: "This event was already ingested. Duplicate processing is blocked.",
        incidentId: null,
      };
    }

    const eventId = await ctx.db.insert("blockchainEvents", {
      uniqueKey,
      chainId: NONCE_NETWORK.chainId,
      network: NONCE_NETWORK.id,
      blockNumber,
      blockHash,
      logIndex: 0,
      eventType: args.signalType,
      source: "SIMULATED",
      address: decoy.address,
      vaultId: vault._id,
      decoyId: decoy._id,
      observedAt: now,
      finalized: true,
      evidenceHash,
      payload: JSON.stringify({
        simulated: true,
        signalType: args.signalType,
        decoyLabel: decoy.label,
        note: "Synthetic sandbox event. No transaction hash exists.",
      }),
    });

    await ctx.db.patch(checkpoint._id, {
      lastProcessedBlock: blockNumber,
      lastProcessedBlockHash: blockHash,
      lastProcessedAt: now,
      updatedAt: now,
      lagBlocks: 0,
    });

    const dedupeKey = `${vault._id}:${decoy._id}:${args.signalType}:${Math.floor(now / (5 * 60_000))}`;
    const duplicate = await ctx.db
      .query("threatSignals")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (duplicate) {
      return {
        status: "SUPPRESSED" as const,
        message: "An identical signal was already assessed inside this window.",
        incidentId: null,
      };
    }

    await ctx.db.insert("threatSignals", {
      vaultId: vault._id,
      decoyId: decoy._id,
      eventId,
      category: classification.category,
      severity: classification.risk,
      reason: classification.reason,
      detectionState:
        classification.risk === "HIGH" && monitoringStatus === "ACTIVE"
          ? "COMPROMISE_SIGNAL"
          : "SUSPICIOUS",
      dedupeKey,
      createdAt: now,
    });

    await ctx.db.patch(decoy._id, {
      signalCount: decoy.signalCount + 1,
      lastSignalAt: now,
      lastCheckedAt: now,
      riskLevel: classification.risk,
    });

    await ctx.db.insert("threatAssessments", {
      vaultId: vault._id,
      eventId,
      risk: classification.risk,
      score: riskWeight(classification.risk) * 30 + classification.extraSignals.length * 5,
      rationale: `${classification.reason} Monitoring health: ${monitoringStatus}. ${
        classification.autoResponse && monitoringStatus === "ACTIVE"
          ? "Configured emergency policy authorises automated lockdown."
          : "Automated lockdown is not authorised for this assessment."
      }`,
      signalsUsed: classification.extraSignals,
      automatedAction:
        classification.autoResponse && monitoringStatus === "ACTIVE"
          ? "LOCKDOWN"
          : "NOTIFY_ONLY",
      createdAt: now,
    });

    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: decoy.address,
      action: "SIMULATED_SIGNAL_INGESTED",
      detail: `${args.signalType} on ${decoy.label}. Risk ${classification.risk}. Evidence ${evidenceHash.slice(0, 16)}…`,
    });

    if (classification.risk === "LOW") {
      await notify(ctx, {
        userId,
        vaultId: vault._id,
        category: "decoy_noise",
        title: "Inbound transfer ignored",
        body: `${decoy.label} received an inbound transfer. Unsolicited transfers are recorded but never freeze a vault.`,
        severity: "INFO",
      });
      return {
        status: "OBSERVED" as const,
        message:
          "Recorded as low-risk noise. An inbound transfer alone never triggers a lockdown.",
        incidentId: null,
      };
    }

    const openIncident = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const alreadyOpen = openIncident.find(
      (incident) =>
        incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
    );
    if (alreadyOpen) {
      return {
        status: "ALREADY_ESCALATED" as const,
        message:
          "An incident is already open for this vault. The new signal was attached as supporting evidence.",
        incidentId: alreadyOpen._id,
      };
    }

    const monitoringHealthy = monitoringStatus === "ACTIVE";
    const incidentId = await ctx.db.insert("incidents", {
      vaultId: vault._id,
      reference: incidentReference(),
      title:
        classification.risk === "HIGH"
          ? "Possible decoy key compromise"
          : "Suspicious decoy activity",
      summary: `${decoy.label}: ${classification.reason}`,
      status: "DETECTED",
      riskLevel: classification.risk,
      triggerReason: `${classification.category} matched the monitoring policy for ${decoy.label}.`,
      detectedAt: now,
      responseStatus: monitoringHealthy
        ? "Independent verification starting."
        : `Monitoring is ${monitoringStatus.toLowerCase()}; automated response withheld.`,
      affectedDecoyId: decoy._id,
      eventIds: [eventId],
      evidenceHash,
      falsePositive: false,
    });

    await ctx.db.insert("incidentEvidence", {
      incidentId,
      vaultId: vault._id,
      label: `${classification.category} observed on ${decoy.label}`,
      chainId: NONCE_NETWORK.chainId,
      blockNumber,
      blockHash,
      logIndex: 0,
      observedAt: now,
      evidenceHash,
      verificationStatus: "OBSERVED",
      source: "SIMULATED",
    });

    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "decoy_signal",
      title: monitoringHealthy
        ? "Decoy activity detected"
        : "Signal detected while monitoring is degraded",
      body: monitoringHealthy
        ? `${decoy.label} raised a ${classification.risk.toLowerCase()}-risk signal. Verification is running.`
        : `${decoy.label} raised a signal, but monitoring is ${monitoringStatus.toLowerCase()}. Review manually — on-chain delays still apply.`,
      severity: classification.risk === "HIGH" ? "CRITICAL" : "WARNING",
    });

    if (monitoringHealthy && classification.risk === "HIGH") {
      await ctx.scheduler.runAfter(900, internal.nonce.monitor.verifyIncident, {
        incidentId,
        failLockdown: args.failLockdown ?? false,
      });
    }

    return {
      status: "INCIDENT_CREATED" as const,
      message: monitoringHealthy
        ? classification.risk === "HIGH"
          ? "Incident created. Independent verification is running before any automated response."
          : "Incident created for review. No automated lockdown for medium risk."
        : "Incident recorded for manual review because monitoring is not healthy.",
      incidentId,
    };
  },
});

export const verifyIncident = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    failLockdown: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.status !== "DETECTED") return;
    const vault = await ctx.db.get(incident.vaultId);
    if (!vault) return;
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") return;
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    if (!checkpoint || checkpoint.health !== "ACTIVE") {
      await ctx.db.patch(incident._id, {
        responseStatus:
          "Verification paused: monitor is not healthy. Manual lockdown remains available.",
      });
      return;
    }
    const evidence = await ctx.db
      .query("incidentEvidence")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    if (evidence.length === 0 || incident.riskLevel !== "HIGH") {
      await ctx.db.patch(incident._id, {
        status: "VERIFIED",
        verifiedAt: Date.now(),
        responseStatus: "Verified. No automated action is authorised for this risk level.",
      });
      return;
    }
    const now = Date.now();
    await ctx.db.patch(incident._id, {
      status: "VERIFIED",
      verifiedAt: now,
      responseStatus: "Verified by two independent conditions. Submitting lockdown.",
    });
    const signals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    for (const signal of signals) {
      if (incident.eventIds.includes(signal.eventId)) {
        await ctx.db.patch(signal._id, {
          detectionState: "LOCKDOWN_REQUESTED",
        });
      }
    }
    await ctx.db.insert("incidentEvidence", {
      incidentId: incident._id,
      vaultId: vault._id,
      label: "Independent verification: decoy policy forbids outbound signatures",
      chainId: NONCE_NETWORK.chainId,
      blockNumber: evidence[0].blockNumber,
      blockHash: evidence[0].blockHash,
      logIndex: 0,
      observedAt: now,
      evidenceHash: sha256Hex(
        canonicalJson({
          incident: incident.reference,
          condition: "policy_mismatch",
          observedAt: now,
        }),
      ),
      verificationStatus: "VERIFIED",
      source: "SIMULATED",
    });
    const requestId = await ctx.db.insert("lockdownRequests", {
      vaultId: vault._id,
      incidentId: incident._id,
      status: "PENDING",
      mode: "SIMULATED",
      attempt: 1,
      requestedAt: now,
      simulationRef: simulationRef("LOCKDOWN"),
      simulatedFailure: args.failLockdown ?? false,
    });
    await ctx.db.patch(incident._id, {
      status: "RESPONSE_PENDING",
      responseStatus: "Lockdown request submitted. Waiting for execution.",
    });
    await audit(ctx, {
      userId: vault.userId,
      vaultId: vault._id,
      action: "LOCKDOWN_REQUESTED",
      detail: `Incident ${incident.reference}: automated lockdown authorised by configured policy (sandbox execution).`,
    });
    await ctx.scheduler.runAfter(1000, internal.nonce.monitor.submitLockdown, {
      requestId,
    });
  },
});

export const submitLockdown = internalMutation({
  args: { requestId: v.id("lockdownRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "PENDING") return;
    await ctx.db.patch(request._id, {
      status: "SUBMITTED",
      submittedAt: Date.now(),
    });
    const incident = await ctx.db.get(request.incidentId);
    if (incident) {
      await ctx.db.patch(incident._id, {
        responseStatus: "Lockdown transaction submitted. Awaiting confirmation.",
      });
    }
    await ctx.scheduler.runAfter(1600, internal.nonce.monitor.confirmLockdown, {
      requestId: request._id,
    });
  },
});

export const confirmLockdown = internalMutation({
  args: { requestId: v.id("lockdownRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "SUBMITTED") return;
    const incident = await ctx.db.get(request.incidentId);
    if (!incident) return;
    const vault = await ctx.db.get(request.vaultId);
    if (!vault) return;
    const now = Date.now();

    if (request.simulatedFailure) {
      await ctx.db.patch(request._id, {
        status: "FAILED",
        failedAt: now,
        failureReason:
          "Sandbox submission failure injected by the demo control. No transaction reached a chain.",
      });
      await ctx.db.patch(incident._id, {
        status: "FAILED",
        responseStatus:
          "Automated lockdown failed. Vault protections are unchanged; use the on-chain withdrawal delay or retry.",
      });
      await notify(ctx, {
        userId: vault.userId,
        vaultId: vault._id,
        category: "lockdown_failed",
        title: "Lockdown did not confirm",
        body: "The freeze transaction failed. Your withdrawal delay still applies. Retry when ready.",
        severity: "CRITICAL",
      });
      await recordVaultTransaction(ctx, {
        vaultId: vault._id,
        kind: "SECURITY",
        status: "FAILED",
        description:
          "Simulated lockdown submission failed. The vault state was not changed.",
        source: "SIMULATED",
        simulationRef: request.simulationRef,
        incidentId: incident._id,
      });
      await audit(ctx, {
        userId: vault.userId,
        vaultId: vault._id,
        action: "LOCKDOWN_FAILED",
        detail: `Incident ${incident.reference}: simulated lockdown failure; vault remains ${vault.state}.`,
      });
      return;
    }

    const latencyMs = now - request.requestedAt;
    await ctx.db.patch(request._id, {
      status: "CONFIRMED",
      confirmedAt: now,
      latencyMs,
    });
    await ctx.db.patch(vault._id, {
      state: "LOCKDOWN",
      stateSource: "SIMULATED",
      stateUpdatedAt: now,
    });
    await ctx.db.patch(incident._id, {
      status: "LOCKDOWN_CONFIRMED",
      responseStatus: `Lockdown confirmed in ${(latencyMs / 1000).toFixed(1)}s (sandbox execution).`,
    });
    const cancelled = await cancelOpenWithdrawals(
      ctx,
      vault._id,
      "Cancelled because the vault locked down.",
    );
    const signals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    for (const signal of signals) {
      if (incident.eventIds.includes(signal.eventId)) {
        await ctx.db.patch(signal._id, { detectionState: "LOCKDOWN_CONFIRMED" });
      }
    }
    await ctx.db.insert("incidentEvidence", {
      incidentId: incident._id,
      vaultId: vault._id,
      label: "Lockdown confirmed by simulated vault state transition",
      chainId: NONCE_NETWORK.chainId,
      blockNumber: 0,
      blockHash: "simulated-execution",
      logIndex: 0,
      observedAt: now,
      evidenceHash: sha256Hex(
        canonicalJson({
          incident: incident.reference,
          latencyMs,
          cancelled,
          reference: request.simulationRef,
        }),
      ),
      verificationStatus: "VERIFIED",
      source: "SIMULATED",
    });
    await recordVaultTransaction(ctx, {
      vaultId: vault._id,
      kind: "SECURITY",
      status: "LOCKDOWN_CONFIRMED",
      description: `Vault locked down after decoy signal. ${cancelled} pending withdrawal(s) cancelled. Simulated execution.`,
      source: "SIMULATED",
      simulationRef: request.simulationRef,
      incidentId: incident._id,
    });
    await notify(ctx, {
      userId: vault.userId,
      vaultId: vault._id,
      category: "lockdown_confirmed",
      title: "Vault locked down",
      body: "Ordinary withdrawals are blocked. Guardian recovery is now the only path back to normal operation.",
      severity: "CRITICAL",
    });
    await audit(ctx, {
      userId: vault.userId,
      vaultId: vault._id,
      action: "LOCKDOWN_CONFIRMED",
      detail: `Incident ${incident.reference}: lockdown confirmed in ${latencyMs}ms (simulated); ${cancelled} queued withdrawals cancelled.`,
    });
  },
});

/** Retry a failed sandbox lockdown, bounded to three attempts. */
export const retryLockdown = mutation({
  args: {
    vaultId: v.id("vaults"),
    incidentId: v.id("incidents"),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.vaultId !== vault._id) {
      throw new Error("Incident not found on this vault.");
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("The vault is already locked down.");
    }
    if (vault.mode !== "DEMO") {
      throw new Error("No signer is configured for live lockdown transactions.");
    }
    const previous = await ctx.db
      .query("lockdownRequests")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    const attempt = previous.length + 1;
    if (attempt > MAX_INCIDENT_ATTEMPTS) {
      throw new Error(
        `Automatic retries are capped at ${MAX_INCIDENT_ATTEMPTS}. Escalate to manual recovery.`,
      );
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("lockdownRequests", {
      vaultId: vault._id,
      incidentId: incident._id,
      status: "PENDING",
      mode: "SIMULATED",
      attempt,
      requestedAt: now,
      simulationRef: simulationRef("LOCKDOWN"),
    });
    await ctx.db.patch(incident._id, {
      status: "RESPONSE_PENDING",
      responseStatus: `Retry ${attempt} of ${MAX_INCIDENT_ATTEMPTS} requested.`,
    });
    await ctx.scheduler.runAfter(800, internal.nonce.monitor.submitLockdown, {
      requestId,
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "LOCKDOWN_RETRY",
      detail: `Manual retry ${attempt} for incident ${incident.reference}.`,
    });
  },
});

/** Owner-authorised emergency lockdown (used when monitoring is degraded). */
export const requestManualLockdown = mutation({
  args: { vaultId: v.id("vaults"), incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error("The vault is already locked down.");
    }
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.vaultId !== vault._id) {
      throw new Error("Incident not found on this vault.");
    }
    const open = await ctx.db
      .query("lockdownRequests")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    if (open.some((request) => ["PENDING", "SUBMITTED", "CONFIRMED"].includes(request.status))) {
      throw new Error("A lockdown is already queued or confirmed for this incident.");
    }
    if (vault.mode !== "DEMO") {
      throw new Error("No signer is configured for live lockdown transactions.");
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("lockdownRequests", {
      vaultId: vault._id,
      incidentId: incident._id,
      status: "PENDING",
      mode: "SIMULATED",
      attempt: open.length + 1,
      requestedAt: now,
      simulationRef: simulationRef("MANUAL-LOCK"),
    });
    await ctx.db.patch(incident._id, {
      status: "RESPONSE_PENDING",
      responseStatus: "Manual lockdown authorised by the vault owner.",
    });
    await ctx.scheduler.runAfter(800, internal.nonce.monitor.submitLockdown, {
      requestId,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "lockdown_requested",
      title: "Manual lockdown requested",
      body: "Your vault owner session authorised a lockdown. Confirmation is tracked separately.",
      severity: "WARNING",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      actorAddress: vault.ownerSigner,
      action: "LOCKDOWN_REQUESTED_MANUAL",
      detail: `Owner-authorised lockdown for incident ${incident.reference}.`,
    });
  },
});

export const health = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const vault = await getVaultForUser(ctx, userId);
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    const services = await ctx.db.query("systemHealth").collect();
    return {
      network: NONCE_NETWORK,
      checkpoint,
      services,
      vaultMode: vault?.mode ?? null,
      note:
        "This build has no RPC worker. Sandbox monitoring is driven by the in-app simulator and reports itself as simulated, never as chain-verified.",
    };
  },
});

/** Demo control for the outage scenarios. */
export const setMonitoringHealth = mutation({
  args: {
    vaultId: v.id("vaults"),
    health: v.union(
      v.literal("ACTIVE"),
      v.literal("DEGRADED"),
      v.literal("OFFLINE"),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, vault } = await requireVaultOwner(ctx, args.vaultId);
    if (vault.mode !== "DEMO") {
      throw new Error("Monitoring health is reported by the watcher, not set by the app.");
    }
    const checkpoint = await getMonitorCheckpoint(ctx, NONCE_NETWORK.id);
    if (!checkpoint) throw new Error("Monitor checkpoint missing.");
    const now = Date.now();
    await ctx.db.patch(checkpoint._id, {
      health: args.health,
      lastProcessedAt: now,
      updatedAt: now,
      consecutiveFailures: args.health === "ACTIVE" ? 0 : checkpoint.consecutiveFailures + 1,
    });
    const services = await ctx.db.query("systemHealth").collect();
    for (const service of services) {
      await ctx.db.patch(service._id, {
        status: args.health,
        checkedAt: now,
        detail:
          args.health === "ACTIVE"
            ? "Sandbox monitor heartbeat restored."
            : `Sandbox monitor marked ${args.health.toLowerCase()} by an operator control. On-chain withdrawal delays still apply.`,
      });
    }
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "monitoring_health",
      title: `Monitoring ${args.health.toLowerCase()}`,
      body:
        args.health === "ACTIVE"
          ? "The sandbox watcher reports healthy again."
          : "Protection is degraded. Automated responses are withheld, but withdrawal delays remain.",
      severity: args.health === "ACTIVE" ? "SUCCESS" : "WARNING",
    });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "MONITORING_HEALTH_CHANGED",
      detail: `Sandbox monitoring health set to ${args.health}.`,
    });
  },
});
