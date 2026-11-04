/**
 * Minimal EIP-1193 helpers. Wallet keys stay inside the wallet extension; the
 * app only ever receives an address and a signature.
 */
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  isMetaMask?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getInjectedWallet(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function humanizeWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|denied/i.test(message)) return "The wallet request was rejected.";
  if (/no ethereum|not installed/i.test(message)) return "No browser wallet was found.";
  if (/chain/i.test(message)) return "Switch your wallet to Base Sepolia and try again.";
  return message;
}

export async function connectInjectedWallet(): Promise<{
  address: string;
  chainId: number;
}> {
  const provider = getInjectedWallet();
  if (!provider) {
    throw new Error(
      "No browser wallet found. Install an EVM wallet, or continue with a sandbox signer.",
    );
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Wallet returned no accounts.");
  }
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  return { address: accounts[0], chainId: Number.parseInt(chainHex, 16) };
}

export async function signChallenge(address: string, message: string): Promise<string> {
  const provider = getInjectedWallet();
  if (!provider) throw new Error("No browser wallet found.");
  const signature = (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  if (typeof signature !== "string") {
    throw new Error("Wallet returned an unexpected signature.");
  }
  return signature;
}

export async function switchToBaseSepolia(): Promise<void> {
  const provider = getInjectedWallet();
  if (!provider) throw new Error("No browser wallet found.");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14a34" }],
    });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x14a34",
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
      return;
    }
    throw error;
  }
}

/** Sandbox address generation. No private key exists for these addresses. */
export function generateSandboxAddress(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim()) && !/^0x0{40}$/.test(value.trim());
}
