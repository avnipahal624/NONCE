import {
  formatUnits,
  isValidAddress,
  normalizeAddress,
  parseUnits,
  shortAddress,
} from "../convex/nonce/shared";

export type FirewallStatus = "PASS" | "WARN" | "FAIL";
export type FirewallRisk = "LOW" | "MEDIUM" | "HIGH";

export type FirewallCheck = {
  id: string;
  label: string;
  status: FirewallStatus;
  detail: string;
};

export type FirewallInput = {
  amount: string;
  balance: string;
  decimals: number;
  destination: string;
  vaultState: string;
  monitoringStatus: string;
  activeIncident: boolean;
  allowlistOnly: boolean;
  allowlist: string[];
  addressBook: string[];
  maxPerTransaction: string;
  rollingLimit: string;
  rollingSpent: string;
  largeWithdrawalThreshold: string;
  guardianThreshold: number;
  delayMinutes: number;
};

export type FirewallResult = {
  canSubmit: boolean;
  risk: FirewallRisk;
  score: number;
  summary: string;
  checks: FirewallCheck[];
  requiresGuardians: boolean;
  delayMinutes: number;
  evidence: string[];
};

function result(
  canSubmit: boolean,
  risk: FirewallRisk,
  score: number,
  summary: string,
  checks: FirewallCheck[],
  requiresGuardians: boolean,
  delayMinutes: number,
  evidence: string[],
): FirewallResult {
  return {
    canSubmit,
    risk,
    score,
    summary,
    checks,
    requiresGuardians,
    delayMinutes,
    evidence,
  };
}

/**
 * Deterministic policy preflight. This is not an LLM and cannot authorize a
 * transaction; it explains what the saved rules and current state imply. The
 * mutation re-validates every constraint before queuing anything.
 */
export function evaluateWithdrawal(input: FirewallInput): FirewallResult {
  const checks: FirewallCheck[] = [];
  const evidence: string[] = [];

  if (input.vaultState === "LOCKDOWN" || input.vaultState === "RECOVERY") {
    checks.push({
      id: "vault-state",
      label: "Vault state",
      status: "FAIL",
      detail: `Vault is ${input.vaultState}. Ordinary withdrawals are blocked until recovery completes.`,
    });
    return result(
      false,
      "HIGH",
      100,
      "Blocked by the vault state. Guardian recovery is the only release path.",
      checks,
      false,
      input.delayMinutes,
      [`vault.state=${input.vaultState}`],
    );
  }
  checks.push({
    id: "vault-state",
    label: "Vault state",
    status: "PASS",
    detail: "Vault is not in lockdown or recovery.",
  });

  if (!isValidAddress(input.destination)) {
    checks.push({
      id: "destination",
      label: "Destination format",
      status: "FAIL",
      detail: "Enter a valid non-zero EVM address.",
    });
    return result(
      false,
      "HIGH",
      100,
      "The destination address is invalid.",
      checks,
      false,
      input.delayMinutes,
      ["destination.invalid"],
    );
  }

  let amountUnits: bigint;
  let balanceUnits: bigint;
  let spentUnits: bigint;
  let maxUnits: bigint;
  let rollingUnits: bigint;
  let thresholdUnits: bigint;
  try {
    amountUnits = parseUnits(input.amount, input.decimals);
    balanceUnits = parseUnits(input.balance, input.decimals);
    spentUnits = parseUnits(input.rollingSpent, input.decimals);
    maxUnits = parseUnits(input.maxPerTransaction, input.decimals);
    rollingUnits = parseUnits(input.rollingLimit, input.decimals);
    thresholdUnits = parseUnits(input.largeWithdrawalThreshold, input.decimals);
  } catch {
    checks.push({
      id: "amount",
      label: "Amount",
      status: "FAIL",
      detail: "Enter a positive decimal amount.",
    });
    return result(
      false,
      "HIGH",
      100,
      "The amount could not be parsed as a valid asset amount.",
      checks,
      false,
      input.delayMinutes,
      ["amount.invalid"],
    );
  }

  const destination = normalizeAddress(input.destination);
  const inAllowlist = input.allowlist.includes(destination);
  const knownRecipient = input.addressBook.includes(destination);

  if (amountUnits <= 0n) {
    checks.push({
      id: "amount",
      label: "Amount",
      status: "FAIL",
      detail: "Amount must be greater than zero.",
    });
  } else {
    checks.push({
      id: "amount",
      label: "Amount",
      status: "PASS",
      detail: `Amount is ${input.amount} in whole ${input.decimals}-decimal units.`,
    });
  }

  checks.push({
    id: "balance",
    label: "Unreserved balance",
    status: amountUnits > balanceUnits ? "FAIL" : "PASS",
    detail:
      amountUnits > balanceUnits
        ? "The amount exceeds the unreserved vault balance."
        : "The amount fits inside the unreserved vault balance.",
  });
  evidence.push(`balance.unreserved=${input.balance}`);

  checks.push({
    id: "per-transaction",
    label: "Per-transaction limit",
    status: amountUnits > maxUnits ? "FAIL" : "PASS",
    detail:
      amountUnits > maxUnits
        ? `Requested amount exceeds the ${input.maxPerTransaction} saved limit.`
        : `Requested amount is within the ${input.maxPerTransaction} saved limit.`,
  });
  evidence.push(`policy.maxPerTransaction=${input.maxPerTransaction}`);

  const projectedSpend = spentUnits + amountUnits;
  checks.push({
    id: "rolling-limit",
    label: "Rolling 24-hour budget",
    status: projectedSpend > rollingUnits ? "FAIL" : "PASS",
    detail:
      projectedSpend > rollingUnits
        ? `Projected spend ${formatUnits(projectedSpend, input.decimals)} exceeds the ${input.rollingLimit} budget.`
        : `Projected spend ${formatUnits(projectedSpend, input.decimals)} stays inside the ${input.rollingLimit} budget.`,
  });
  evidence.push(`rolling.spent=${input.rollingSpent}`);
  evidence.push(`rolling.limit=${input.rollingLimit}`);

  if (input.allowlistOnly && !inAllowlist) {
    checks.push({
      id: "allowlist",
      label: "Recipient allowlist",
      status: "FAIL",
      detail: "Allowlist-only is enabled and this recipient is not on it.",
    });
  } else if (knownRecipient) {
    checks.push({
      id: "allowlist",
      label: "Recipient allowlist",
      status: "PASS",
      detail: "Recipient is saved in your address book.",
    });
  } else {
    checks.push({
      id: "allowlist",
      label: "Recipient allowlist",
      status: "WARN",
      detail:
        "Recipient is not in your address book. Verify it out-of-band before submitting.",
    });
  }

  const requiresGuardians =
    amountUnits >= thresholdUnits || projectedSpend >= thresholdUnits;
  checks.push({
    id: "guardian-quorum",
    label: "Guardian requirement",
    status: "PASS",
    detail: requiresGuardians
      ? `This request crosses the ${input.largeWithdrawalThreshold} cumulative threshold and will require ${input.guardianThreshold} distinct guardian approvals plus the delay.`
      : "This request stays below the saved large-withdrawal threshold.",
  });

  if (input.activeIncident) {
    checks.push({
      id: "incident",
      label: "Open incident",
      status: "WARN",
      detail:
        "An incident is open. Review the evidence and confirm the recipient out-of-band before proceeding.",
    });
  }

  if (input.monitoringStatus !== "ACTIVE") {
    checks.push({
      id: "monitoring",
      label: "Monitoring health",
      status: "WARN",
      detail: `Monitoring is ${input.monitoringStatus}. Detection may be delayed; contract policy still applies.`,
    });
  }

  const failures = checks.filter((check) => check.status === "FAIL").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;
  const risk: FirewallRisk =
    failures > 0 ? "HIGH" : warnings >= 3 ? "HIGH" : warnings > 0 ? "MEDIUM" : "LOW";
  const score = Math.min(100, failures * 45 + warnings * 12);
  const summary =
    failures > 0
      ? "At least one saved policy check fails. The backend will reject this request."
      : warnings > 0
        ? "The request is policy-compliant but has review items. Confirm the recipient out-of-band."
        : "The request is policy-compliant. The backend still re-validates before queuing.";

  return result(
    failures === 0,
    risk,
    score,
    summary,
    checks,
    requiresGuardians,
    input.delayMinutes,
    evidence,
  );
}

export type CopilotIncident = {
  id: string;
  reference: string;
  title: string;
  summary: string;
  status: string;
  risk: string;
  detectedAt: number;
  evidenceCount: number;
};

export type CopilotCoverage = {
  area: string;
  status: "VERIFIED" | "SANDBOX" | "UNAVAILABLE" | "PLANNED";
  detail: string;
};

export type CopilotInput = {
  generatedAt: number;
  mode: string;
  vaultState: string;
  protectionLabel: string;
  protectionScore: number;
  mandatoryMet: boolean;
  ownershipVerified: boolean;
  deploymentStatus: string;
  contractVersion: string;
  network: string;
  guardianCount: number;
  guardianThreshold: number;
  monitoringStatus: string;
  policyConfigured: boolean;
  activeIncident: CopilotIncident | null;
  incidents: CopilotIncident[];
  pendingWithdrawals: number;
  assets: Array<{ symbol: string; balance: string; supported: boolean }>;
  addressBookCount: number;
};

export type CopilotFinding = {
  id: string;
  title: string;
  severity: FirewallRisk;
  explanation: string;
  evidenceRefs: string[];
  action?: string;
};

export type CopilotBrief = {
  engine: "LOCAL_RULES";
  generatedAt: number;
  headline: string;
  risk: FirewallRisk;
  postureSummary: string;
  findings: CopilotFinding[];
  recommendations: Array<{
    id: string;
    title: string;
    why: string;
    action: string;
    priority: "NOW" | "NEXT" | "LATER";
  }>;
  incidentSummaries: Array<{
    id: string;
    reference: string;
    risk: string;
    status: string;
    summary: string;
    evidenceRefs: string[];
  }>;
  recoveryGuidance: string[];
  coverage: CopilotCoverage[];
  report: {
    title: string;
    generatedAt: number;
    sections: Array<{ heading: string; body: string; evidenceRefs: string[] }>;
    disclaimer: string;
  };
  disclaimer: string;
};

/**
 * Evidence-grounded explanation. It only reasons over the scoped context the
 * backend passes in; there is no external model, no email, and no signing key.
 */
export function buildCopilotBrief(input: CopilotInput): CopilotBrief {
  const findings: CopilotFinding[] = [];
  const recommendations: CopilotBrief["recommendations"] = [];
  const isDemo = input.mode === "DEMO";
  const openIncident = input.activeIncident;
  const highIncident = openIncident?.risk === "HIGH";
  const isFrozen = input.vaultState === "LOCKDOWN" || input.vaultState === "RECOVERY";

  if (openIncident) {
    findings.push({
      id: "open-incident",
      title: "An incident is still open",
      severity: highIncident || isFrozen ? "HIGH" : "MEDIUM",
      explanation: `${openIncident.reference} is ${openIncident.status.toLowerCase()} with ${openIncident.risk.toLowerCase()} risk. ${openIncident.summary}`,
      evidenceRefs: [`incident:${openIncident.reference}`, `incident.evidence=${openIncident.evidenceCount}`],
      action: "Review the response timeline and verify any freeze receipt before calling the vault frozen.",
    });
  }

  if (input.guardianCount < input.guardianThreshold) {
    findings.push({
      id: "guardian-readiness",
      title: "Guardian quorum is not ready",
      severity: "HIGH",
      explanation: `Only ${input.guardianCount} confirmed guardian(s) are recorded; recovery needs ${input.guardianThreshold}. A lost owner signer could not be replaced under the intended quorum.`,
      evidenceRefs: ["guardians.confirmed", "policy.guardianThreshold"],
      action: "Invite and verify the missing guardian(s). Do not treat a simulated invitation as a signature.",
    });
    recommendations.push({
      id: "rec-confirm-guardians",
      title: "Complete the guardian set",
      why: "Recovery cannot meet quorum without enough distinct, confirmed guardians.",
      action: "Open Guardian Circle and confirm each guardian’s address out-of-band.",
      priority: "NOW",
    });
  }

  if (!input.ownershipVerified) {
    findings.push({
      id: "ownership",
      title: "Wallet ownership is not proven",
      severity: "MEDIUM",
      explanation:
        "The active signer is a sandbox/demo identity. An address alone is not proof that you control the wallet.",
      evidenceRefs: ["wallet.verification=DEMO_SIGNER"],
      action: "Verify the wallet by signing a server-issued challenge before relying on ownership-scoped actions.",
    });
  }

  if (input.monitoringStatus !== "ACTIVE") {
    findings.push({
      id: "monitoring",
      title: "Monitoring is degraded",
      severity: input.monitoringStatus === "OFFLINE" ? "HIGH" : "MEDIUM",
      explanation: `Monitoring health is ${input.monitoringStatus}. Detection may be delayed; the withdrawal policy may still apply.`,
      evidenceRefs: ["monitor.health"],
      action: "Restore the monitor checkpoint or treat detection as unavailable.",
    });
  }

  if (input.deploymentStatus !== "CONFIRMED") {
    findings.push({
      id: "deployment",
      title: "No confirmed contract deployment is recorded",
      severity: isDemo ? "MEDIUM" : "HIGH",
      explanation: isDemo
        ? "This is a sandbox vault. Nothing here is enforced on-chain, and the contract is not deployed from this workspace."
        : `Deployment status is ${input.deploymentStatus}. The interface must not claim enforceable protection.`,
      evidenceRefs: ["vault.deploymentStatus", "vault.mode"],
      action: "Keep sandbox labels visible; only claim protection after a verified receipt and role/policy read.",
    });
    recommendations.push({
      id: "rec-verify-deployment",
      title: "Verify the deployment before calling it protection",
      why: "A submitted transaction or a sandbox record is not a confirmed contract.",
      action: "Read the address, receipt, owner, monitor, guardians, policy and freeze state from chain.",
      priority: "NOW",
    });
  }

  if (input.addressBookCount === 0) {
    recommendations.push({
      id: "rec-address-book",
      title: "Create a recipient address book",
      why: "A saved, reviewed recipient set reduces the chance of a paste-swap or typo before the delay starts.",
      action: "Add labels and verify each address out-of-band in Finance Overview.",
      priority: "NEXT",
    });
  }

  if (input.pendingWithdrawals > 0) {
    findings.push({
      id: "pending-payments",
      title: "Withdrawals are in flight",
      severity: "MEDIUM",
      explanation: `${input.pendingWithdrawals} protected payment(s) are queued or awaiting guardians. The delay is the cancellation window.`,
      evidenceRefs: ["withdrawals.pending"],
      action: "Review the withdrawal timeline and cancel anything you did not authorize.",
    });
  }

  if (isFrozen) {
    recommendations.push({
      id: "rec-recovery",
      title: "Follow the guardian recovery path",
      why: "Ordinary withdrawals are blocked while frozen or in recovery.",
      action:
        "Open Recovery Center, confirm the proposal and approvals, wait for the on-chain delay, then verify the epoch and owner after execution.",
      priority: "NOW",
    });
  } else if (isDemo) {
    recommendations.push({
      id: "rec-sandbox",
      title: "Keep the sandbox boundary explicit",
      why: "A simulated lock is not an on-chain freeze.",
      action: "Run the testnet console only after deployment and label every sandbox result as SIMULATED.",
      priority: "NEXT",
    });
  }

  if (input.policyConfigured) {
    findings.push({
      id: "policy",
      title: "Withdrawal policy is active",
      severity: "LOW",
      explanation:
        "Limits, rolling reservations and delays are evaluated before a request is queued. The displayed preflight is advisory; the backend re-checks it.",
      evidenceRefs: ["policy.active", "withdrawals.preflight"],
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "baseline",
      title: "No open findings in the scoped context",
      severity: "LOW",
      explanation:
        "The available backend context has no open incident, guardian gap, ownership gap or monitoring failure. This is not a guarantee of safety.",
      evidenceRefs: ["scope.backend"],
    });
  }

  const failures = findings.filter((finding) => finding.severity === "HIGH").length;
  const warnings = findings.filter((finding) => finding.severity === "MEDIUM").length;
  const risk: FirewallRisk = failures > 0 ? "HIGH" : warnings > 0 ? "MEDIUM" : "LOW";
  const coverage: CopilotCoverage[] = [
    {
      area: "Vault and withdrawal policy",
      status: isDemo ? "SANDBOX" : input.deploymentStatus === "CONFIRMED" ? "VERIFIED" : "UNAVAILABLE",
      detail: isDemo
        ? "Convex sandbox mirrors the policy; no contract enforces it."
        : "Derived from the configured vault record and policy.",
    },
    {
      area: "Transaction Firewall",
      status: "VERIFIED",
      detail: "Deterministic preflight over saved policy, balance, recipient and current state.",
    },
    {
      area: "Decoy detection",
      status: isDemo ? "SANDBOX" : "UNAVAILABLE",
      detail: isDemo
        ? "Owner-triggered synthetic signals only."
        : "No live decoy watcher is configured in this workspace.",
    },
    {
      area: "ERC-20 approvals and allowances",
      status: "PLANNED",
      detail: "Requires a separately reviewed token module and an allowance data source; not connected.",
    },
    {
      area: "DeFi / NFT / cross-chain exposure",
      status: "PLANNED",
      detail: "No external indexer is connected. No exposure claims are made.",
    },
    {
      area: "Account abstraction / passkeys",
      status: "PLANNED",
      detail: "Research only. The existing vault has not been migrated.",
    },
  ];

  const incidentSummaries = input.incidents.slice(0, 5).map((incident) => ({
    id: incident.id,
    reference: incident.reference,
    risk: incident.risk,
    status: incident.status,
    summary: incident.summary,
    evidenceRefs: [`incident:${incident.reference}`, `evidence.count=${incident.evidenceCount}`],
  }));

  const postureSummary = isDemo
    ? "Sandbox controls are configured, but no contract enforces them. Treat this as a rehearsal, not live protection."
    : input.deploymentStatus === "CONFIRMED"
      ? "The backend records a confirmed contract and a configured policy. Verify the chain state independently before relying on it."
      : "The deployment is not confirmed, so the interface cannot claim enforceable protection.";
  const incompleteCopy = input.mandatoryMet
    ? ""
    : " Mandatory safeguards are incomplete; finish the checklist before relying on this posture.";

  const report = {
    title: "NONCE security brief",
    generatedAt: input.generatedAt,
    sections: [
      {
        heading: "Scope",
        body: `${input.network} · ${input.mode} · ${input.contractVersion}. Scoped records: ${input.assets.length} asset(s), ${input.addressBookCount} saved recipient(s). Only backend-scoped vault, policy, guardian, incident and monitoring fields were used.`,
        evidenceRefs: ["scope.backend", "vault.mode", "vault.contractVersion"],
      },
      {
        heading: "Posture",
        body: `${input.protectionLabel} (${input.protectionScore}%). ${postureSummary}${incompleteCopy}`,
        evidenceRefs: ["protection.label", "protection.score", "vault.deploymentStatus"],
      },
      {
        heading: "Findings",
        body: findings
          .map((finding) => `[${finding.severity}] ${finding.title}: ${finding.explanation}`)
          .join("\n\n"),
        evidenceRefs: [...new Set(findings.flatMap((finding) => finding.evidenceRefs))],
      },
      {
        heading: "Recommended actions",
        body: recommendations.length
          ? recommendations.map((item) => `${item.priority}: ${item.title} — ${item.action}`).join("\n")
          : "No additional action is proposed by the local rules engine.",
        evidenceRefs: ["recommendations.local_rules"],
      },
    ],
    disclaimer:
      "Generated by a local rules engine from scoped backend context. It is not an independent audit, does not sign transactions, and cannot authorize withdrawals, recovery or policy changes.",
  };

  return {
    engine: "LOCAL_RULES",
    generatedAt: input.generatedAt,
    headline: openIncident
      ? `Open incident: ${openIncident.reference}`
      : isDemo
        ? "Sandbox posture"
        : "Security posture",
    risk,
    postureSummary: `${postureSummary}${incompleteCopy}`,
    findings,
    recommendations,
    incidentSummaries,
    recoveryGuidance: isFrozen
      ? [
          "Open Recovery Center and verify the proposal details against an out-of-band guardian confirmation.",
          "Collect the required distinct guardian approvals; one approval is never enough.",
          "Wait for the immutable recovery delay, then execute and read the owner/epoch/freeze state.",
          "Do not describe the vault as restored until the contract read confirms it.",
        ]
      : [
          "Recovery is not active. Keep all three guardian contacts verified and test the invitation path before an emergency.",
          "If an owner signer is compromised, freeze first, then propose recovery; a completed transfer cannot be reversed.",
        ],
    coverage,
    report,
    disclaimer:
      "AI Copilot is an explainability layer. It has no signing authority, no autonomous freeze authority, and no ability to approve recovery or policy changes.",
  };
}

export type PassportInput = {
  holder: string;
  network: string;
  contractVersion: string;
  mode: string;
  deploymentStatus: string;
  ownershipVerified: boolean;
  guardianCount: number;
  guardianThreshold: number;
  policyConfigured: boolean;
  monitoringStatus: string;
  activeIncident: boolean;
  lastSyncedAt: number;
  contractAddress?: string;
  checks: Array<{ id: string; label: string; status: "PASS" | "WARN" | "FAIL"; detail: string }>;
};

export type Passport = {
  status: "SANDBOX" | "VERIFIED" | "INCOMPLETE" | "AT_RISK";
  label: string;
  score: number;
  holderMasked: string;
  network: string;
  contractVersion: string;
  deploymentLabel: string;
  lastSyncedAt: number;
  checks: PassportInput["checks"];
  milestones: Array<{ label: string; complete: boolean; detail: string }>;
  coverage: Array<{ area: string; status: string; detail: string }>;
  disclaimer: string;
};

export function maskAddress(value: string | undefined): string {
  if (!value) return "—";
  return shortAddress(value);
}

export function buildPassport(input: PassportInput): Passport {
  const mandatory = input.checks.filter((check) => check.id !== "wallet" && check.id !== "decoy");
  const mandatoryMet = mandatory.every((check) => check.status === "PASS");
  const atRisk =
    input.activeIncident ||
    input.monitoringStatus === "OFFLINE" ||
    input.guardianCount < input.guardianThreshold;
  const status: Passport["status"] =
    input.mode === "DEMO"
      ? "SANDBOX"
      : atRisk
        ? "AT_RISK"
        : mandatoryMet &&
            input.ownershipVerified &&
            input.deploymentStatus === "CONFIRMED"
          ? "VERIFIED"
          : "INCOMPLETE";
  const label =
    status === "VERIFIED"
      ? "Contract-verified testnet passport"
      : status === "SANDBOX"
        ? "Sandbox passport — no on-chain protection"
        : status === "AT_RISK"
          ? "Attention required"
          : "Incomplete — verification required";
  const score = Math.round(
    (input.checks.filter((check) => check.status === "PASS").length /
      Math.max(input.checks.length, 1)) *
      100,
  );

  return {
    status,
    label,
    score,
    holderMasked: maskAddress(input.holder),
    network: input.network,
    contractVersion: input.contractVersion,
    deploymentLabel:
      input.deploymentStatus === "CONFIRMED"
        ? `Confirmed${input.contractAddress ? ` · ${maskAddress(input.contractAddress)}` : ""}`
        : "Not confirmed",
    lastSyncedAt: input.lastSyncedAt,
    checks: input.checks,
    milestones: [
      {
        label: "Wallet ownership",
        complete: input.ownershipVerified,
        detail: input.ownershipVerified ? "Signature verified" : "Demo signer only",
      },
      {
        label: "Guardian quorum",
        complete: input.guardianCount >= input.guardianThreshold,
        detail: `${input.guardianCount}/${input.guardianThreshold} confirmed`,
      },
      {
        label: "Withdrawal policy",
        complete: input.policyConfigured,
        detail: input.policyConfigured ? "Limits and delay configured" : "Not configured",
      },
      {
        label: "Monitoring",
        complete: input.monitoringStatus === "ACTIVE",
        detail: input.monitoringStatus,
      },
      {
        label: "No open incident",
        complete: !input.activeIncident,
        detail: input.activeIncident ? "Open incident" : "Clear",
      },
    ],
    coverage: [
      {
        area: "On-chain vault",
        status: input.deploymentStatus === "CONFIRMED" ? "VERIFIED" : "UNAVAILABLE",
        detail:
          input.deploymentStatus === "CONFIRMED"
            ? "Deployment is recorded as confirmed; independently read it before relying on it."
            : "No confirmed deployment is recorded.",
      },
      {
        area: "Transaction Firewall",
        status: "VERIFIED",
        detail: "Advisory preflight over saved policy and state; backend re-validates.",
      },
      {
        area: "AI Copilot",
        status: "VERIFIED",
        detail: "Local rules engine only; no signing or autonomous authority.",
      },
      {
        area: "ERC-20 / DeFi / cross-chain",
        status: "PLANNED",
        detail: "Not connected in this workspace; no coverage claimed.",
      },
    ],
    disclaimer:
      "Security Passport is derived from scoped backend records, not an independent audit or certification. Sandbox and testnet states are labelled and must not be presented as mainnet protection.",
  };
}
