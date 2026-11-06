import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  isAddress,
  keccak256,
  parseEther,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import artifactUrl from "../../contracts/out/NONCEVault.sol/NONCEVault.json?url";
import { getInjectedWallet, humanizeWalletError } from "./wallet";
import { TESTNET_CHAIN_ID } from "./testnet";

/**
 * Fixed for this deployment flow. The owner is public information; this module
 * never touches a private key or recovery phrase.
 */
export const NONCE_VAULT_OWNER = "0x7f81CB31C2AE4Fa70360c503232674D09d098C54" as Address;
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

export const NONCE_VAULT_DEPLOY_ABI = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialOwner", type: "address" },
      { name: "monitor_", type: "address" },
      { name: "guardians_", type: "address[3]" },
      { name: "perTransactionLimit_", type: "uint256" },
      { name: "largeWithdrawalThreshold_", type: "uint256" },
      { name: "rollingLimit_", type: "uint256" },
      { name: "withdrawalDelay_", type: "uint64" },
      { name: "recoveryDelay_", type: "uint64" },
      { name: "policyDelay_", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "monitor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "guardians",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getPolicy",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "perTransactionLimit", type: "uint256" },
      { name: "largeWithdrawalThreshold", type: "uint256" },
      { name: "rollingLimit", type: "uint256" },
      { name: "withdrawalDelay", type: "uint64" },
      { name: "allowlistOnly", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "recoveryDelay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "policyDelay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "epoch",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "frozen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type VaultDeploymentForm = {
  monitor: string;
  guardians: [string, string, string];
  perTransactionLimitEth: string;
  largeWithdrawalThresholdEth: string;
  rollingLimitEth: string;
  withdrawalDelayMinutes: string;
  recoveryDelayDays: string;
  policyDelayDays: string;
};

export type VaultDeploymentConfig = {
  owner: Address;
  monitor: Address;
  guardians: [Address, Address, Address];
  perTransactionLimit: bigint;
  largeWithdrawalThreshold: bigint;
  rollingLimit: bigint;
  withdrawalDelay: bigint;
  recoveryDelay: bigint;
  policyDelay: bigint;
};

export type DeployArtifact = {
  bytecode: Hex;
  deployedBytecode: Hex;
  bytecodeHash: Hash;
};

export type DeploymentQuote = {
  account: Address;
  config: VaultDeploymentConfig;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint | null;
  maxCostWei: bigint;
  balanceWei: bigint;
  bytecodeHash: Hash;
  chainId: number;
};

export type DeploymentVerification = {
  hash: Hash;
  address: Address;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  actualL2FeeWei: bigint;
  codeBytes: number;
  codeHash: Hash;
  owner: Address;
  monitor: Address;
  guardians: [Address, Address, Address];
  policy: {
    perTransactionLimit: bigint;
    largeWithdrawalThreshold: bigint;
    rollingLimit: bigint;
    withdrawalDelay: bigint;
    allowlistOnly: boolean;
  };
  recoveryDelay: bigint;
  policyDelay: bigint;
  epoch: bigint;
  frozen: boolean;
  mismatches: string[];
};

const MAX_UINT96 = (1n << 96n) - 1n;
const MIN_WITHDRAWAL_MINUTES = 10;
const MAX_WITHDRAWAL_MINUTES = 43_200;
const MIN_RECOVERY_DAYS = 2;
const MAX_RECOVERY_DAYS = 90;
const MIN_POLICY_DAYS = 1;
const MAX_POLICY_DAYS = 30;

let artifactPromise: Promise<DeployArtifact> | null = null;

function requireProvider() {
  const provider = getInjectedWallet();
  if (!provider) {
    throw new Error(
      "No injected wallet was found. Open this page in a normal browser with MetaMask unlocked.",
    );
  }
  return provider;
}

function publicClientFor(provider: ReturnType<typeof requireProvider>) {
  return createPublicClient({
    chain: baseSepolia,
    transport: custom(provider),
  });
}

async function assertConnectedAccount(
  provider: ReturnType<typeof requireProvider>,
  account: Address,
): Promise<void> {
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) {
    throw new Error(
      "The connected MetaMask account changed. Reconnect the intended wallet and review the deployment again.",
    );
  }
}

function walletClientFor(account: Address, provider: ReturnType<typeof requireProvider>) {
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: custom(provider),
  });
}

function parseAddress(value: string, label: string, errors: string[]): Address | null {
  const trimmed = value.trim();
  if (!trimmed || !isAddress(trimmed) || /^0x0{40}$/i.test(trimmed)) {
    errors.push(`${label} must be a valid non-zero 0x address.`);
    return null;
  }
  try {
    return getAddress(trimmed);
  } catch {
    errors.push(`${label} has an invalid checksum. Paste the address again or use all lowercase.`);
    return null;
  }
}

function parsePositiveEther(value: string, label: string, errors: string[]): bigint | null {
  try {
    const parsed = parseEther(value.trim());
    if (parsed <= 0n) {
      errors.push(`${label} must be greater than zero.`);
      return null;
    }
    return parsed;
  } catch {
    errors.push(`${label} must be a valid ETH amount.`);
    return null;
  }
}

function parseInteger(
  value: string,
  label: string,
  min: number,
  max: number,
  errors: string[],
): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${label} must be a whole number from ${min} to ${max}.`);
    return null;
  }
  return parsed;
}

/**
 * Mirrors the constructor's address and policy checks before any wallet
 * request. This is deliberately duplicate validation: the contract remains
 * authoritative, and the UI avoids sending a transaction that would revert.
 */
export function validateVaultDeployment(form: VaultDeploymentForm): {
  errors: string[];
  config: VaultDeploymentConfig | null;
} {
  const errors: string[] = [];
  const owner = getAddress(NONCE_VAULT_OWNER);
  const monitor = parseAddress(form.monitor, "Monitor", errors);
  const guardians = form.guardians.map((guardian, index) =>
    parseAddress(guardian, `Guardian ${index + 1}`, errors),
  ) as [Address | null, Address | null, Address | null];

  const perTransactionLimit = parsePositiveEther(
    form.perTransactionLimitEth,
    "Per-transaction limit",
    errors,
  );
  const largeWithdrawalThreshold = parsePositiveEther(
    form.largeWithdrawalThresholdEth,
    "Large-withdrawal threshold",
    errors,
  );
  const rollingLimit = parsePositiveEther(form.rollingLimitEth, "Rolling 24h limit", errors);

  if (perTransactionLimit !== null && largeWithdrawalThreshold !== null) {
    if (largeWithdrawalThreshold > perTransactionLimit) {
      errors.push("Large-withdrawal threshold cannot exceed the per-transaction limit.");
    }
  }
  if (perTransactionLimit !== null && rollingLimit !== null) {
    if (rollingLimit < perTransactionLimit) {
      errors.push("Rolling 24h limit cannot be less than the per-transaction limit.");
    }
  }
  if (rollingLimit !== null && rollingLimit > MAX_UINT96) {
    errors.push("Rolling 24h limit exceeds the contract's uint96 maximum.");
  }

  const withdrawalMinutes = parseInteger(
    form.withdrawalDelayMinutes,
    "Withdrawal delay (minutes)",
    MIN_WITHDRAWAL_MINUTES,
    MAX_WITHDRAWAL_MINUTES,
    errors,
  );
  const recoveryDays = parseInteger(
    form.recoveryDelayDays,
    "Recovery delay (days)",
    MIN_RECOVERY_DAYS,
    MAX_RECOVERY_DAYS,
    errors,
  );
  const policyDays = parseInteger(
    form.policyDelayDays,
    "Policy delay (days)",
    MIN_POLICY_DAYS,
    MAX_POLICY_DAYS,
    errors,
  );

  if (monitor && monitor.toLowerCase() === owner.toLowerCase()) {
    errors.push("Monitor must be different from the owner.");
  }

  const seen = new Map<string, string>();
  const roleAddresses: Array<[string, Address | null]> = [
    ["Owner", owner],
    ["Monitor", monitor],
    ["Guardian 1", guardians[0]],
    ["Guardian 2", guardians[1]],
    ["Guardian 3", guardians[2]],
  ];
  for (const [label, address] of roleAddresses) {
    if (!address) continue;
    const key = address.toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      errors.push(`${label} must be a distinct address; it duplicates ${previous}.`);
    } else {
      seen.set(key, label);
    }
  }

  if (
    errors.length > 0 ||
    !monitor ||
    !guardians[0] ||
    !guardians[1] ||
    !guardians[2] ||
    perTransactionLimit === null ||
    largeWithdrawalThreshold === null ||
    rollingLimit === null ||
    withdrawalMinutes === null ||
    recoveryDays === null ||
    policyDays === null
  ) {
    return { errors, config: null };
  }

  return {
    errors,
    config: {
      owner,
      monitor,
      guardians: [guardians[0], guardians[1], guardians[2]],
      perTransactionLimit,
      largeWithdrawalThreshold,
      rollingLimit,
      withdrawalDelay: BigInt(withdrawalMinutes * 60),
      recoveryDelay: BigInt(recoveryDays * 24 * 60 * 60),
      policyDelay: BigInt(policyDays * 24 * 60 * 60),
    },
  };
}

export function deploymentArgs(config: VaultDeploymentConfig) {
  return [
    config.owner,
    config.monitor,
    config.guardians,
    config.perTransactionLimit,
    config.largeWithdrawalThreshold,
    config.rollingLimit,
    config.withdrawalDelay,
    config.recoveryDelay,
    config.policyDelay,
  ] as const;
}

export function encodeVaultDeployment(config: VaultDeploymentConfig, bytecode: Hex): Hex {
  return encodeDeployData({
    abi: NONCE_VAULT_DEPLOY_ABI,
    bytecode,
    args: deploymentArgs(config),
  });
}

export async function loadNonceVaultArtifact(): Promise<DeployArtifact> {
  if (artifactPromise) return artifactPromise;

  artifactPromise = (async () => {
    let response: Response;
    try {
      response = await fetch(artifactUrl);
    } catch {
      throw new Error(
        "The compiled NONCEVault artifact could not be fetched. Reload the page and try again.",
      );
    }
    if (!response.ok) {
      throw new Error(
        "The compiled NONCEVault artifact could not be loaded. Run `forge build` in contracts/ and reload this page.",
      );
    }

    let artifact: {
      bytecode?: { object?: string };
      deployedBytecode?: { object?: string };
    };
    try {
      artifact = (await response.json()) as typeof artifact;
    } catch {
      throw new Error(
        "The compiled NONCEVault artifact is not valid JSON. Run `forge build` in contracts/ and reload this page.",
      );
    }

    const bytecode = artifact.bytecode?.object;
    const deployedBytecode = artifact.deployedBytecode?.object;
    if (!bytecode || !bytecode.startsWith("0x") || bytecode.length <= 2) {
      throw new Error("The NONCEVault artifact has no deployment bytecode.");
    }
    if (!deployedBytecode || !deployedBytecode.startsWith("0x")) {
      throw new Error("The NONCEVault artifact has no runtime bytecode.");
    }
    return {
      bytecode: bytecode as Hex,
      deployedBytecode: deployedBytecode as Hex,
      bytecodeHash: keccak256(bytecode as Hex),
    };
  })();

  try {
    return await artifactPromise;
  } catch (error) {
    artifactPromise = null;
    throw error;
  }
}

export async function readDeploymentWallet(account: Address): Promise<{
  chainId: number;
  balanceWei: bigint;
}> {
  const provider = requireProvider();
  const client = publicClientFor(provider);
  const [chainId, balanceWei] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: account }),
  ]);
  return { chainId, balanceWei };
}

export async function estimateVaultDeployment(
  form: VaultDeploymentForm,
  account: Address,
): Promise<DeploymentQuote> {
  const validation = validateVaultDeployment(form);
  if (!validation.config) {
    throw new Error(validation.errors.join(" "));
  }

  const artifact = await loadNonceVaultArtifact();
  const provider = requireProvider();
  await assertConnectedAccount(provider, account);
  const client = publicClientFor(provider);
  const chainId = await client.getChainId();
  if (chainId !== TESTNET_CHAIN_ID) {
    throw new Error(
      `Your wallet is on chain ${chainId}. Switch it to Base Sepolia (${TESTNET_CHAIN_ID}) before estimating or deploying.`,
    );
  }

  const data = encodeVaultDeployment(validation.config, artifact.bytecode);
  const [gas, fees, balanceWei] = await Promise.all([
    client.estimateGas({ account, data }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: account }),
  ]);
  const maxFeePerGas =
    "maxFeePerGas" in fees && fees.maxFeePerGas
      ? fees.maxFeePerGas
      : "gasPrice" in fees && fees.gasPrice
        ? fees.gasPrice
        : null;
  if (!maxFeePerGas) {
    throw new Error("The wallet provider did not return a usable gas price.");
  }
  const maxPriorityFeePerGas =
    "maxPriorityFeePerGas" in fees && fees.maxPriorityFeePerGas
      ? fees.maxPriorityFeePerGas
      : null;

  return {
    account,
    config: validation.config,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    maxCostWei: gas * maxFeePerGas,
    balanceWei,
    bytecodeHash: artifact.bytecodeHash,
    chainId,
  };
}

export async function deployVault(
  form: VaultDeploymentForm,
  account: Address,
): Promise<{ hash: Hash; config: VaultDeploymentConfig; bytecodeHash: Hash }> {
  const validation = validateVaultDeployment(form);
  if (!validation.config) {
    throw new Error(validation.errors.join(" "));
  }

  const artifact = await loadNonceVaultArtifact();
  const provider = requireProvider();
  await assertConnectedAccount(provider, account);
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainId, 16) !== TESTNET_CHAIN_ID) {
    throw new Error(
      `Your wallet is on chain ${Number.parseInt(chainId, 16)}. Switch it to Base Sepolia (${TESTNET_CHAIN_ID}) before deploying.`,
    );
  }

  const wallet = walletClientFor(account, provider);
  const hash = await wallet.deployContract({
    abi: NONCE_VAULT_DEPLOY_ABI,
    bytecode: artifact.bytecode,
    args: deploymentArgs(validation.config),
    account,
    chain: baseSepolia,
  });

  return {
    hash,
    config: validation.config,
    bytecodeHash: artifact.bytecodeHash,
  };
}

function differentAddress(actual: Address, expected: Address): boolean {
  return actual.toLowerCase() !== expected.toLowerCase();
}

function addMismatch(
  mismatches: string[],
  label: string,
  actual: string | bigint | boolean,
  expected: string | bigint | boolean,
) {
  mismatches.push(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
}

export async function verifyVaultDeployment(
  hash: Hash,
  expected: VaultDeploymentConfig,
): Promise<DeploymentVerification> {
  const provider = requireProvider();
  const client = publicClientFor(provider);
  const chainId = await client.getChainId();
  if (chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Switch your wallet to Base Sepolia (${TESTNET_CHAIN_ID}) to verify the receipt.`);
  }

  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180_000,
    });
  } catch (error) {
    throw new Error(
      `The receipt is not available yet. The transaction may still be pending. ${humanizeWalletError(error)}`,
    );
  }

  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(
      `Deployment transaction ${hash} did not create a contract successfully. No contract address was verified.`,
    );
  }

  const address = receipt.contractAddress;
  const [code, owner, monitor, guardian0, guardian1, guardian2, policy, recoveryDelay, policyDelay, epoch, frozen] =
    await Promise.all([
      client.getCode({ address }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "owner",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "monitor",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "guardians",
        args: [0n],
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "guardians",
        args: [1n],
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "guardians",
        args: [2n],
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "getPolicy",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "recoveryDelay",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "policyDelay",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "epoch",
      }),
      client.readContract({
        address,
        abi: NONCE_VAULT_DEPLOY_ABI,
        functionName: "frozen",
      }),
    ]);

  if (!code || code === "0x") {
    throw new Error(`No bytecode was found at ${address}. The deployment is not verified.`);
  }

  const guardians: [Address, Address, Address] = [guardian0, guardian1, guardian2];
  const actualPolicy = {
    perTransactionLimit: policy[0],
    largeWithdrawalThreshold: policy[1],
    rollingLimit: policy[2],
    withdrawalDelay: policy[3],
    allowlistOnly: policy[4],
  };

  const mismatches: string[] = [];
  if (differentAddress(owner, expected.owner)) {
    addMismatch(mismatches, "Owner", owner, expected.owner);
  }
  if (differentAddress(monitor, expected.monitor)) {
    addMismatch(mismatches, "Monitor", monitor, expected.monitor);
  }
  expected.guardians.forEach((guardian, index) => {
    if (differentAddress(guardians[index], guardian)) {
      addMismatch(mismatches, `Guardian ${index + 1}`, guardians[index], guardian);
    }
  });
  if (actualPolicy.perTransactionLimit !== expected.perTransactionLimit) {
    addMismatch(
      mismatches,
      "Per-transaction limit",
      actualPolicy.perTransactionLimit,
      expected.perTransactionLimit,
    );
  }
  if (actualPolicy.largeWithdrawalThreshold !== expected.largeWithdrawalThreshold) {
    addMismatch(
      mismatches,
      "Large-withdrawal threshold",
      actualPolicy.largeWithdrawalThreshold,
      expected.largeWithdrawalThreshold,
    );
  }
  if (actualPolicy.rollingLimit !== expected.rollingLimit) {
    addMismatch(mismatches, "Rolling limit", actualPolicy.rollingLimit, expected.rollingLimit);
  }
  if (actualPolicy.withdrawalDelay !== expected.withdrawalDelay) {
    addMismatch(
      mismatches,
      "Withdrawal delay",
      actualPolicy.withdrawalDelay,
      expected.withdrawalDelay,
    );
  }
  if (recoveryDelay !== expected.recoveryDelay) {
    addMismatch(mismatches, "Recovery delay", recoveryDelay, expected.recoveryDelay);
  }
  if (policyDelay !== expected.policyDelay) {
    addMismatch(mismatches, "Policy delay", policyDelay, expected.policyDelay);
  }
  if (actualPolicy.allowlistOnly) {
    addMismatch(mismatches, "Allowlist-only", actualPolicy.allowlistOnly, false);
  }

  return {
    hash,
    address,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    actualL2FeeWei: receipt.gasUsed * receipt.effectiveGasPrice,
    codeBytes: (code.length - 2) / 2,
    codeHash: keccak256(code),
    owner,
    monitor,
    guardians,
    policy: actualPolicy,
    recoveryDelay,
    policyDelay,
    epoch,
    frozen,
    mismatches,
  };
}
