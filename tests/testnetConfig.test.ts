import { afterEach, describe, expect, test } from "bun:test";
import { readTestnetConfig } from "../src/convex/nonce/testnetConfig";

const KEYS = [
  "NONCE_VAULT_ADDRESS",
  "NONCE_CHAIN_ID",
  "BASE_SEPOLIA_RPC_URL",
  "NONCE_DEPLOYMENT_TX_HASH",
  "NONCE_CONTRACT_VERIFIED",
  "NONCE_EXPLORER_URL",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setConfig(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("testnet configuration", () => {
  test("reports blockers instead of inventing a deployment", () => {
    setConfig({});
    const config = readTestnetConfig();
    expect(config.configured).toBe(false);
    expect(config.contractAddress).toBeNull();
    expect(config.chainId).toBe(84532);
    expect(config.blockers).toContain(
      "NONCE_VAULT_ADDRESS is not configured with a deployed contract address.",
    );
    expect(config.blockers).toContain(
      "BASE_SEPOLIA_RPC_URL is not configured on the Convex deployment, so live contract state cannot be read.",
    );
  });

  test("accepts a complete Base Sepolia configuration", () => {
    setConfig({
      NONCE_VAULT_ADDRESS: "0x1111111111111111111111111111111111111111",
      NONCE_CHAIN_ID: "84532",
      BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
      NONCE_DEPLOYMENT_TX_HASH: `0x${"ab".repeat(32)}`,
      NONCE_CONTRACT_VERIFIED: "true",
    });
    const config = readTestnetConfig();
    expect(config.configured).toBe(true);
    expect(config.contractAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(config.blockers).toEqual([]);
    expect(config.verifiedOnExplorer).toBe(true);
  });

  test("rejects a malformed deployment hash", () => {
    setConfig({
      NONCE_VAULT_ADDRESS: "0x1111111111111111111111111111111111111111",
      NONCE_CHAIN_ID: "84532",
      BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
      NONCE_DEPLOYMENT_TX_HASH: "0x1234",
      NONCE_CONTRACT_VERIFIED: "true",
    });
    const config = readTestnetConfig();
    expect(config.deploymentTxHash).toBeNull();
    expect(config.blockers).toContain(
      "NONCE_DEPLOYMENT_TX_HASH is not a 32-byte transaction hash.",
    );
  });

  test("rejects a non-Base-Sepolia chain", () => {
    setConfig({
      NONCE_VAULT_ADDRESS: "0x1111111111111111111111111111111111111111",
      NONCE_CHAIN_ID: "1",
      BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
      NONCE_DEPLOYMENT_TX_HASH: `0x${"ab".repeat(32)}`,
      NONCE_CONTRACT_VERIFIED: "true",
    });
    const config = readTestnetConfig();
    expect(config.configured).toBe(false);
    expect(config.blockers.some((entry) => entry.includes("only supports Base Sepolia"))).toBe(
      true,
    );
  });
});
