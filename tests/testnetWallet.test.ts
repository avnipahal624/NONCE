import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  connectTestnetWallet,
  requestTestnetWithdrawal,
  TESTNET_CHAIN_ID,
} from "../src/lib/testnet";

type Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

const ADDRESS = "0x1111111111111111111111111111111111111111";

function installProvider(provider: Provider) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { ethereum: provider },
  });
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

beforeEach(() => {
  installProvider({
    request: async () => {
      throw new Error("unexpected request");
    },
  });
});

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
});

describe("testnet wallet connection", () => {
  test("refuses to proceed without an injected wallet", async () => {
    delete (globalThis as { window?: unknown }).window;
    await expect(connectTestnetWallet()).rejects.toThrow(/No EVM wallet/i);
  });

  test("returns an account already on Base Sepolia", async () => {
    installProvider({
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [ADDRESS];
        if (method === "eth_chainId") return `0x${TESTNET_CHAIN_ID.toString(16)}`;
        throw new Error(`unexpected ${method}`);
      },
    });
    await expect(connectTestnetWallet()).resolves.toBe(ADDRESS);
  });

  test("reports a rejected network switch", async () => {
    installProvider({
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [ADDRESS];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          throw new Error("User rejected the request");
        }
        throw new Error(`unexpected ${method}`);
      },
    });
    await expect(connectTestnetWallet()).rejects.toThrow(/Base Sepolia/i);
  });

  test("blocks a withdrawal write on the wrong chain", async () => {
    installProvider({
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x1";
        throw new Error("write must not be attempted");
      },
    });
    await expect(
      requestTestnetWithdrawal(
        "0x2222222222222222222222222222222222222222",
        "0.01",
        "0x3333333333333333333333333333333333333333",
        ADDRESS,
      ),
    ).rejects.toThrow(/chain 1|Base Sepolia/i);
  });
});
