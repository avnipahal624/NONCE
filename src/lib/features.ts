export const FEATURE_DEFAULTS = {
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
} as const;

export type FeatureName = keyof typeof FEATURE_DEFAULTS;

/** Explicit opt-out only: a missing flag keeps the reviewed default. */
export function resolveFeatureFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !["0", "false", "off", "no", "disabled"].includes(
    value.trim().toLowerCase(),
  );
}

function envFlag(name: string, fallback: boolean): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return resolveFeatureFlag(env[`VITE_FEATURE_${name.toUpperCase()}`], fallback);
}

export const FEATURES: Record<FeatureName, boolean> = Object.fromEntries(
  (Object.keys(FEATURE_DEFAULTS) as FeatureName[]).map((name) => [
    name,
    envFlag(name, FEATURE_DEFAULTS[name]),
  ]),
) as Record<FeatureName, boolean>;

export const PLANNED_FEATURES: Array<{
  name: FeatureName;
  label: string;
  reason: string;
}> = [
  {
    name: "erc20Protection",
    label: "ERC-20 protection modules",
    reason: "Requires a separately reviewed token module and hostile-token tests.",
  },
  {
    name: "multiVault",
    label: "Multi-vault registry",
    reason: "The current schema resolves one sandbox vault per user; migration needs an isolation review.",
  },
  {
    name: "defiMonitoring",
    label: "DeFi exposure monitoring",
    reason: "No verified position indexer is connected.",
  },
  {
    name: "allowanceManager",
    label: "Token approval manager",
    reason: "No allowance data source or approval transaction path is connected.",
  },
  {
    name: "nftPermissions",
    label: "NFT and marketplace permissions",
    reason: "No marketplace operator indexer is connected.",
  },
  {
    name: "crossChainMonitoring",
    label: "Cross-chain monitoring",
    reason: "Base Sepolia is the only supported network.",
  },
  {
    name: "accountAbstraction",
    label: "Smart-account compatibility",
    reason: "Research only; the existing vault is not migrated.",
  },
  {
    name: "passkeys",
    label: "Passkey smart accounts",
    reason: "Requires a separately audited account implementation and recovery design.",
  },
  {
    name: "gasSponsorship",
    label: "Gas sponsorship",
    reason: "Requires a paymaster and an explicit funding/abuse model.",
  },
  {
    name: "batchedTransactions",
    label: "Batched transactions",
    reason: "Requires smart-account execution support and a new signing flow.",
  },
  {
    name: "developerApi",
    label: "Developer API",
    reason: "No authenticated developer credential or rate-limit service exists yet.",
  },
  {
    name: "webhooks",
    label: "Webhooks",
    reason: "No signed delivery endpoint or retry queue exists yet.",
  },
];
