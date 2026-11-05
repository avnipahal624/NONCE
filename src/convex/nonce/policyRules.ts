import {
  GUARDIAN_THRESHOLD,
  MIN_WITHDRAWAL_DELAY_MINUTES,
  ROLLING_WINDOW_MS,
  STABLE_POLICY,
  compareUnits,
  formatUnits,
  isValidAddress,
  normalizeAddress,
  parseUnits,
  WITHDRAWAL_EXPIRY_MS,
} from "./shared";

export type PolicyInput = {
  maxPerTransaction: string;
  rollingLimit: string;
  delayMinutes: number;
  largeWithdrawalThreshold: string;
  guardianThreshold: number;
  allowlistOnly: boolean;
  allowlist: string[];
};

export type PolicyView = PolicyInput & {
  guardianApprovalRequired: boolean;
  updatedAt?: number;
  updatedBy?: string;
};

export type PolicyClassification = "WEAKENING" | "STRENGTHENING" | "NEUTRAL";

const POLICY_DECIMALS = 18;

export function normalizePolicyInput(input: PolicyInput): PolicyInput {
  if (!/^\d+(\.\d+)?$/.test(input.maxPerTransaction.trim())) {
    throw new Error("Enter a valid per-transaction limit.");
  }
  if (!/^\d+(\.\d+)?$/.test(input.rollingLimit.trim())) {
    throw new Error("Enter a valid 24-hour limit.");
  }
  if (!/^\d+(\.\d+)?$/.test(input.largeWithdrawalThreshold.trim())) {
    throw new Error("Enter a valid large-withdrawal threshold.");
  }
  if (parseUnits(input.maxPerTransaction, POLICY_DECIMALS) === 0n) {
    throw new Error("The per-transaction limit must be greater than zero.");
  }
  if (parseUnits(input.rollingLimit, POLICY_DECIMALS) === 0n) {
    throw new Error("The 24-hour limit must be greater than zero.");
  }
  if (
    compareUnits(
      input.largeWithdrawalThreshold,
      input.maxPerTransaction,
      POLICY_DECIMALS,
    ) > 0
  ) {
    throw new Error(
      "The large-withdrawal threshold cannot exceed the per-transaction limit.",
    );
  }
  if (compareUnits(input.rollingLimit, input.maxPerTransaction, POLICY_DECIMALS) < 0) {
    throw new Error("The 24-hour limit cannot be lower than the per-transaction limit.");
  }
  if (
    !Number.isInteger(input.delayMinutes) ||
    input.delayMinutes < MIN_WITHDRAWAL_DELAY_MINUTES ||
    input.delayMinutes > 1440
  ) {
    throw new Error(
      `The security delay must be between ${MIN_WITHDRAWAL_DELAY_MINUTES} minutes and 24 hours.`,
    );
  }
  if (
    !Number.isInteger(input.guardianThreshold) ||
    input.guardianThreshold < GUARDIAN_THRESHOLD ||
    input.guardianThreshold > 3
  ) {
    throw new Error("Guardian approvals must remain at least 2 of 3.");
  }

  const allowlist: string[] = [];
  for (const entry of input.allowlist) {
    if (!isValidAddress(entry)) {
      throw new Error(`"${entry}" is not a valid allowlist address.`);
    }
    const normalized = normalizeAddress(entry);
    if (!allowlist.includes(normalized)) allowlist.push(normalized);
    if (allowlist.length > 20) {
      throw new Error("The allowlist is capped at 20 recipients.");
    }
  }
  if (input.allowlistOnly && allowlist.length === 0) {
    throw new Error(
      "Add at least one recipient before restricting withdrawals to an allowlist.",
    );
  }

  return {
    maxPerTransaction: input.maxPerTransaction.trim(),
    rollingLimit: input.rollingLimit.trim(),
    delayMinutes: input.delayMinutes,
    largeWithdrawalThreshold: input.largeWithdrawalThreshold.trim(),
    guardianThreshold: input.guardianThreshold,
    allowlistOnly: input.allowlistOnly,
    allowlist,
  };
}

/**
 * Conservative classification: a single weakening field makes the whole
 * change weakening, even when other fields strengthen.
 */
export function classifyPolicyChange(
  current: PolicyView,
  next: PolicyInput,
): { classification: PolicyClassification; reasons: string[] } {
  const weakening: string[] = [];
  const strengthening: string[] = [];

  const higher = (a: string, b: string) =>
    compareUnits(a, b, POLICY_DECIMALS) > 0;

  if (higher(next.maxPerTransaction, current.maxPerTransaction)) {
    weakening.push("per-transaction limit increased");
  } else if (higher(current.maxPerTransaction, next.maxPerTransaction)) {
    strengthening.push("per-transaction limit reduced");
  }
  if (higher(next.rollingLimit, current.rollingLimit)) {
    weakening.push("24-hour limit increased");
  } else if (higher(current.rollingLimit, next.rollingLimit)) {
    strengthening.push("24-hour limit reduced");
  }
  if (higher(next.largeWithdrawalThreshold, current.largeWithdrawalThreshold)) {
    weakening.push("large-withdrawal threshold raised");
  } else if (
    higher(current.largeWithdrawalThreshold, next.largeWithdrawalThreshold)
  ) {
    strengthening.push("large-withdrawal threshold lowered");
  }
  if (next.delayMinutes < current.delayMinutes) {
    weakening.push("security delay reduced");
  } else if (next.delayMinutes > current.delayMinutes) {
    strengthening.push("security delay increased");
  }
  if (current.allowlistOnly && !next.allowlistOnly) {
    weakening.push("recipient allowlisting disabled");
  } else if (!current.allowlistOnly && next.allowlistOnly) {
    strengthening.push("recipient allowlisting enabled");
  }
  if (next.guardianThreshold < current.guardianThreshold) {
    weakening.push("guardian approval threshold lowered");
  } else if (next.guardianThreshold > current.guardianThreshold) {
    strengthening.push("guardian approval threshold raised");
  }

  const removed = current.allowlist.filter((entry) => !next.allowlist.includes(entry));
  const added = next.allowlist.filter((entry) => !current.allowlist.includes(entry));
  if (removed.length > 0) weakening.push(`${removed.length} recipient(s) removed`);
  if (added.length > 0) strengthening.push(`${added.length} recipient(s) added`);

  return {
    classification:
      weakening.length > 0
        ? "WEAKENING"
        : strengthening.length > 0
          ? "STRENGTHENING"
          : "NEUTRAL",
    reasons: [...weakening, ...strengthening],
  };
}

export function policyForSymbol(
  policy: Pick<
    PolicyView,
    "maxPerTransaction" | "rollingLimit" | "delayMinutes" | "largeWithdrawalThreshold"
  >,
  symbol: string,
): {
  maxPerTransaction: string;
  rollingLimit: string;
  largeWithdrawalThreshold: string;
  delayMinutes: number;
  decimals: number;
} {
  if (symbol === "ETH") {
    return {
      maxPerTransaction: policy.maxPerTransaction,
      rollingLimit: policy.rollingLimit,
      largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
      delayMinutes: policy.delayMinutes,
      decimals: 18,
    };
  }
  if (symbol === "USDC") {
    return {
      ...STABLE_POLICY,
      decimals: 6,
    };
  }
  throw new Error("No withdrawal policy exists for this asset.");
}

type RequestLike = {
  symbol: string;
  amount: string;
  status: string;
  createdAt: number;
  finalizedAt?: number;
};

const PENDING_STATUSES = ["QUEUED", "AWAITING_GUARDIANS", "READY"];

export function rollingSpentUnits(
  requests: RequestLike[],
  symbol: string,
  decimals: number,
  now: number,
): bigint {
  return requests
    .filter(
      (request) =>
        request.symbol === symbol &&
        !["CANCELLED", "BLOCKED", "FAILED"].includes(request.status) &&
        (request.finalizedAt ?? request.createdAt) > now - ROLLING_WINDOW_MS,
    )
    .reduce(
      (total, request) => total + parseUnits(request.amount, decimals),
      0n,
    );
}

export function pendingReservedUnits(
  requests: RequestLike[],
  symbol: string,
  decimals: number,
): bigint {
  return requests
    .filter(
      (request) =>
        request.symbol === symbol && PENDING_STATUSES.includes(request.status),
    )
    .reduce(
      (total, request) => total + parseUnits(request.amount, decimals),
      0n,
    );
}

export function formatPolicyUnits(units: bigint, decimals: number): string {
  return formatUnits(units, decimals);
}

export function withdrawalExpiry(executeAfter: number): number {
  return executeAfter + WITHDRAWAL_EXPIRY_MS;
}
