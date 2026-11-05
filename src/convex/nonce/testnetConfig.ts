import { v } from "convex/values";
import { query } from "../_generated/server";
import { userIdOrNull } from "./db";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

export type TestnetConfigView = {
  chainId: number;
  network: string;
  contractAddress: string | null;
  deploymentTxHash: string | null;
  explorerBaseUrl: string;
  rpcConfigured: boolean;
  verifiedOnExplorer: boolean;
  configured: boolean;
  blockers: string[];
};

/**
 * Reads deployment configuration only. The RPC URL is never returned to the
 * browser; it stays on the Convex deployment and is used by the read action.
 */
export function readTestnetConfig(): TestnetConfigView {
  const rawAddress = (process.env.NONCE_VAULT_ADDRESS ?? "").trim();
  const addressValid = /^0x[a-fA-F0-9]{40}$/.test(rawAddress);
  const chainId = Number(process.env.NONCE_CHAIN_ID ?? BASE_SEPOLIA_CHAIN_ID);
  const rpcConfigured = Boolean((process.env.BASE_SEPOLIA_RPC_URL ?? "").trim());
  const deploymentTxHash = (process.env.NONCE_DEPLOYMENT_TX_HASH ?? "").trim() || null;
  const verifiedOnExplorer =
    (process.env.NONCE_CONTRACT_VERIFIED ?? "").toLowerCase() === "true";
  const explorerBaseUrl = (
    process.env.NONCE_EXPLORER_URL ?? BASE_SEPOLIA_EXPLORER
  ).replace(/\/$/, "");

  const blockers: string[] = [];
  if (!addressValid) {
    blockers.push(
      "NONCE_VAULT_ADDRESS is not configured with a deployed contract address.",
    );
  }
  if (!rpcConfigured) {
    blockers.push(
      "BASE_SEPOLIA_RPC_URL is not configured on the Convex deployment, so live contract state cannot be read.",
    );
  }
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
    blockers.push(
      `NONCE_CHAIN_ID is ${chainId}; this build only supports Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}).`,
    );
  }
  if (!deploymentTxHash) {
    blockers.push("NONCE_DEPLOYMENT_TX_HASH is not recorded.");
  }
  if (!verifiedOnExplorer) {
    blockers.push(
      "Contract verification is not recorded. Do not describe the contract as verified until Basescan confirms it.",
    );
  }

  return {
    chainId,
    network: chainId === BASE_SEPOLIA_CHAIN_ID ? "Base Sepolia" : `Chain ${chainId}`,
    contractAddress: addressValid ? rawAddress : null,
    deploymentTxHash,
    explorerBaseUrl,
    rpcConfigured,
    verifiedOnExplorer,
    configured: addressValid && rpcConfigured && chainId === BASE_SEPOLIA_CHAIN_ID,
    blockers,
  };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    return readTestnetConfig();
  },
});

export const contractArgs = {
  address: v.string(),
  chainId: v.number(),
};
