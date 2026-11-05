import {
  createWalletClient,
  custom,
  parseEther,
  type Address,
  type Hash,
} from "viem";
import { baseSepolia } from "viem/chains";

export const TESTNET_CHAIN_ID = 84532;

export const NONCE_TESTNET_ABI = [
  {
    type: "function",
    name: "requestWithdrawal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveWithdrawal",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "executeWithdrawal",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelWithdrawal",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "freeze",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelWithdrawal",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "proposePolicy",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "next",
        type: "tuple",
        components: [
          { name: "perTransactionLimit", type: "uint256" },
          { name: "largeWithdrawalThreshold", type: "uint256" },
          { name: "rollingLimit", type: "uint256" },
          { name: "withdrawalDelay", type: "uint64" },
          { name: "allowlistOnly", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "approvePolicy",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "executePolicy",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelPolicy",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "proposeRecovery",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveRecovery",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "executeRecovery",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "proposeRestoration",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveRestoration",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "executeRestoration",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

function ethereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No EVM wallet was found in this browser. Install or enable a wallet to use testnet mode.",
    );
  }
  return window.ethereum;
}

export async function connectTestnetWallet(): Promise<Address> {
  const provider = ethereum();
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw new Error("The wallet did not return an account.");
  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainIdHex, 16) !== TESTNET_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${TESTNET_CHAIN_ID.toString(16)}` }],
      });
    } catch {
      throw new Error(
        "Switch your wallet to Base Sepolia (chain ID 84532) before submitting a testnet transaction.",
      );
    }
  }
  return accounts[0] as Address;
}

async function requireTestnetChain(): Promise<void> {
  const provider = ethereum();
  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainIdHex, 16) !== TESTNET_CHAIN_ID) {
    throw new Error(
      `Your wallet is on chain ${Number.parseInt(chainIdHex, 16)}. Switch to Base Sepolia (84532) before sending.`,
    );
  }
}

function walletFor(account: Address) {
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: custom(ethereum()),
  });
}

export async function depositTestnet(
  contract: Address,
  amountEth: string,
  account: Address,
): Promise<Hash> {
  const value = parseEther(amountEth);
  if (value <= 0n) throw new Error("Enter a positive testnet ETH amount.");
  await requireTestnetChain();
  return walletFor(account).sendTransaction({
    account,
    chain: baseSepolia,
    to: contract,
    value,
  });
}

export async function requestTestnetWithdrawal(
  contract: Address,
  amountEth: string,
  recipient: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "requestWithdrawal",
    args: [parseEther(amountEth), recipient],
    account,
    chain: baseSepolia,
  });
}

export async function approveTestnetWithdrawal(
  contract: Address,
  id: number,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "approveWithdrawal",
    args: [BigInt(id)],
    account,
    chain: baseSepolia,
  });
}

export async function executeTestnetWithdrawal(
  contract: Address,
  id: number,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "executeWithdrawal",
    args: [BigInt(id)],
    account,
    chain: baseSepolia,
  });
}

export async function cancelTestnetWithdrawal(
  contract: Address,
  id: number,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "cancelWithdrawal",
    args: [BigInt(id)],
    account,
    chain: baseSepolia,
  });
}

export type TestnetPolicyInput = {
  perTransactionLimitEth: string;
  largeWithdrawalThresholdEth: string;
  rollingLimitEth: string;
  withdrawalDelayMinutes: number;
  allowlistOnly: boolean;
};

export async function proposeTestnetPolicy(
  contract: Address,
  input: TestnetPolicyInput,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "proposePolicy",
    args: [
      {
        perTransactionLimit: parseEther(input.perTransactionLimitEth),
        largeWithdrawalThreshold: parseEther(input.largeWithdrawalThresholdEth),
        rollingLimit: parseEther(input.rollingLimitEth),
        withdrawalDelay: BigInt(Math.round(input.withdrawalDelayMinutes * 60)),
        allowlistOnly: input.allowlistOnly,
      },
    ],
    account,
    chain: baseSepolia,
  });
}

export async function approveTestnetPolicy(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "approvePolicy",
    account,
    chain: baseSepolia,
  });
}

export async function executeTestnetPolicy(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "executePolicy",
    account,
    chain: baseSepolia,
  });
}

export async function cancelTestnetPolicy(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "cancelPolicy",
    account,
    chain: baseSepolia,
  });
}

export async function freezeTestnetVault(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "freeze",
    account,
    chain: baseSepolia,
  });
}

export async function proposeTestnetRecovery(
  contract: Address,
  replacement: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "proposeRecovery",
    args: [replacement],
    account,
    chain: baseSepolia,
  });
}

export async function approveTestnetRecovery(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "approveRecovery",
    account,
    chain: baseSepolia,
  });
}

export async function executeTestnetRecovery(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "executeRecovery",
    account,
    chain: baseSepolia,
  });
}

export async function proposeTestnetRestoration(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "proposeRestoration",
    account,
    chain: baseSepolia,
  });
}

export async function approveTestnetRestoration(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "approveRestoration",
    account,
    chain: baseSepolia,
  });
}

export async function executeTestnetRestoration(
  contract: Address,
  account: Address,
): Promise<Hash> {
  await requireTestnetChain();
  return walletFor(account).writeContract({
    address: contract,
    abi: NONCE_TESTNET_ABI,
    functionName: "executeRestoration",
    account,
    chain: baseSepolia,
  });
}

export function explorerTx(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddress(baseUrl: string, address: string): string {
  return `${baseUrl.replace(/\/$/, "")}/address/${address}`;
}
