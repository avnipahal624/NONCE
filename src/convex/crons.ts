import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Bounded polling worker. It is a no-op until NONCE_VAULT_ADDRESS,
 * BASE_SEPOLIA_RPC_URL and the other deployment values are configured, so the
 * demo deployment does not invent chain data.
 */
crons.interval(
  "nonce-testnet-indexer",
  { minutes: 2 },
  internal.nonce.testnetIndexer.poll,
  {},
);

export default crons;
