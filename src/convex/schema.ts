import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/**
 * NONCE shared validators.
 * Every state is explicit on purpose: the UI must never have to guess whether
 * something is a simulation, a pending chain submission, or a confirmed fact.
 */
export const vaultStateValidator = v.union(
  v.literal("NORMAL"),
  v.literal("RESTRICTED"),
  v.literal("LOCKDOWN"),
  v.literal("RECOVERY"),
  v.literal("RESTORED"),
);
export type VaultState = Infer<typeof vaultStateValidator>;

export const runModeValidator = v.union(v.literal("LIVE"), v.literal("DEMO"));
export const riskValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
);
export type Risk = Infer<typeof riskValidator>;

export const eventSourceValidator = v.union(
  v.literal("ONCHAIN"),
  v.literal("SIMULATED"),
);

export const incidentStatusValidator = v.union(
  v.literal("DETECTED"),
  v.literal("VERIFIED"),
  v.literal("RESPONSE_PENDING"),
  v.literal("LOCKDOWN_CONFIRMED"),
  v.literal("RECOVERY"),
  v.literal("RESOLVED"),
  v.literal("FALSE_POSITIVE"),
  v.literal("FAILED"),
);
export type IncidentStatus = Infer<typeof incidentStatusValidator>;

export const detectionStateValidator = v.union(
  v.literal("MONITORING"),
  v.literal("SUSPICIOUS"),
  v.literal("COMPROMISE_SIGNAL"),
  v.literal("LOCKDOWN_REQUESTED"),
  v.literal("LOCKDOWN_CONFIRMED"),
  v.literal("RESOLVED"),
);

export const withdrawalStatusValidator = v.union(
  v.literal("QUEUED"),
  v.literal("AWAITING_GUARDIANS"),
  v.literal("READY"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED"),
  v.literal("BLOCKED"),
  v.literal("FAILED"),
);

export const guardianStatusValidator = v.union(
  v.literal("INVITED"),
  v.literal("CONFIRMED"),
  v.literal("REMOVED"),
);

export const approvalModeValidator = v.union(
  v.literal("SIGNATURE"),
  v.literal("SIMULATED"),
);

export const recoveryStatusValidator = v.union(
  v.literal("AWAITING_GUARDIANS"),
  v.literal("APPROVED"),
  v.literal("EXECUTING"),
  v.literal("COMPLETED"),
  v.literal("REJECTED"),
  v.literal("EXPIRED"),
);

export const monitorHealthValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("DEGRADED"),
  v.literal("OFFLINE"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      displayName: v.optional(v.string()),
      notifyEmail: v.optional(v.boolean()),
      notifyInApp: v.optional(v.boolean()),
      createdAt: v.optional(v.number()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    /**
     * A wallet the account controls. `verification` records HOW ownership was
     * established — an address alone is never treated as proof.
     */
    walletIdentities: defineTable({
      userId: v.id("users"),
      address: v.string(),
      chainId: v.number(),
      label: v.optional(v.string()),
      verification: v.union(
        v.literal("SIGNATURE"),
        v.literal("DEMO_SIGNER"),
      ),
      isPrimary: v.boolean(),
      verifiedAt: v.number(),
      revokedAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_address", ["address"]),

    /** One-time SIWE-style challenges. Consumed exactly once, short lived. */
    authChallenges: defineTable({
      userId: v.id("users"),
      address: v.string(),
      nonce: v.string(),
      domain: v.string(),
      chainId: v.number(),
      message: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
      usedAt: v.optional(v.number()),
    })
      .index("by_nonce", ["nonce"])
      .index("by_user", ["userId"]),

    vaults: defineTable({
      userId: v.id("users"),
      name: v.string(),
      network: v.string(),
      chainId: v.number(),
      mode: runModeValidator,
      /** Only present for a vault whose deployment was confirmed on-chain. */
      contractAddress: v.optional(v.string()),
      contractVersion: v.string(),
      deploymentStatus: v.union(
        v.literal("SIMULATED"),
        v.literal("PENDING"),
        v.literal("CONFIRMED"),
        v.literal("FAILED"),
      ),
      ownerSigner: v.string(),
      state: vaultStateValidator,
      stateSource: eventSourceValidator,
      stateUpdatedAt: v.number(),
      monitoringEnabled: v.boolean(),
      createdAt: v.number(),
      activatedAt: v.optional(v.number()),
      lastSyncedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_contract", ["contractAddress"]),

    vaultAssets: defineTable({
      vaultId: v.id("vaults"),
      symbol: v.string(),
      name: v.string(),
      kind: v.union(v.literal("NATIVE"), v.literal("ERC20")),
      contractAddress: v.optional(v.string()),
      chainId: v.number(),
      decimals: v.number(),
      /** Decimal string in whole token units. Never fabricate a balance. */
      balance: v.string(),
      supported: v.boolean(),
    })
      .index("by_vault", ["vaultId"])
      .index("by_vault_symbol", ["vaultId", "symbol"]),

    withdrawalPolicies: defineTable({
      vaultId: v.id("vaults"),
      maxPerTransaction: v.string(),
      delayMinutes: v.number(),
      largeWithdrawalThreshold: v.string(),
      guardianApprovalRequired: v.boolean(),
      guardianThreshold: v.number(),
      allowlistOnly: v.boolean(),
      allowlist: v.array(v.string()),
      updatedAt: v.number(),
      updatedBy: v.string(),
    }).index("by_vault", ["vaultId"]),

    withdrawalRequests: defineTable({
      vaultId: v.id("vaults"),
      userId: v.id("users"),
      assetId: v.id("vaultAssets"),
      symbol: v.string(),
      amount: v.string(),
      destination: v.string(),
      status: withdrawalStatusValidator,
      reason: v.string(),
      requiredApprovals: v.number(),
      approvals: v.array(v.string()),
      createdAt: v.number(),
      executeAfter: v.number(),
      finalizedAt: v.optional(v.number()),
      cancelReason: v.optional(v.string()),
      simulationRef: v.string(),
    })
      .index("by_vault", ["vaultId"])
      .index("by_vault_status", ["vaultId", "status"]),

    decoys: defineTable({
      vaultId: v.id("vaults"),
      label: v.string(),
      address: v.string(),
      status: v.union(v.literal("ACTIVE"), v.literal("PAUSED")),
      riskLevel: riskValidator,
      signalCount: v.number(),
      lastCheckedAt: v.optional(v.number()),
      lastSignalAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_vault", ["vaultId"])
      .index("by_address", ["address"]),

    decoyPolicies: defineTable({
      decoyId: v.id("decoys"),
      vaultId: v.id("vaults"),
      monitorSignedTx: v.boolean(),
      monitorNonceChanges: v.boolean(),
      monitorContractCalls: v.boolean(),
      cooldownMinutes: v.number(),
      updatedAt: v.number(),
    })
      .index("by_decoy", ["decoyId"])
      .index("by_vault", ["vaultId"]),

    monitorCheckpoints: defineTable({
      network: v.string(),
      chainId: v.number(),
      workerId: v.string(),
      lastProcessedBlock: v.number(),
      lastProcessedBlockHash: v.string(),
      lastProcessedAt: v.number(),
      health: monitorHealthValidator,
      lagBlocks: v.number(),
      consecutiveFailures: v.number(),
      updatedAt: v.number(),
    }).index("by_network", ["network"]),

    blockchainEvents: defineTable({
      uniqueKey: v.string(),
      chainId: v.number(),
      network: v.string(),
      blockNumber: v.number(),
      blockHash: v.string(),
      /** Absent for simulated events: a fake hash would be fabrication. */
      txHash: v.optional(v.string()),
      logIndex: v.number(),
      eventType: v.string(),
      source: eventSourceValidator,
      address: v.string(),
      vaultId: v.optional(v.id("vaults")),
      decoyId: v.optional(v.id("decoys")),
      observedAt: v.number(),
      finalized: v.boolean(),
      evidenceHash: v.string(),
      payload: v.string(),
    })
      .index("by_unique_key", ["uniqueKey"])
      .index("by_vault", ["vaultId"])
      .index("by_decoy", ["decoyId"])
      .index("by_observed", ["observedAt"]),

    threatSignals: defineTable({
      vaultId: v.id("vaults"),
      decoyId: v.optional(v.id("decoys")),
      eventId: v.id("blockchainEvents"),
      category: v.string(),
      severity: riskValidator,
      reason: v.string(),
      detectionState: detectionStateValidator,
      dedupeKey: v.string(),
      createdAt: v.number(),
    })
      .index("by_vault", ["vaultId"])
      .index("by_dedupe", ["dedupeKey"])
      .index("by_decoy", ["decoyId"]),

    threatAssessments: defineTable({
      vaultId: v.id("vaults"),
      eventId: v.id("blockchainEvents"),
      risk: riskValidator,
      score: v.number(),
      rationale: v.string(),
      signalsUsed: v.array(v.string()),
      automatedAction: v.string(),
      createdAt: v.number(),
    }).index("by_vault", ["vaultId"]),

    incidents: defineTable({
      vaultId: v.id("vaults"),
      reference: v.string(),
      title: v.string(),
      summary: v.string(),
      status: incidentStatusValidator,
      riskLevel: riskValidator,
      triggerReason: v.string(),
      detectedAt: v.number(),
      verifiedAt: v.optional(v.number()),
      acknowledgedAt: v.optional(v.number()),
      closedAt: v.optional(v.number()),
      responseStatus: v.string(),
      affectedDecoyId: v.optional(v.id("decoys")),
      eventIds: v.array(v.id("blockchainEvents")),
      evidenceHash: v.string(),
      falsePositive: v.boolean(),
      resolutionNote: v.optional(v.string()),
    })
      .index("by_vault", ["vaultId"])
      .index("by_reference", ["reference"])
      .index("by_vault_status", ["vaultId", "status"]),

    incidentEvidence: defineTable({
      incidentId: v.id("incidents"),
      vaultId: v.id("vaults"),
      label: v.string(),
      chainId: v.number(),
      blockNumber: v.number(),
      blockHash: v.string(),
      txHash: v.optional(v.string()),
      logIndex: v.number(),
      observedAt: v.number(),
      evidenceHash: v.string(),
      verificationStatus: v.union(
        v.literal("OBSERVED"),
        v.literal("VERIFIED"),
        v.literal("UNVERIFIED"),
      ),
      source: eventSourceValidator,
    }).index("by_incident", ["incidentId"]),

    lockdownRequests: defineTable({
      vaultId: v.id("vaults"),
      incidentId: v.id("incidents"),
      status: v.union(
        v.literal("PENDING"),
        v.literal("SUBMITTED"),
        v.literal("CONFIRMED"),
        v.literal("FAILED"),
        v.literal("CANCELLED"),
      ),
      mode: eventSourceValidator,
      attempt: v.number(),
      requestedAt: v.number(),
      submittedAt: v.optional(v.number()),
      confirmedAt: v.optional(v.number()),
      failedAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
      latencyMs: v.optional(v.number()),
      simulationRef: v.string(),
      /** Demo control used to exercise the failed-submission path. */
      simulatedFailure: v.optional(v.boolean()),
    })
      .index("by_vault", ["vaultId"])
      .index("by_incident", ["incidentId"]),

    guardians: defineTable({
      vaultId: v.id("vaults"),
      label: v.string(),
      address: v.string(),
      status: guardianStatusValidator,
      approvalMode: approvalModeValidator,
      invitedAt: v.number(),
      confirmedAt: v.optional(v.number()),
    })
      .index("by_vault", ["vaultId"])
      .index("by_address", ["address"]),

    recoveryProposals: defineTable({
      vaultId: v.id("vaults"),
      incidentId: v.optional(v.id("incidents")),
      reference: v.string(),
      proposedByUserId: v.id("users"),
      replacedAddress: v.string(),
      replacementAddress: v.string(),
      status: recoveryStatusValidator,
      threshold: v.number(),
      approvalsCount: v.number(),
      nonce: v.string(),
      createdAt: v.number(),
      executeAfter: v.number(),
      completedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
    }).index("by_vault", ["vaultId"]),

    guardianApprovals: defineTable({
      proposalId: v.id("recoveryProposals"),
      vaultId: v.id("vaults"),
      guardianId: v.id("guardians"),
      address: v.string(),
      approvedAt: v.number(),
      signatureMode: approvalModeValidator,
      messageHash: v.string(),
    })
      .index("by_proposal", ["proposalId"])
      .index("by_vault", ["vaultId"]),

    notifications: defineTable({
      userId: v.id("users"),
      vaultId: v.optional(v.id("vaults")),
      category: v.string(),
      title: v.string(),
      body: v.string(),
      severity: v.union(
        v.literal("INFO"),
        v.literal("SUCCESS"),
        v.literal("WARNING"),
        v.literal("CRITICAL"),
      ),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
      channel: v.literal("IN_APP"),
      deliveredAt: v.number(),
    }).index("by_user", ["userId"]),

    auditEvents: defineTable({
      userId: v.optional(v.id("users")),
      vaultId: v.optional(v.id("vaults")),
      actorAddress: v.optional(v.string()),
      action: v.string(),
      detail: v.string(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_vault", ["vaultId"]),

    systemHealth: defineTable({
      network: v.string(),
      chainId: v.number(),
      service: v.string(),
      status: monitorHealthValidator,
      detail: v.string(),
      lastProcessedBlock: v.number(),
      checkedAt: v.number(),
    })
      .index("by_network", ["network"])
      .index("by_service", ["service"]),

    /** Ledger of vault-affecting activity, including security actions. */
    vaultTransactions: defineTable({
      vaultId: v.id("vaults"),
      kind: v.union(
        v.literal("DEPOSIT"),
        v.literal("WITHDRAWAL"),
        v.literal("SECURITY"),
        v.literal("RECOVERY"),
      ),
      symbol: v.optional(v.string()),
      amount: v.optional(v.string()),
      status: v.string(),
      description: v.string(),
      source: eventSourceValidator,
      createdAt: v.number(),
      txHash: v.optional(v.string()),
      simulationRef: v.optional(v.string()),
      incidentId: v.optional(v.id("incidents")),
    }).index("by_vault", ["vaultId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
