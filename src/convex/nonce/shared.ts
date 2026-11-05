/**
 * Shared, side-effect-free NONCE helpers.
 *
 * Everything here is deliberately explicit about simulation. NONCE never
 * invents a chain transaction, a balance or a contract address.
 */
export const NONCE_NETWORK = {
  id: "base-sepolia",
  chainId: 84532,
  label: "Base Sepolia",
  currency: "ETH",
  explorerBaseUrl: "https://sepolia.basescan.org",
} as const;

export const SUPPORTED_ASSETS = [
  {
    symbol: "ETH",
    name: "Ether",
    kind: "NATIVE" as const,
    decimals: 18,
  },
  {
    symbol: "USDC",
    name: "USD Coin (test)",
    kind: "ERC20" as const,
    decimals: 6,
  },
] as const;

export const DEFAULT_POLICY = {
  maxPerTransaction: "0.5",
  rollingLimit: "2.5",
  delayMinutes: 30,
  largeWithdrawalThreshold: "0.1",
  guardianApprovalRequired: true,
  guardianThreshold: 2,
  allowlistOnly: false,
} as const;

/**
 * USDC is quoted in token units, not ETH. These limits are deliberately
 * separate so a 0.5 ETH policy can never be mistaken for a 0.5 USDC limit.
 */
export const STABLE_POLICY = {
  maxPerTransaction: "2500",
  rollingLimit: "10000",
  delayMinutes: 30,
  largeWithdrawalThreshold: "500",
} as const;

export const GUARDIAN_THRESHOLD = 2;
export const REQUIRED_GUARDIANS = 3;
export const REQUIRED_DECOYS = 2;

/** Contract minimums mirrored by the demo. The demo compresses the timelock. */
export const MIN_WITHDRAWAL_DELAY_MINUTES = 10;
export const MIN_POLICY_DELAY_MINUTES = 24 * 60;
export const DEMO_POLICY_DELAY_MINUTES = 2;
export const WITHDRAWAL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROPOSAL_EXECUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isValidAddress(value: string): boolean {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return false;
  return !/^0x0{40}$/.test(value);
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function shortAddress(value: string | undefined | null): string {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function assertAmount(value: string): void {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error("Amount must be a positive decimal number.");
  }
}

export function parseUnits(value: string, decimals: number): bigint {
  assertAmount(value);
  const [whole, fraction = ""] = value.trim().split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(`${whole}${padded}`);
}

export function formatUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, "0");
  const trimmed = fraction.replace(/0+$/, "");
  const value = trimmed ? `${whole}.${trimmed}` : `${whole}`;
  return negative ? `-${value}` : value;
}

export function compareUnits(
  a: string,
  b: string,
  decimals: number,
): -1 | 0 | 1 {
  const left = parseUnits(a, decimals);
  const right = parseUnits(b, decimals);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function addUnits(a: string, b: string, decimals: number): string {
  return formatUnits(parseUnits(a, decimals) + parseUnits(b, decimals), decimals);
}

export function subtractUnits(a: string, b: string, decimals: number): string {
  const result = parseUnits(a, decimals) - parseUnits(b, decimals);
  if (result < 0n) throw new Error("Insufficient vault balance for this amount.");
  return formatUnits(result, decimals);
}

export function isZeroAmount(value: string, decimals: number): boolean {
  return parseUnits(value, decimals) === 0n;
}

export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Human-readable, non-secret simulation reference (`SIM-…`). */
export function simulationRef(kind: string): string {
  return `SIM-${kind}-${randomHex(4).toUpperCase()}`;
}

export function incidentReference(): string {
  return `INC-${randomHex(3).toUpperCase()}`;
}

export function recoveryReference(): string {
  return `REC-${randomHex(3).toUpperCase()}`;
}

const RISK_WEIGHT = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;

export function riskWeight(risk: "LOW" | "MEDIUM" | "HIGH"): number {
  return RISK_WEIGHT[risk];
}

export function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Stable JSON so evidence hashes are reproducible. */
export function canonicalJson(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  return JSON.stringify(value, keys);
}
