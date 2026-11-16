import { describe, expect, test } from "bun:test";
import {
  buildCopilotBrief,
  buildPassport,
  evaluateWithdrawal,
  maskAddress,
  type CopilotInput,
  type PassportInput,
} from "../src/lib/intelligence";
import { FEATURE_DEFAULTS, resolveFeatureFlag } from "../src/lib/features";

const DEST = "0x1111111111111111111111111111111111111111";

const baseWithdrawal = {
  amount: "0.05",
  balance: "1",
  decimals: 18,
  destination: DEST,
  vaultState: "NORMAL",
  monitoringStatus: "ACTIVE",
  activeIncident: false,
  allowlistOnly: false,
  allowlist: [],
  addressBook: [DEST],
  maxPerTransaction: "0.5",
  rollingLimit: "2.5",
  rollingSpent: "0",
  largeWithdrawalThreshold: "0.1",
  guardianThreshold: 2,
  delayMinutes: 30,
};

const baseCopilot: CopilotInput = {
  generatedAt: 1_700_000_000_000,
  mode: "DEMO",
  vaultState: "NORMAL",
  protectionLabel: "Demo controls configured",
  protectionScore: 80,
  mandatoryMet: true,
  ownershipVerified: true,
  deploymentStatus: "SIMULATED",
  contractVersion: "nonce-vault 0.1.0-demo",
  network: "base-sepolia · chain 84532",
  guardianCount: 3,
  guardianThreshold: 2,
  monitoringStatus: "ACTIVE",
  policyConfigured: true,
  activeIncident: null,
  incidents: [],
  pendingWithdrawals: 0,
  assets: [{ symbol: "ETH", balance: "1", supported: true }],
  addressBookCount: 1,
};

const basePassport: PassportInput = {
  holder: DEST,
  network: "base-sepolia · chain 84532",
  contractVersion: "nonce-vault 0.1.0-demo",
  mode: "DEMO",
  deploymentStatus: "SIMULATED",
  ownershipVerified: true,
  guardianCount: 3,
  guardianThreshold: 2,
  policyConfigured: true,
  monitoringStatus: "ACTIVE",
  activeIncident: false,
  lastSyncedAt: 1_700_000_000_000,
  checks: [
    { id: "wallet", label: "Wallet ownership", status: "PASS", detail: "Verified" },
    { id: "guardians", label: "Guardian recovery", status: "PASS", detail: "3/3" },
    { id: "withdrawal", label: "Withdrawal policy", status: "PASS", detail: "Configured" },
    { id: "monitoring", label: "Monitoring", status: "PASS", detail: "Active" },
  ],
};

describe("transaction firewall", () => {
  test("passes a compliant payment", () => {
    const result = evaluateWithdrawal(baseWithdrawal);
    expect(result.canSubmit).toBe(true);
    expect(result.risk).toBe("LOW");
    expect(result.requiresGuardians).toBe(false);
  });

  test("blocks a recipient outside an allowlist", () => {
    const result = evaluateWithdrawal({
      ...baseWithdrawal,
      allowlistOnly: true,
      allowlist: ["0x2222222222222222222222222222222222222222"],
    });
    expect(result.canSubmit).toBe(false);
    expect(result.risk).toBe("HIGH");
    expect(result.checks.find((check) => check.id === "allowlist")?.status).toBe("FAIL");
  });

  test("blocks per-transaction and rolling-limit violations", () => {
    const perTx = evaluateWithdrawal({ ...baseWithdrawal, amount: "0.75" });
    expect(perTx.canSubmit).toBe(false);
    expect(perTx.checks.find((check) => check.id === "per-transaction")?.status).toBe("FAIL");

    const rolling = evaluateWithdrawal({
      ...baseWithdrawal,
      amount: "0.3",
      rollingSpent: "2.3",
    });
    expect(rolling.canSubmit).toBe(false);
    expect(rolling.checks.find((check) => check.id === "rolling-limit")?.status).toBe("FAIL");
  });

  test("requires guardians at the large threshold", () => {
    const result = evaluateWithdrawal({ ...baseWithdrawal, amount: "0.1" });
    expect(result.canSubmit).toBe(true);
    expect(result.requiresGuardians).toBe(true);
  });

  test("marks unknown recipients for review without pretending it is a block", () => {
    const result = evaluateWithdrawal({ ...baseWithdrawal, addressBook: [] });
    expect(result.canSubmit).toBe(true);
    expect(result.risk).toBe("MEDIUM");
    expect(result.checks.find((check) => check.id === "allowlist")?.status).toBe("WARN");
  });

  test("blocks a locked vault and an invalid address", () => {
    expect(evaluateWithdrawal({ ...baseWithdrawal, vaultState: "LOCKDOWN" }).canSubmit).toBe(false);
    expect(evaluateWithdrawal({ ...baseWithdrawal, destination: "0x1234" }).canSubmit).toBe(false);
  });
});

describe("copilot brief", () => {
  test("keeps a sandbox vault sandboxed and never grants signing authority", () => {
    const brief = buildCopilotBrief(baseCopilot);
    expect(brief.engine).toBe("LOCAL_RULES");
    expect(brief.coverage.find((item) => item.area.includes("Vault"))?.status).toBe("SANDBOX");
    expect(brief.disclaimer).toMatch(/no signing authority/i);
    expect(brief.report.disclaimer).toMatch(/not an independent audit/i);
  });

  test("raises risk for an open high incident and recommends evidence review", () => {
    const brief = buildCopilotBrief({
      ...baseCopilot,
      activeIncident: {
        id: "incident",
        reference: "INC-ABC",
        title: "Unexpected signature",
        summary: "A decoy signed a transaction.",
        status: "VERIFIED",
        risk: "HIGH",
        detectedAt: 1_700_000_000_000,
        evidenceCount: 2,
      },
    });
    expect(brief.risk).toBe("HIGH");
    expect(brief.findings.some((finding) => finding.id === "open-incident")).toBe(true);
    expect(brief.report.sections[2].evidenceRefs).toContain("incident:INC-ABC");
  });

  test("surfaces missing guardians as a high finding", () => {
    const brief = buildCopilotBrief({ ...baseCopilot, guardianCount: 1 });
    expect(brief.findings.find((finding) => finding.id === "guardian-readiness")?.severity).toBe(
      "HIGH",
    );
    expect(brief.recommendations.some((item) => item.id === "rec-confirm-guardians")).toBe(true);
  });
});

describe("security passport", () => {
  test("does not upgrade a sandbox passport", () => {
    const passport = buildPassport(basePassport);
    expect(passport.status).toBe("SANDBOX");
    expect(passport.label).toMatch(/no on-chain protection/i);
  });

  test("marks a confirmed, complete live passport as verified", () => {
    const passport = buildPassport({
      ...basePassport,
      mode: "TESTNET",
      deploymentStatus: "CONFIRMED",
    });
    expect(passport.status).toBe("VERIFIED");
  });

  test("marks an open incident as at-risk", () => {
    const passport = buildPassport({
      ...basePassport,
      mode: "TESTNET",
      deploymentStatus: "CONFIRMED",
      activeIncident: true,
    });
    expect(passport.status).toBe("AT_RISK");
  });

  test("masks addresses without exposing the full value", () => {
    expect(maskAddress(DEST)).not.toBe(DEST);
    expect(maskAddress(DEST)).toContain("…");
    expect(maskAddress(undefined)).toBe("—");
  });
});

describe("feature flags", () => {
  test("keeps experimental capabilities off by default", () => {
    expect(FEATURE_DEFAULTS.copilot).toBe(true);
    expect(FEATURE_DEFAULTS.erc20Protection).toBe(false);
    expect(FEATURE_DEFAULTS.accountAbstraction).toBe(false);
  });

  test("requires an explicit opt-out", () => {
    expect(resolveFeatureFlag(undefined, true)).toBe(true);
    expect(resolveFeatureFlag("true", false)).toBe(true);
    expect(resolveFeatureFlag("FALSE", true)).toBe(false);
    expect(resolveFeatureFlag("0", true)).toBe(false);
  });
});
