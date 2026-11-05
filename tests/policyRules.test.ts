import { describe, expect, test } from "bun:test";
import {
  classifyPolicyChange,
  normalizePolicyInput,
  rollingSpentUnits,
  type PolicyView,
} from "../src/convex/nonce/policyRules";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const basePolicy: PolicyView = {
  maxPerTransaction: "0.5",
  rollingLimit: "2.5",
  delayMinutes: 30,
  largeWithdrawalThreshold: "0.1",
  guardianThreshold: 2,
  guardianApprovalRequired: true,
  allowlistOnly: false,
  allowlist: [],
};

describe("rollingSpentUnits", () => {
  test("counts an aged pending reservation until it finalizes", () => {
    const spent = rollingSpentUnits(
      [
        {
          symbol: "ETH",
          amount: "0.4",
          status: "QUEUED",
          createdAt: NOW - 25 * HOUR,
        },
      ],
      "ETH",
      18,
      NOW,
    );
    expect(spent).toBe(400000000000000000n);
  });

  test("counts a completed withdrawal for 24h from finalization", () => {
    const request = {
      symbol: "ETH",
      amount: "0.4",
      status: "COMPLETED",
      createdAt: NOW - 30 * HOUR,
      finalizedAt: NOW - 1 * HOUR,
    };
    expect(rollingSpentUnits([request], "ETH", 18, NOW)).toBe(
      400000000000000000n,
    );
    expect(
      rollingSpentUnits(
        [{ ...request, finalizedAt: NOW - 25 * HOUR }],
        "ETH",
        18,
        NOW,
      ),
    ).toBe(0n);
  });

  test("ignores cancelled, blocked and failed requests", () => {
    const spent = rollingSpentUnits(
      ["CANCELLED", "BLOCKED", "FAILED"].map((status) => ({
        symbol: "ETH",
        amount: "0.4",
        status,
        createdAt: NOW - HOUR,
      })),
      "ETH",
      18,
      NOW,
    );
    expect(spent).toBe(0n);
  });

  test("does not mix USDC token units into an ETH budget", () => {
    const spent = rollingSpentUnits(
      [
        {
          symbol: "USDC",
          amount: "1000",
          status: "QUEUED",
          createdAt: NOW,
        },
      ],
      "ETH",
      18,
      NOW,
    );
    expect(spent).toBe(0n);
  });
});

describe("policy classification", () => {
  test("one weakening field makes the whole proposal weakening", () => {
    const result = classifyPolicyChange(basePolicy, {
      ...basePolicy,
      maxPerTransaction: "0.4",
      rollingLimit: "5",
      delayMinutes: 60,
    });
    expect(result.classification).toBe("WEAKENING");
    expect(result.reasons).toContain("24-hour limit increased");
  });

  test("lowering limits and lengthening delay is strengthening", () => {
    const result = classifyPolicyChange(basePolicy, {
      ...basePolicy,
      maxPerTransaction: "0.3",
      rollingLimit: "2",
      delayMinutes: 60,
    });
    expect(result.classification).toBe("STRENGTHENING");
  });

  test("rejects a delay below the contract minimum", () => {
    expect(() =>
      normalizePolicyInput({
        maxPerTransaction: "0.5",
        rollingLimit: "2.5",
        delayMinutes: 1,
        largeWithdrawalThreshold: "0.1",
        guardianThreshold: 2,
        allowlistOnly: false,
        allowlist: [],
      }),
    ).toThrow();
  });

  test("rejects a threshold above the per-transaction limit", () => {
    expect(() =>
      normalizePolicyInput({
        maxPerTransaction: "0.5",
        rollingLimit: "2.5",
        delayMinutes: 30,
        largeWithdrawalThreshold: "1",
        guardianThreshold: 2,
        allowlistOnly: false,
        allowlist: [],
      }),
    ).toThrow();
  });
});
