"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type Log,
} from "viem";
import { baseSepolia } from "viem/chains";
import { readTestnetConfig } from "./testnetConfig";
import { TESTNET_INDEX_NETWORK } from "./testnetEvents";

const EVENT_ABI = parseAbi([
  "event Deposited(address indexed from, uint256 amount)",
  "event WithdrawalQueued(uint256 indexed id, address indexed recipient, uint256 amount, uint64 executeAfter, bool requiresGuardians, uint256 rollingSpent)",
  "event WithdrawalApproved(uint256 indexed id, address indexed guardian, uint8 approvals)",
  "event WithdrawalCancelled(uint256 indexed id, address indexed by)",
  "event WithdrawalExpiredCleanup(uint256 indexed id, address indexed by)",
  "event WithdrawalExecuted(uint256 indexed id, address indexed recipient, uint256 amount)",
  "event PolicyProposed(uint256 indexed nonce, address indexed proposer, uint256 perTransactionLimit, uint256 largeThreshold, uint256 rollingLimit, uint64 withdrawalDelay, bool allowlistOnly, bool weakening, uint64 executeAfter)",
  "event PolicyApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event PolicyCancelled(uint256 indexed nonce)",
  "event PolicyExecuted(uint256 indexed nonce, uint256 perTransactionLimit, uint256 largeThreshold, uint256 rollingLimit, uint64 withdrawalDelay, bool allowlistOnly)",
  "event Allowlisted(address indexed account, bool allowed)",
  "event AllowlistRemovalProposed(uint256 indexed nonce, address indexed account, uint64 executeAfter)",
  "event AllowlistRemovalApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event AllowlistRemovalCancelled(uint256 indexed nonce)",
  "event AllowlistRemovalExecuted(uint256 indexed nonce, address indexed account)",
  "event GuardianRotationProposed(uint256 indexed nonce, uint8 indexed index, address indexed newGuardian, uint64 executeAfter)",
  "event GuardianRotationApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event GuardianRotationCancelled(uint256 indexed nonce)",
  "event GuardianRotationExecuted(uint256 indexed nonce, uint8 index, address oldGuardian, address newGuardian)",
  "event MonitorFreeze(address indexed by)",
  "event RecoveryProposed(uint256 indexed nonce, address indexed proposer, address indexed proposedOwner, bool ownerInitiated, uint64 executeAfter)",
  "event RecoveryApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event RecoveryCancelApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event RecoveryCancelled(uint256 indexed nonce, address indexed by)",
  "event RecoveryExecuted(address indexed previousOwner, address indexed newOwner, uint256 indexed newEpoch)",
  "event RestorationProposed(uint256 indexed nonce, address indexed proposer, uint64 executeAfter)",
  "event RestorationApproved(uint256 indexed nonce, address indexed guardian, uint8 approvals)",
  "event RestorationCancelled(uint256 indexed nonce, address indexed by)",
  "event RestorationExecuted(uint256 indexed nonce)",
]);

const MAX_RANGE = 500n;
const REORG_DEPTH = 12n;

type Alert = {
  severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  category: string;
  reason: string;
};

type SyncResult =
  | {
      ok: false;
      configured: boolean;
      error: string;
      blockers: string[];
    }
  | {
      ok: true;
      configured: true;
      head: number;
      fromBlock: number;
      toBlock: number;
      scanned: number;
      inserted: number;
      duplicates: number;
      alerts: number;
      upToDate?: boolean;
      finalized?: boolean;
    };

function classify(eventName: string, args: Record<string, unknown>): Alert | undefined {
  switch (eventName) {
    case "WithdrawalQueued":
      return {
        severity: "WARNING",
        category: "WITHDRAWAL_QUEUED",
        reason:
          "A withdrawal entered the delay queue. This is observable contract activity, not proof that the request is malicious.",
      };
    case "WithdrawalExecuted":
      return {
        severity: "WARNING",
        category: "WITHDRAWAL_EXECUTED",
        reason:
          "A queued withdrawal executed after its delay and any required guardian approvals.",
      };
    case "MonitorFreeze":
      return {
        severity: "CRITICAL",
        category: "VAULT_FROZEN",
        reason:
          "The monitor or owner froze the vault. Exits are blocked until authorized restoration or recovery.",
      };
    case "RecoveryProposed":
      return {
        severity: "HIGH",
        category: "RECOVERY_PROPOSED",
        reason:
          "A guardian or owner proposed replacing the vault owner. The vault is frozen during recovery.",
      };
    case "RecoveryExecuted":
      return {
        severity: "CRITICAL",
        category: "OWNER_REPLACED",
        reason:
          "Recovery executed and the security epoch advanced. Future withdrawals must use the new owner.",
      };
    case "GuardianRotationExecuted":
      return {
        severity: "HIGH",
        category: "GUARDIAN_ROTATED",
        reason: "A guardian was replaced by a timelocked, two-approval rotation.",
      };
    case "AllowlistRemovalProposed":
      return {
        severity: "WARNING",
        category: "ALLOWLIST_REMOVAL",
        reason:
          "A timelocked allowlist removal was proposed. It cannot execute until the delay and guardian quorum are met.",
      };
    case "PolicyProposed":
      if (args.weakening === true) {
        return {
          severity: "HIGH",
          category: "POLICY_WEAKENING",
          reason:
            "A policy proposal reduces protection. It requires two guardian approvals and the full timelock.",
        };
      }
      return undefined;
    case "PolicyExecuted":
      return {
        severity: "WARNING",
        category: "POLICY_CHANGED",
        reason: "A timelocked policy proposal executed.",
      };
    case "RestorationExecuted":
      return {
        severity: "INFO",
        category: "FALSE_POSITIVE_RESTORED",
        reason: "Guardian-approved restoration cleared a monitor freeze.",
      };
    default:
      return undefined;
  }
}

function serializeArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

function parseLogs(logs: Log[], chainId: number, address: string) {
  const parsed = parseEventLogs({ abi: EVENT_ABI, logs, strict: false });
  const events: Array<{
    uniqueKey: string;
    blockNumber: number;
    blockHash: string;
    txHash: string;
    logIndex: number;
    eventType: string;
    payload: string;
    alert?: Alert;
  }> = [];

  for (const log of parsed) {
    if (!log.eventName || !log.transactionHash || !log.blockHash) continue;
    const args = (log.args ?? {}) as Record<string, unknown>;
    events.push({
      uniqueKey: `${chainId}:${address.toLowerCase()}:${log.transactionHash}:${log.logIndex}`,
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      eventType: log.eventName,
      payload: serializeArgs(args),
      alert: classify(log.eventName, args),
    });
  }
  return events;
}

/**
 * One bounded indexer tick. The public action requires an authenticated user;
 * the internal poll action is used by the Convex cron worker so monitoring does
 * not depend on a browser tab being open.
 */
async function runSync(ctx: ActionCtx): Promise<SyncResult> {
  const config = readTestnetConfig();
  if (!config.configured || !config.contractAddress) {
    return {
      ok: false as const,
      configured: false,
      error: config.blockers.join(" "),
      blockers: config.blockers,
    };
  }

  const address = getAddress(config.contractAddress) as Address;
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL, {
      timeout: 15_000,
      retryCount: 2,
      retryDelay: 750,
    }),
  });

  try {
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") {
      return {
        ok: false as const,
        configured: true,
        error: "No contract bytecode exists at NONCE_VAULT_ADDRESS on Base Sepolia.",
        blockers: config.blockers,
      };
    }

    const head = await client.getBlockNumber();
    const checkpoint = await ctx.runQuery(internal.nonce.testnetEvents.checkpoint, {
      network: TESTNET_INDEX_NETWORK,
    });

    let fromBlock: bigint;
    if (checkpoint) {
      fromBlock = BigInt(checkpoint.lastProcessedBlock + 1);
      try {
        const canonical = await client.getBlock({
          blockNumber: BigInt(checkpoint.lastProcessedBlock),
        });
        if (canonical.hash !== checkpoint.lastProcessedBlockHash) {
          const rewindFrom = Math.max(
            0,
            checkpoint.lastProcessedBlock - Number(REORG_DEPTH),
          );
          await ctx.runMutation(internal.nonce.testnetEvents.rewind, {
            network: TESTNET_INDEX_NETWORK,
            fromBlock: rewindFrom,
          });
          fromBlock = BigInt(rewindFrom);
        }
      } catch {
        // If the old block is unavailable, fall back to a bounded rewind.
        const rewindFrom = Math.max(
          0,
          checkpoint.lastProcessedBlock - Number(REORG_DEPTH),
        );
        await ctx.runMutation(internal.nonce.testnetEvents.rewind, {
          network: TESTNET_INDEX_NETWORK,
          fromBlock: rewindFrom,
        });
        fromBlock = BigInt(rewindFrom);
      }
    } else if (config.deploymentTxHash) {
      try {
        const receipt = await client.getTransactionReceipt({
          hash: config.deploymentTxHash as `0x${string}`,
        });
        fromBlock = receipt.blockNumber;
      } catch {
        fromBlock = head > 200n ? head - 200n : 0n;
      }
    } else {
      // A new indexer cannot scan all of Base Sepolia. Start with a bounded
      // recent window; the deployment transaction should be configured to
      // avoid missing the first events.
      fromBlock = head > 200n ? head - 200n : 0n;
    }

    if (fromBlock > head) {
      return {
        ok: true as const,
        configured: true,
        upToDate: true,
        head: Number(head),
        fromBlock: Number(fromBlock),
        toBlock: Number(head),
        scanned: 0,
        inserted: 0,
        duplicates: 0,
        alerts: 0,
      };
    }

    const toBlock = fromBlock + MAX_RANGE - 1n > head ? head : fromBlock + MAX_RANGE - 1n;
    const logs = await client.getLogs({
      address,
      fromBlock,
      toBlock,
    });
    const events = parseLogs(logs, config.chainId, address);
    const lastBlock = await client.getBlock({ blockNumber: toBlock });
    if (!lastBlock.hash) throw new Error("The RPC returned a block without a hash.");
    const observedAt = Date.now();
    const finalized = toBlock + REORG_DEPTH <= head;

    const result: { inserted: number; duplicates: number; alerts: number } =
      await ctx.runMutation(internal.nonce.testnetEvents.recordBatch, {
      network: TESTNET_INDEX_NETWORK,
      chainId: config.chainId,
      contractAddress: address,
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      blockHash: lastBlock.hash,
      finalized,
      observedAt,
      events,
    });

    return {
      ok: true as const,
      configured: true,
      head: Number(head),
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      scanned: logs.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      alerts: result.alerts,
      finalized,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.nonce.testnetEvents.recordFailure, {
      network: TESTNET_INDEX_NETWORK,
      chainId: config.chainId,
      message,
      observedAt: Date.now(),
    });
    return {
      ok: false as const,
      configured: true,
      error: message,
      blockers: config.blockers,
    };
  }
}

export const sync = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new Error("Sign in to index the testnet contract.");
    }
    return await runSync(ctx);
  },
});

/** Cron entry point. No user session is required; configuration gates it. */
export const poll = internalAction({
  args: {},
  handler: async (ctx) => {
    return await runSync(ctx);
  },
});
