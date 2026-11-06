import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { formatEther, formatGwei, type Address as ViemAddress, type Hash } from "viem";
import { Address } from "@/components/nonce/Address";
import { SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectTestnetWallet, explorerAddress, explorerTx } from "@/lib/testnet";
import {
  BASE_SEPOLIA_EXPLORER,
  NONCE_VAULT_OWNER,
  deployVault,
  estimateVaultDeployment,
  loadNonceVaultArtifact,
  readDeploymentWallet,
  validateVaultDeployment,
  verifyVaultDeployment,
  type DeployArtifact,
  type DeploymentQuote,
  type DeploymentVerification,
  type VaultDeploymentConfig,
  type VaultDeploymentForm,
} from "@/lib/testnetDeploy";
import { humanizeWalletError } from "@/lib/wallet";
import { cn } from "@/lib/utils";

const DEFAULT_FORM: VaultDeploymentForm = {
  monitor: "",
  guardians: ["", "", ""],
  perTransactionLimitEth: "0.1",
  largeWithdrawalThresholdEth: "0.02",
  rollingLimitEth: "0.3",
  withdrawalDelayMinutes: "30",
  recoveryDelayDays: "2",
  policyDelayDays: "1",
};

type WalletState = {
  account: ViemAddress;
  chainId: number;
  balanceWei: bigint;
};

type Busy = "connect" | "wallet" | "quote" | "deploy" | "verify" | null;

function short(value: string, lead = 10, tail = 6): string {
  return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function formatEth(value: bigint): string {
  return `${formatEther(value)} ETH`;
}

function delayLabel(seconds: bigint): string {
  if (seconds % 86_400n === 0n) {
    const days = Number(seconds / 86_400n);
    return `${seconds} sec · ${days} day${days === 1 ? "" : "s"}`;
  }
  return `${seconds} sec · ${Math.round(Number(seconds) / 60)} min`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-sage">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[9px] leading-4 text-sage">{hint}</span>}
    </label>
  );
}

function ArgsList({ config }: { config: VaultDeploymentConfig }) {
  const rows: Array<[string, string]> = [
    ["initialOwner", config.owner],
    ["monitor", config.monitor],
    ["guardians[0]", config.guardians[0]],
    ["guardians[1]", config.guardians[1]],
    ["guardians[2]", config.guardians[2]],
    ["perTransactionLimit", `${config.perTransactionLimit} wei`],
    ["largeWithdrawalThreshold", `${config.largeWithdrawalThreshold} wei`],
    ["rollingLimit", `${config.rollingLimit} wei`],
    ["withdrawalDelay", `${config.withdrawalDelay} sec`],
    ["recoveryDelay", `${config.recoveryDelay} sec`],
    ["policyDelay", `${config.policyDelay} sec`],
  ];

  return (
    <dl className="mt-2 divide-y divide-hairline/40 rounded-lg border border-hairline/60 bg-black/20">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
          <dt className="font-mono text-[9px] text-sage">{label}</dt>
          <dd className="max-w-[70%] break-all text-right font-mono text-[9px] text-ivory/80">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VerifiedConfig({ verification }: { verification: DeploymentVerification }) {
  const rows: Array<[string, string]> = [
    ["owner()", verification.owner],
    ["monitor()", verification.monitor],
    ["guardians(0)", verification.guardians[0]],
    ["guardians(1)", verification.guardians[1]],
    ["guardians(2)", verification.guardians[2]],
    ["getPolicy().perTransactionLimit", formatEth(verification.policy.perTransactionLimit)],
    [
      "getPolicy().largeWithdrawalThreshold",
      formatEth(verification.policy.largeWithdrawalThreshold),
    ],
    ["getPolicy().rollingLimit", formatEth(verification.policy.rollingLimit)],
    ["getPolicy().withdrawalDelay", delayLabel(verification.policy.withdrawalDelay)],
    ["getPolicy().allowlistOnly", String(verification.policy.allowlistOnly)],
    ["recoveryDelay()", delayLabel(verification.recoveryDelay)],
    ["policyDelay()", delayLabel(verification.policyDelay)],
    ["epoch()", String(verification.epoch)],
    ["frozen()", String(verification.frozen)],
  ];

  return (
    <dl className="mt-3 divide-y divide-hairline/40 rounded-lg border border-hairline/60 bg-black/20">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
          <dt className="font-mono text-[9px] text-sage">{label}</dt>
          <dd className="max-w-[68%] break-all text-right font-mono text-[9px] text-ivory/80">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Live Base Sepolia deployment panel. It only opens MetaMask after the local
 * constructor checks pass and the operator explicitly checks the review box.
 * There is no automatic send, and no private key or recovery phrase is read.
 */
export function DeployVaultPanel({
  account,
  onAccountChange,
  configuredContract,
}: {
  account: ViemAddress | null;
  onAccountChange: (account: ViemAddress | null) => void;
  configuredContract: string | null;
}) {
  const [form, setForm] = useState<VaultDeploymentForm>(DEFAULT_FORM);
  const [artifact, setArtifact] = useState<DeployArtifact | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [quote, setQuote] = useState<DeploymentQuote | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deploymentHash, setDeploymentHash] = useState<Hash | null>(null);
  const [deploymentConfig, setDeploymentConfig] = useState<VaultDeploymentConfig | null>(null);
  const [verification, setVerification] = useState<DeploymentVerification | null>(null);

  const validation = useMemo(() => validateVaultDeployment(form), [form]);
  const config = validation.config;
  const visibleWallet =
    account && wallet && wallet.account.toLowerCase() === account.toLowerCase() ? wallet : null;
  const visibleWalletError = account ? walletError : null;
  const wrongNetwork = visibleWallet !== null && visibleWallet.chainId !== 84532;
  const insufficientBalance =
    quote !== null ? quote.maxCostWei > quote.balanceWei : false;
  const quoteMatchesAccount = Boolean(
    account && quote && quote.account.toLowerCase() === account.toLowerCase(),
  );
  const deploymentComplete = verification !== null && verification.mismatches.length === 0;
  const anythingBusy = busy !== null;

  useEffect(() => {
    let cancelled = false;
    void loadNonceVaultArtifact()
      .then((next) => {
        if (!cancelled) {
          setArtifact(next);
          setArtifactError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setArtifact(null);
          setArtifactError(reason instanceof Error ? reason.message : "Artifact load failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void readDeploymentWallet(account)
      .then((next) => {
        if (!cancelled) {
          setWallet({ account, ...next });
          setWalletError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setWallet(null);
          setWalletError(humanizeWalletError(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const refreshWallet = useCallback(async () => {
    if (!account) return;
    setBusy("wallet");
    setWalletError(null);
    try {
      const next = await readDeploymentWallet(account);
      setWallet({ account, ...next });
    } catch (reason) {
      setWallet(null);
      setWalletError(humanizeWalletError(reason));
    } finally {
      setBusy(null);
    }
  }, [account]);

  const clearReview = () => {
    setQuote(null);
    setReviewed(false);
    setConfirmed(false);
    setError(null);
    setNotice(null);
  };

  const updateField = (
    key: Exclude<keyof VaultDeploymentForm, "guardians">,
    value: string,
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    clearReview();
  };

  const updateGuardian = (index: number, value: string) => {
    setForm((previous) => {
      const guardians = [...previous.guardians] as [string, string, string];
      guardians[index] = value;
      return { ...previous, guardians };
    });
    clearReview();
  };

  const connect = async () => {
    setBusy("connect");
    setError(null);
    setNotice(null);
    try {
      const next = await connectTestnetWallet();
      onAccountChange(next);
    } catch (reason) {
      setError(humanizeWalletError(reason));
    } finally {
      setBusy(null);
    }
  };

  const review = async () => {
    if (!account) {
      setError("Connect a wallet before reviewing the deployment.");
      return;
    }
    if (!artifact) {
      setError(artifactError ?? "The compiled contract artifact is not loaded.");
      return;
    }
    if (!config) {
      setError("Fix the constructor validation errors before reviewing.");
      setReviewed(false);
      setQuote(null);
      return;
    }

    setBusy("quote");
    setError(null);
    setNotice(null);
    try {
      const next = await estimateVaultDeployment(form, account);
      setQuote(next);
      setReviewed(true);
      setConfirmed(false);
    } catch (reason) {
      setQuote(null);
      setReviewed(false);
      setConfirmed(false);
      setError(humanizeWalletError(reason));
    } finally {
      setBusy(null);
    }
  };

  const deploy = async () => {
    if (!account || !quote || !reviewed || !confirmed || !config) return;
    if (quote.account.toLowerCase() !== account.toLowerCase()) {
      setError("The wallet account changed since the estimate. Review the deployment again.");
      return;
    }
    if (visibleWallet && visibleWallet.chainId !== 84532) {
      setError("Switch your wallet to Base Sepolia (chain ID 84532) before deploying.");
      return;
    }
    if (quote.maxCostWei > quote.balanceWei) {
      setError("The estimated maximum cost exceeds the connected wallet's balance.");
      return;
    }

    setBusy("deploy");
    setError(null);
    setNotice("MetaMask has the deployment request. Nothing is final until you approve it there.");
    setVerification(null);
    setDeploymentHash(null);
    setDeploymentConfig(null);

    try {
      const result = await deployVault(form, account);
      setDeploymentHash(result.hash);
      setDeploymentConfig(result.config);
      setNotice(
        "MetaMask submitted the deployment. Waiting for a Base Sepolia receipt before calling the contract verified.",
      );
      const checked = await verifyVaultDeployment(result.hash, result.config);
      setVerification(checked);
      setNotice(
        checked.mismatches.length === 0
          ? "Receipt, bytecode and deployed configuration verified from Base Sepolia."
          : "The contract exists, but the deployed configuration does not match the reviewed values.",
      );
    } catch (reason) {
      setError(humanizeWalletError(reason));
      setNotice(null);
    } finally {
      setBusy(null);
    }
  };

  const verifyAgain = async () => {
    if (!deploymentHash || !deploymentConfig) return;
    setBusy("verify");
    setError(null);
    try {
      const checked = await verifyVaultDeployment(deploymentHash, deploymentConfig);
      setVerification(checked);
      setNotice(
        checked.mismatches.length === 0
          ? "Receipt, bytecode and deployed configuration verified from Base Sepolia."
          : "The contract exists, but the deployed configuration does not match the reviewed values.",
      );
    } catch (reason) {
      setError(humanizeWalletError(reason));
    } finally {
      setBusy(null);
    }
  };

  const reviewConfig = quote?.config ?? config;

  return (
    <section className="overflow-hidden rounded-2xl border border-mint/25 bg-[#0b1c16]/90">
      <div className="border-b border-hairline/60 bg-mint/[0.035] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SectionLabel>Deploy a live NONCEVault</SectionLabel>
              <StatusPill label="Live · Base Sepolia" tone="warn" />
              <StatusPill label="Not simulation" tone="neutral" />
            </div>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-sage">
              This creates a real contract on Base Sepolia (chain ID 84532). It is not a sandbox and
              it is not mainnet. The contract is unaudited. The owner is fixed to the address below;
              you choose a monitor, three distinct guardians and the initial policy.
            </p>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-mint/20 bg-mint/[0.06] text-mint">
            <Rocket className="size-5" />
          </div>
        </div>
      </div>

      {configuredContract && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-[#E9B45E]/25 bg-[#E9B45E]/[0.05] px-3.5 py-2.5 text-[10px] leading-5 text-[#E9B45E]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            The console is already configured to {short(configuredContract)}. Deploying here creates
            a separate vault; it does not replace the configured contract automatically.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3.5 py-2.5 text-[10px] leading-5 text-[#F17676]"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mx-5 mt-4 rounded-lg border border-mint/20 bg-mint/[0.04] px-3.5 py-2.5 text-[10px] leading-5 text-mint/90">
          {notice}
        </p>
      )}

      <div className="grid gap-5 p-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Wallet & network</SectionLabel>
              <div className="flex items-center gap-2">
                {visibleWallet && (
                  <StatusPill
                    label={
                      wrongNetwork
                        ? `Chain ${visibleWallet.chainId}`
                        : "Base Sepolia · 84532"
                    }
                    tone={wrongNetwork ? "danger" : "safe"}
                  />
                )}
                <Button
                  onClick={() => void refreshWallet()}
                  disabled={!account || anythingBusy}
                  variant="outline"
                  className="h-7 rounded-md border-hairline bg-black/20 px-2 text-[9px]"
                >
                  <RefreshCw className={cn("size-3", busy === "wallet" && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>

            {account ? (
              <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] px-3 py-2.5">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Deployer wallet</p>
                  <Address value={account} lead={10} tail={6} className="mt-1" />
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Balance</p>
                  <p className="mt-1 font-mono text-[11px] text-ivory">
                    {visibleWallet ? formatEth(visibleWallet.balanceWei) : "Reading…"}
                  </p>
                </div>
              </div>
              {account.toLowerCase() !== NONCE_VAULT_OWNER.toLowerCase() && (
                <p className="mt-2 rounded-lg border border-[#E9B45E]/25 bg-[#E9B45E]/[0.05] px-3 py-2.5 text-[9px] leading-4 text-[#E9B45E]">
                  This connected account signs the deployment, but the initial owner remains the
                  fixed address shown in Constructor roles. Make sure that owner is a wallet you
                  control.
                </p>
              )}
              </>
            ) : (
              <div className="mt-3 rounded-lg border border-hairline/60 bg-black/20 px-3 py-3">
                <p className="text-[10px] leading-5 text-sage">
                  Connect the MetaMask wallet that will sign the deployment. This panel never asks
                  for a private key, seed phrase or recovery phrase.
                </p>
                <Button
                  onClick={() => void connect()}
                  disabled={anythingBusy}
                  className="mt-3 h-8 rounded-md bg-mint px-3 text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright"
                >
                  {busy === "connect" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Wallet className="size-3" />
                  )}
                  Connect MetaMask
                </Button>
              </div>
            )}

            {visibleWalletError && (
              <p className="mt-2 text-[10px] leading-5 text-[#F17676]">{visibleWalletError}</p>
            )}
            {wrongNetwork && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.05] px-3 py-2.5">
                <p className="text-[10px] leading-5 text-[#F17676]">
                  This wallet is not on Base Sepolia. Deployment is disabled until chain 84532 is
                  active.
                </p>
                <Button
                  onClick={() => void connect()}
                  disabled={anythingBusy}
                  variant="outline"
                  className="h-7 rounded-md border-[#F17676]/30 bg-transparent px-2 text-[9px] text-[#F17676] hover:bg-[#F17676]/10"
                >
                  Switch network
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
            <SectionLabel>Constructor roles</SectionLabel>
            <div className="mt-3 space-y-3">
              <Field
                label="Initial owner"
                hint="Fixed by this deployment flow. The contract has no owner-transfer constructor."
              >
                <Input
                  readOnly
                  value={NONCE_VAULT_OWNER}
                  className="h-8 border-hairline bg-black/30 font-mono text-[10px] text-sage"
                />
              </Field>

              <Field
                label="Monitor"
                hint="May freeze only. It cannot move funds, unfreeze or change policy."
              >
                <Input
                  value={form.monitor}
                  onChange={(event) => updateField("monitor", event.target.value)}
                  placeholder="0x monitor address"
                  spellCheck={false}
                  autoComplete="off"
                  className="h-8 border-hairline bg-black/25 font-mono text-[10px]"
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-3">
                {form.guardians.map((guardian, index) => (
                  <Field key={index} label={`Guardian ${index + 1}`}>
                    <Input
                      value={guardian}
                      onChange={(event) => updateGuardian(index, event.target.value)}
                      placeholder="0x guardian"
                      spellCheck={false}
                      autoComplete="off"
                      className="h-8 border-hairline bg-black/25 font-mono text-[10px]"
                    />
                  </Field>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Initial policy</SectionLabel>
              <StatusPill label="allowlistOnly = false" tone="neutral" />
            </div>
            <p className="mt-2 text-[10px] leading-5 text-sage">
              Prepopulated with the documented conservative testnet values. Review and change them
              before deployment. The contract rejects values outside these bounds.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Field label="Per transaction (ETH)">
                <Input
                  value={form.perTransactionLimitEth}
                  onChange={(event) =>
                    updateField("perTransactionLimitEth", event.target.value)
                  }
                  inputMode="decimal"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
              <Field label="Large threshold (ETH)">
                <Input
                  value={form.largeWithdrawalThresholdEth}
                  onChange={(event) =>
                    updateField("largeWithdrawalThresholdEth", event.target.value)
                  }
                  inputMode="decimal"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
              <Field label="Rolling 24h limit (ETH)">
                <Input
                  value={form.rollingLimitEth}
                  onChange={(event) => updateField("rollingLimitEth", event.target.value)}
                  inputMode="decimal"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
              <Field label="Withdrawal delay (min)">
                <Input
                  value={form.withdrawalDelayMinutes}
                  onChange={(event) =>
                    updateField("withdrawalDelayMinutes", event.target.value)
                  }
                  inputMode="numeric"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
              <Field label="Recovery delay (days)">
                <Input
                  value={form.recoveryDelayDays}
                  onChange={(event) => updateField("recoveryDelayDays", event.target.value)}
                  inputMode="numeric"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
              <Field label="Policy delay (days)">
                <Input
                  value={form.policyDelayDays}
                  onChange={(event) => updateField("policyDelayDays", event.target.value)}
                  inputMode="numeric"
                  className="h-8 border-hairline bg-black/25 text-[10px]"
                />
              </Field>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-sage">
              Contract bounds: withdrawal 10 min–30 days, recovery 2–90 days, policy 1–30 days.
              Large threshold must not exceed per-transaction, and rolling limit must be at least
              per-transaction.
            </p>
          </div>

          {validation.errors.length > 0 ? (
            <div className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.05] px-3.5 py-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#F17676]">
                Constructor validation
              </p>
              <ul className="mt-2 space-y-1.5">
                {validation.errors.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2 text-[10px] leading-5 text-[#F17676]/90">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-[#F17676]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] px-3.5 py-2.5 text-[10px] leading-5 text-mint/90">
              <Check className="size-3.5 shrink-0" />
              Local validation passes. The contract remains the final authority; a failed estimate
              or transaction can still revert.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Deployment review</SectionLabel>
              <StatusPill
                label={reviewed ? "Reviewed" : "Not reviewed"}
                tone={reviewed ? "safe" : "neutral"}
              />
            </div>

            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-hairline/60 bg-black/25 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Bytecode hash</p>
                {artifact ? (
                  <p className="mt-1 break-all font-mono text-[9px] leading-4 text-ivory/80">
                    {artifact.bytecodeHash}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] leading-5 text-[#E9B45E]">
                    {artifactError ?? "Loading compiled artifact…"}
                  </p>
                )}
                <p className="mt-1 text-[9px] leading-4 text-sage">
                  keccak256 of the compiled initcode at{" "}
                  <code className="font-mono">contracts/out/NONCEVault.sol/NONCEVault.json</code>.
                </p>
              </div>

              {quote ? (
                <div className="rounded-lg border border-mint/20 bg-mint/[0.04] px-3 py-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Gas estimate</p>
                      <p className="mt-0.5 font-mono text-ivory">
                        {quote.gas.toLocaleString("en-US")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">Max fee / gas</p>
                      <p className="mt-0.5 font-mono text-ivory">
                        {formatGwei(quote.maxFeePerGas)} gwei
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                        Max L2 cost
                      </p>
                      <p className="mt-0.5 font-mono text-ivory">{formatEth(quote.maxCostWei)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                        Wallet balance
                      </p>
                      <p className="mt-0.5 font-mono text-ivory">{formatEth(quote.balanceWei)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                        Balance after maximum L2 cost
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 font-mono",
                          insufficientBalance ? "text-[#F17676]" : "text-mint",
                        )}
                      >
                        {formatEth(quote.balanceWei - quote.maxCostWei)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-sage">
                    This is the L2 gas ceiling at the provider's maximum fee. MetaMask may show a
                    different final fee, and Base may add an L1 data fee not included here.
                  </p>
                  {insufficientBalance && (
                    <p className="mt-2 text-[10px] leading-5 text-[#F17676]">
                      The connected wallet cannot cover the maximum estimate. Add Base Sepolia ETH
                      or reduce the deployment scope before continuing.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5 text-[10px] leading-5 text-sage">
                  Fill the roles, review the policy and select <strong>Review & estimate</strong> to
                  display the gas estimate and maximum cost before any wallet request.
                </p>
              )}
              {quote && account && !quoteMatchesAccount && (
                <p className="rounded-lg border border-[#E9B45E]/25 bg-[#E9B45E]/[0.05] px-3 py-2.5 text-[10px] leading-5 text-[#E9B45E]">
                  The connected wallet account changed after this estimate. Review the deployment
                  again before opening MetaMask.
                </p>
              )}
            </div>

            {reviewConfig && (
              <div className="mt-3">
                <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-sage">
                  Encoded constructor arguments
                </p>
                <ArgsList config={reviewConfig} />
              </div>
            )}

            <Button
              onClick={() => void review()}
              disabled={
                !account ||
                !artifact ||
                validation.errors.length > 0 ||
                anythingBusy ||
                wrongNetwork
              }
              className="mt-3 h-9 w-full rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright"
            >
              {busy === "quote" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Review & estimate
            </Button>
            {!account && (
              <p className="mt-2 text-[9px] leading-4 text-sage">
                Connect a wallet to calculate the estimate.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
            <SectionLabel>Explicit confirmation</SectionLabel>
            <p className="mt-2 text-[10px] leading-5 text-sage">
              Reviewing only calculates an estimate. The next action opens MetaMask with a contract
              creation request; nothing is broadcast until you approve that request in your wallet.
            </p>

            <label className="mt-3 flex items-start gap-2 rounded-lg border border-hairline/60 bg-black/25 px-3 py-2.5 text-[10px] leading-5 text-sage">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={
                  !reviewed ||
                  !quote ||
                  !quoteMatchesAccount ||
                  anythingBusy ||
                  deploymentHash !== null
                }
                className="mt-1 size-3.5 shrink-0 accent-[#57D5A5]"
              />
              <span>
                I have reviewed the connected network, owner, monitor, guardians, policy, bytecode
                hash, gas estimate and maximum cost. I authorize opening MetaMask for a Base Sepolia
                deployment.
              </span>
            </label>

            <Button
              onClick={() => void deploy()}
              disabled={
                !account ||
                !quote ||
                !quoteMatchesAccount ||
                !reviewed ||
                !confirmed ||
                anythingBusy ||
                wrongNetwork ||
                insufficientBalance ||
                deploymentHash !== null
              }
              className="mt-3 h-10 w-full rounded-lg bg-[#57D5A5] px-4 text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
            >
              {busy === "deploy" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wallet className="size-3.5" />
              )}
              {busy === "deploy" ? "Waiting for receipt…" : "Open MetaMask to deploy"}
            </Button>
            <p className="mt-2 text-[9px] leading-4 text-sage">
              No private key, seed phrase or recovery phrase is requested, transmitted or stored by
              this page or NONCE.
            </p>
          </div>

          {deploymentHash && (
            <div className="rounded-xl border border-hairline/60 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>Deployment result</SectionLabel>
                <StatusPill
                  label={
                    verification
                      ? verification.mismatches.length === 0
                        ? "Receipt + config verified"
                        : "Config mismatch"
                      : "Waiting for receipt"
                  }
                  tone={
                    verification
                      ? verification.mismatches.length === 0
                        ? "safe"
                        : "danger"
                      : "warn"
                  }
                />
              </div>

              <div className="mt-3 space-y-2 text-[10px] leading-5 text-sage">
                <p>
                  Transaction:{" "}
                  <a
                    href={explorerTx(BASE_SEPOLIA_EXPLORER, deploymentHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-mint hover:text-mint-bright"
                  >
                    {short(deploymentHash, 12, 8)}
                    <ExternalLink className="size-3" />
                  </a>
                </p>

                {verification ? (
                  <>
                    <div className="rounded-lg border border-mint/20 bg-mint/[0.04] px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                        Contract address
                      </p>
                      <a
                        href={explorerAddress(BASE_SEPOLIA_EXPLORER, verification.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 break-all font-mono text-[10px] text-mint hover:text-mint-bright"
                      >
                        {verification.address}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[9px]">
                      <p>
                        Block{" "}
                        <span className="font-mono text-ivory">{verification.blockNumber}</span>
                      </p>
                      <p>
                        Gas used{" "}
                        <span className="font-mono text-ivory">
                          {verification.gasUsed.toLocaleString("en-US")}
                        </span>
                      </p>
                      <p>
                        Runtime code{" "}
                        <span className="font-mono text-ivory">
                          {verification.codeBytes.toLocaleString("en-US")} bytes
                        </span>
                      </p>
                      <p>
                        L2 fee{" "}
                        <span className="font-mono text-ivory">
                          {formatEth(verification.actualL2FeeWei)}
                        </span>
                      </p>
                    </div>

                    <p className="break-all font-mono text-[8px] leading-4 text-sage">
                      runtime code hash: {verification.codeHash}
                    </p>

                    {verification.mismatches.length > 0 && (
                      <div className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.05] px-3 py-2.5 text-[#F17676]">
                        <p className="text-[9px] font-medium uppercase tracking-[0.14em]">
                          Configuration mismatch
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {verification.mismatches.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <VerifiedConfig verification={verification} />

                    <div className="rounded-lg border border-hairline/60 bg-black/25 px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">
                        Console configuration
                      </p>
                      <p className="mt-1 break-all font-mono text-[9px] leading-4 text-ivory/80">
                        NONCE_VAULT_ADDRESS={verification.address}
                        <br />
                        NONCE_DEPLOYMENT_TX_HASH={verification.hash}
                      </p>
                      <p className="mt-2 text-[9px] leading-4 text-sage">
                        The existing live console still reads its configured Convex values. These
                        values must be set on the deployment before this page will switch to the new
                        vault.
                      </p>
                    </div>

                    {deploymentComplete && (
                      <p className="flex items-center gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] px-3 py-2.5 text-mint/90">
                        <Check className="size-3.5 shrink-0" />
                        Receipt, non-empty runtime bytecode and the constructor configuration were
                        read directly from Base Sepolia.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <p>
                      The transaction is pending. This panel has not marked the contract verified
                      until it reads a successful receipt and on-chain configuration.
                    </p>
                    <Button
                      onClick={() => void verifyAgain()}
                      disabled={!deploymentConfig || anythingBusy}
                      variant="outline"
                      className="h-7 rounded-md border-hairline bg-transparent px-2 text-[9px]"
                    >
                      {busy === "verify" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                      Check receipt again
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
