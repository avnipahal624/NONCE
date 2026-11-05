"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { readTestnetConfig } from "./testnetConfig";

const ABI = parseAbi([
  "function owner() view returns (address)",
  "function monitor() view returns (address)",
  "function frozen() view returns (bool)",
  "function epoch() view returns (uint256)",
  "function guardians(uint256 index) view returns (address)",
  "function getPolicy() view returns (uint256 perTransactionLimit, uint256 largeWithdrawalThreshold, uint256 rollingLimit, uint64 withdrawalDelay, bool allowlistOnly)",
  "function reservedBalance() view returns (uint256)",
  "function getRollingSpent() view returns (uint256)",
  "function getRollingRemaining() view returns (uint256)",
  "function withdrawalCount() view returns (uint256)",
  "function withdrawals(uint256 id) view returns (address recipient, uint256 amount, uint64 executeAfter, uint64 expiresAt, uint256 epoch, uint8 approvals, bool requiresGuardians, bool cancelled, bool executed)",
  "function getRecoveryProposal() view returns (address proposedOwner, address proposer, uint64 executeAfter, uint8 approvals, uint8 cancelApprovals, bool active, bool ownerInitiated, uint256 nonce)",
  "function getPolicyProposal() view returns (uint256 perTransactionLimit, uint256 largeWithdrawalThreshold, uint256 rollingLimit, uint64 withdrawalDelay, bool allowlistOnly, uint64 createdAt, uint64 executeAfter, uint8 approvals, bool weakening, bool active, uint256 nonce, address proposer)",
  "function getRestorationProposal() view returns (address proposer, uint64 executeAfter, uint8 approvals, uint8 cancelApprovals, bool active, bool ownerInitiated, uint256 nonce)",
]);

function clientFor(chainId: number) {
  const config = readTestnetConfig();
  if (!config.configured || !config.contractAddress) {
    return { config, client: null as ReturnType<typeof createPublicClient> | null };
  }
  if (chainId !== 84532) {
    return { config, client: null };
  }
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL, {
      timeout: 12_000,
      retryCount: 1,
    }),
  });
  return { config, client };
}

/**
 * Reads the deployed contract. Every value comes from the configured chain.
 * If configuration, RPC or bytecode is missing, the action says so rather than
 * returning a placeholder state.
 */
export const readVault = action({
  args: { withdrawalId: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new Error("Sign in to read the testnet vault.");
    }
    const config = readTestnetConfig();
    if (!config.configured || !config.contractAddress) {
      return {
        ok: false as const,
        configured: false,
        blockers: config.blockers,
        error: "Testnet contract is not configured.",
      };
    }
    const { client } = clientFor(config.chainId);
    if (!client) {
      return {
        ok: false as const,
        configured: false,
        blockers: config.blockers,
        error: "No RPC client is available.",
      };
    }
    const address = getAddress(config.contractAddress) as Address;

    try {
      const code = await client.getBytecode({ address });
      if (!code || code === "0x") {
        return {
          ok: false as const,
          configured: true,
          blockers: config.blockers,
          error:
            "No contract bytecode exists at NONCE_VAULT_ADDRESS on Base Sepolia. The address is not a deployed vault.",
        };
      }

      const [
        owner,
        monitor,
        frozen,
        epoch,
        guardian0,
        guardian1,
        guardian2,
        policy,
        reservedBalance,
        rollingSpent,
        rollingRemaining,
        withdrawalCount,
        recovery,
        policyProposal,
        restoration,
        blockNumber,
      ] = await Promise.all([
        client.readContract({ address, abi: ABI, functionName: "owner" }),
        client.readContract({ address, abi: ABI, functionName: "monitor" }),
        client.readContract({ address, abi: ABI, functionName: "frozen" }),
        client.readContract({ address, abi: ABI, functionName: "epoch" }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "guardians",
          args: [0n],
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "guardians",
          args: [1n],
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "guardians",
          args: [2n],
        }),
        client.readContract({ address, abi: ABI, functionName: "getPolicy" }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "reservedBalance",
        }),
        client.readContract({ address, abi: ABI, functionName: "getRollingSpent" }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "getRollingRemaining",
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "withdrawalCount",
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "getRecoveryProposal",
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "getPolicyProposal",
        }),
        client.readContract({
          address,
          abi: ABI,
          functionName: "getRestorationProposal",
        }),
        client.getBlockNumber(),
      ]);

      let latestWithdrawal = null;
      const requestedId =
        args.withdrawalId ??
        (withdrawalCount > 0n ? Number(withdrawalCount) : undefined);
      if (requestedId && requestedId > 0) {
        try {
          const w = await client.readContract({
            address,
            abi: ABI,
            functionName: "withdrawals",
            args: [BigInt(requestedId)],
          });
          latestWithdrawal = {
            id: requestedId,
            recipient: w[0],
            amountWei: w[1].toString(),
            amountEth: formatEther(w[1]),
            executeAfter: Number(w[2]),
            expiresAt: Number(w[3]),
            epoch: Number(w[4]),
            approvals: Number(w[5]),
            requiresGuardians: w[6],
            cancelled: w[7],
            executed: w[8],
          };
        } catch {
          latestWithdrawal = null;
        }
      }

      return {
        ok: true as const,
        configured: true,
        blockers: config.blockers,
        observedAt: Date.now(),
        blockNumber: Number(blockNumber),
        chainId: config.chainId,
        contractAddress: address,
        deploymentTxHash: config.deploymentTxHash,
        verifiedOnExplorer: config.verifiedOnExplorer,
        explorerBaseUrl: config.explorerBaseUrl,
        owner,
        monitor,
        frozen,
        epoch: Number(epoch),
        guardians: [guardian0, guardian1, guardian2],
        policy: {
          perTransactionLimitWei: policy[0].toString(),
          perTransactionLimitEth: formatEther(policy[0]),
          largeWithdrawalThresholdWei: policy[1].toString(),
          largeWithdrawalThresholdEth: formatEther(policy[1]),
          rollingLimitWei: policy[2].toString(),
          rollingLimitEth: formatEther(policy[2]),
          withdrawalDelaySeconds: Number(policy[3]),
          allowlistOnly: policy[4],
        },
        reservedBalanceWei: reservedBalance.toString(),
        reservedBalanceEth: formatEther(reservedBalance),
        rollingSpentWei: rollingSpent.toString(),
        rollingSpentEth: formatEther(rollingSpent),
        rollingRemainingWei: rollingRemaining.toString(),
        rollingRemainingEth: formatEther(rollingRemaining),
        withdrawalCount: Number(withdrawalCount),
        latestWithdrawal,
        recovery: {
          proposedOwner: recovery[0],
          proposer: recovery[1],
          executeAfter: Number(recovery[2]),
          approvals: Number(recovery[3]),
          cancelApprovals: Number(recovery[4]),
          active: recovery[5],
          ownerInitiated: recovery[6],
          nonce: recovery[7].toString(),
        },
        policyProposal: {
          perTransactionLimitEth: formatEther(policyProposal[0]),
          largeWithdrawalThresholdEth: formatEther(policyProposal[1]),
          rollingLimitEth: formatEther(policyProposal[2]),
          withdrawalDelaySeconds: Number(policyProposal[3]),
          allowlistOnly: policyProposal[4],
          createdAt: Number(policyProposal[5]),
          executeAfter: Number(policyProposal[6]),
          approvals: Number(policyProposal[7]),
          weakening: policyProposal[8],
          active: policyProposal[9],
          nonce: policyProposal[10].toString(),
          proposer: policyProposal[11],
        },
        restoration: {
          proposer: restoration[0],
          executeAfter: Number(restoration[1]),
          approvals: Number(restoration[2]),
          cancelApprovals: Number(restoration[3]),
          active: restoration[4],
          ownerInitiated: restoration[5],
          nonce: restoration[6].toString(),
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        configured: true,
        blockers: config.blockers,
        error:
          error instanceof Error
            ? error.message
            : "The RPC endpoint did not return a valid contract state.",
      };
    }
  },
});

/**
 * Verifies a transaction against an actual receipt. A hash submitted by a
 * wallet is only "pending" until this returns success with confirmations.
 */
export const verifyTransaction = action({
  args: { txHash: v.string() },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new Error("Sign in to verify a testnet transaction.");
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(args.txHash)) {
      throw new Error("Enter a 32-byte transaction hash.");
    }
    const config = readTestnetConfig();
    if (!config.configured) {
      return {
        ok: false as const,
        status: "UNCONFIGURED" as const,
        error: config.blockers.join(" "),
      };
    }
    const { client } = clientFor(config.chainId);
    if (!client) {
      return {
        ok: false as const,
        status: "UNCONFIGURED" as const,
        error: "No RPC client is available.",
      };
    }
    try {
      const receipt = await client.getTransactionReceipt({
        hash: args.txHash as `0x${string}`,
      });
      if (!receipt) {
        return {
          ok: true as const,
          status: "PENDING" as const,
          txHash: args.txHash,
          explorerUrl: `${config.explorerBaseUrl}/tx/${args.txHash}`,
          confirmations: 0,
          blockNumber: null,
        };
      }
      const head = await client.getBlockNumber();
      const confirmations =
        head >= receipt.blockNumber ? Number(head - receipt.blockNumber + 1n) : 0;
      return {
        ok: true as const,
        status:
          receipt.status === "success"
            ? ("CONFIRMED" as const)
            : ("REVERTED" as const),
        txHash: receipt.transactionHash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.transactionHash}`,
        confirmations,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const pending = /not found|could not be found|unknown transaction/i.test(message);
      return {
        ok: !pending,
        status: pending ? ("PENDING" as const) : ("ERROR" as const),
        txHash: args.txHash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${args.txHash}`,
        confirmations: 0,
        blockNumber: null,
        error: pending ? undefined : message,
      };
    }
  },
});

export const readGuardianSet = action({
  args: {},
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new Error("Sign in to read the testnet guardian set.");
    }
    const config = readTestnetConfig();
    if (!config.configured || !config.contractAddress) return null;
    if (!isAddress(config.contractAddress)) return null;
    return { address: config.contractAddress, chainId: config.chainId };
  },
});
