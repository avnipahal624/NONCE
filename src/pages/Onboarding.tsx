import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  Radar,
  ShieldCheck,
  TriangleAlert,
  Users,
  Vault as VaultIcon,
  Wallet,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/nonce/Logo";
import { Address } from "@/components/nonce/Address";
import { StatusPill } from "@/components/nonce/StatusPill";
import { VaultDial } from "@/components/nonce/VaultDial";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { NETWORK } from "@/lib/nonce";
import {
  connectInjectedWallet,
  generateSandboxAddress,
  getInjectedWallet,
  humanizeWalletError,
  isValidAddress,
  signChallenge,
  switchToBaseSepolia,
} from "@/lib/wallet";

const STEPS = [
  { title: "Connect wallet", caption: "Start with the wallet you control." },
  { title: "Verify ownership", caption: "Prove control without sharing a key." },
  { title: "Understand the vault", caption: "Same key, different rules." },
  { title: "Create your vault", caption: "A sandbox vault record." },
  { title: "Withdrawal protection", caption: "Delay and limit what can leave." },
  { title: "Guardians", caption: "Three people, two approvals." },
  { title: "Decoy monitoring", caption: "Alarms an attacker will touch." },
  { title: "Verify safeguards", caption: "Check every layer honestly." },
  { title: "Protection status", caption: "Know exactly where you stand." },
];

type GuardianDraft = { label: string; address: string };

export default function Onboarding() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ nonce: string; message: string } | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);

  const [policy, setPolicy] = useState({
    maxPerTransaction: "1",
    largeWithdrawalThreshold: "0.25",
    delayMinutes: 30,
    allowlistOnly: false,
    allowlist: "",
  });

  const [guardians, setGuardians] = useState<GuardianDraft[]>(() => [
    { label: "Hardware wallet", address: generateSandboxAddress() },
    { label: "Family vault", address: generateSandboxAddress() },
    { label: "Trusted advisor", address: generateSandboxAddress() },
  ]);
  const [decoyLabels, setDecoyLabels] = useState(["Reserve wallet", "DeFi decoy", "Cold storage decoy"]);

  const initialized = useRef(false);

  const registerDemoSigner = useMutation(api.nonce.wallets.registerDemoSigner);
  const createChallenge = useMutation(api.nonce.wallets.createChallenge);
  const verifySignature = useAction(api.nonce.walletVerify.verifySignature);
  const createVault = useMutation(api.nonce.vaults.createDemoVault);
  const updatePolicy = useMutation(api.nonce.withdrawals.updatePolicy);
  const addGuardian = useMutation(api.nonce.guardians.add);
  const confirmGuardian = useMutation(api.nonce.guardians.confirm);
  const createDecoy = useMutation(api.nonce.decoys.create);
  const syncVault = useMutation(api.nonce.vaults.sync);

  const wallet = workspace?.wallet ?? null;
  const vault = workspace?.vault ?? null;
  const confirmedGuardians = workspace?.guardians.filter((g) => g.status === "CONFIRMED") ?? [];
  const activeDecoys = workspace?.decoys.filter((d) => d.status === "ACTIVE") ?? [];
  const protection = workspace?.protection;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth?returnTo=%2Fonboarding");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    if (!workspace.wallet) setStep(0);
    else if (workspace.wallet.verification === "DEMO_SIGNER") setStep(1);
    else if (!workspace.vault) setStep(2);
    else setStep(7);
  }, [workspace]);

  useEffect(() => {
    if (!workspace?.policy) return;
    setPolicy({
      maxPerTransaction: workspace.policy.maxPerTransaction,
      largeWithdrawalThreshold: workspace.policy.largeWithdrawalThreshold,
      delayMinutes: workspace.policy.delayMinutes,
      allowlistOnly: workspace.policy.allowlistOnly,
      allowlist: workspace.policy.allowlist.join(", "),
    });
  }, [workspace?.policy]);

  const activeGuardianAddresses = useMemo(
    () => new Set((workspace?.guardians ?? []).filter((g) => g.status !== "REMOVED").map((g) => g.address)),
    [workspace?.guardians],
  );

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action did not complete.");
    } finally {
      setBusy(null);
    }
  };

  const handleUseBrowserWallet = () =>
    run("connect", async () => {
      const { address, chainId } = await connectInjectedWallet();
      if (chainId !== NETWORK.chainId) {
        await switchToBaseSepolia();
      }
      const created = await createChallenge({
        address,
        chainId: NETWORK.chainId,
        domain: window.location.host,
        uri: window.location.origin,
      });
      setChallenge({ nonce: created.nonce, message: created.message });
      setPendingAddress(address);
      setStep(1);
      setNotice("Wallet connected. Sign the message to verify ownership.");
    });

  const handleSign = () =>
    run("sign", async () => {
      const signer = pendingAddress ?? wallet?.address;
      if (!challenge || !signer) throw new Error("Reconnect the wallet to continue.");
      const signature = await signChallenge(signer, challenge.message);
      await verifySignature({ nonce: challenge.nonce, signature });
      setChallenge(null);
      setPendingAddress(null);
      setNotice("Wallet ownership verified by signature.");
      setStep(2);
    });

  const handleDemoSigner = () =>
    run("demo", async () => {
      await registerDemoSigner({ address: generateSandboxAddress(), label: "Sandbox signer" });
      setStep(1);
      setNotice("Sandbox signer attached. Ownership is not verified.");
    });

  const handleCreateVault = () =>
    run("vault", async () => {
      await createVault({ name: "My NONCE Vault" });
      setStep(4);
      setNotice("Sandbox vault created. No contract was deployed.");
    });

  const handleSavePolicy = () =>
    run("policy", async () => {
      if (!vault) throw new Error("Create a vault first.");
      const max = Number(policy.maxPerTransaction);
      const threshold = Number(policy.largeWithdrawalThreshold);
      if (!Number.isFinite(max) || max <= 0) throw new Error("Enter a positive per-transaction limit.");
      if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("Enter a positive large-withdrawal threshold.");
      if (threshold > max) throw new Error("The large-withdrawal threshold cannot exceed the per-transaction limit.");
      if (policy.delayMinutes < 1) throw new Error("A delay of at least one minute is required.");
      if (policy.allowlistOnly) {
        const entries = policy.allowlist.split(",").map((value) => value.trim()).filter(Boolean);
        if (entries.length === 0) throw new Error("Add at least one allowlisted address, or turn allowlist-only off.");
        if (entries.some((entry) => !isValidAddress(entry))) throw new Error("Every allowlist entry must be a valid address.");
      }
      await updatePolicy({
        vaultId: vault._id,
        maxPerTransaction: policy.maxPerTransaction,
        delayMinutes: policy.delayMinutes,
        largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
        guardianApprovalRequired: true,
        guardianThreshold: 2,
        allowlistOnly: policy.allowlistOnly,
        allowlist: policy.allowlist.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setStep(5);
      setNotice("Withdrawal policy saved.");
    });

  const handleAddGuardians = () =>
    run("guardians", async () => {
      if (!vault) throw new Error("Create a vault first.");
      const drafts = guardians.filter((entry) => entry.label.trim() && entry.address.trim());
      if (drafts.length !== 3) throw new Error("All three guardians need a label and an address.");
      for (const draft of drafts) {
        if (!isValidAddress(draft.address)) throw new Error(`"${draft.label}" does not have a valid address.`);
        if (draft.address.toLowerCase() === vault.ownerSigner.toLowerCase()) {
          throw new Error("A guardian cannot use the vault signer address.");
        }
        if (new Set(drafts.map((d) => d.address.toLowerCase())).size !== 3) {
          throw new Error("Each guardian must have a different address.");
        }
      }
      const slots = Math.max(0, 3 - activeGuardianAddresses.size);
      const missing = drafts
        .filter((draft) => !activeGuardianAddresses.has(draft.address.toLowerCase()))
        .slice(0, slots);
      if (activeGuardianAddresses.size + missing.length < 3) {
        throw new Error("Three guardians must be added and confirmed before continuing.");
      }
      for (const draft of missing) {
        const guardianId = await addGuardian({
          vaultId: vault._id,
          label: draft.label,
          address: draft.address,
        });
        await confirmGuardian({ vaultId: vault._id, guardianId });
      }
      setStep(6);
      setNotice("Three guardians recorded. Confirmations are simulated in sandbox mode.");
    });

  const handleAddDecoys = () =>
    run("decoys", async () => {
      if (!vault) throw new Error("Create a vault first.");
      const existing = new Set(workspace?.decoys.map((decoy) => decoy.label) ?? []);
      const needed = Math.max(0, 3 - activeDecoys.length);
      const labels = decoyLabels.filter((label) => !existing.has(label)).slice(0, needed);
      for (const label of labels) {
        await createDecoy({ vaultId: vault._id, label });
      }
      if (activeDecoys.length + labels.length < 3) {
        throw new Error("Three decoys must be active before continuing.");
      }
      setStep(7);
      setNotice("Decoy addresses are monitoring. They hold no funds and have no vault role.");
    });

  const handleVerify = () =>
    run("verify", async () => {
      if (!vault) throw new Error("Create a vault first.");
      await syncVault({ vaultId: vault._id });
      setNotice("Safeguards re-checked. The checklist below reflects current state.");
    });

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-abyss">
        <Loader2 className="size-6 animate-spin text-mint" />
      </div>
    );
  }

  const canContinue =
    step === 0
      ? Boolean(wallet)
      : step === 3
        ? Boolean(vault)
        : step === 5
          ? confirmedGuardians.length >= 3
          : step === 6
            ? activeDecoys.length >= 3
            : true;

  return (
    <div className="min-h-screen bg-abyss">
      <header className="mx-auto flex h-[76px] w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          {vault && (
            <StatusPill label="Sandbox vault" tone="warn" className="hidden sm:inline-flex" />
          )}
          <Link to={vault ? "/dashboard" : "/"} className="text-[11px] text-sage hover:text-ivory">
            {vault ? "Skip to dashboard" : "Exit setup"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex flex-col gap-2 border-b border-hairline/50 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">Vault onboarding</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ivory sm:text-3xl">
              Build protection in the right order.
            </h1>
          </div>
          <p className="text-[11px] text-sage">
            Step {step + 1} of {STEPS.length} · {STEPS[step].caption}
          </p>
        </div>

        <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-mint transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
          <ol className="hidden space-y-0.5 lg:block" aria-label="Onboarding steps">
            {STEPS.map((entry, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <li key={entry.title}>
                  <button
                    type="button"
                    disabled={index > step}
                    onClick={() => index <= step && setStep(index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      current ? "bg-mint/[0.07]" : "hover:bg-white/[0.02]",
                      index > step && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px]",
                        done
                          ? "border-mint/40 bg-mint/15 text-mint"
                          : current
                            ? "border-mint/50 bg-mint/10 text-mint"
                            : "border-hairline text-sage",
                      )}
                    >
                      {done ? <Check className="size-2.5" /> : index + 1}
                    </span>
                    <span>
                      <span className={cn("block text-[12px]", current ? "text-ivory" : "text-sage")}>
                        {entry.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-sage/70">{entry.caption}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="min-w-0">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5 sm:p-7">
              {step === 0 && (
                <StepShell
                  icon={Wallet}
                  eyebrow="Step one"
                  title="Connect the wallet you want to protect"
                  description="NONCE reads your address and asks for a signature. It never receives your private key or seed phrase, and it cannot move funds with a signature alone."
                >
                  {wallet ? (
                    <AttachedWallet wallet={wallet} />
                  ) : (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleUseBrowserWallet}
                        disabled={Boolean(busy)}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-mint/25 bg-mint/[0.06] px-4 py-4 text-left transition-colors hover:border-mint/45 disabled:opacity-60"
                      >
                        <span className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-lg bg-mint/15 text-mint">
                            <Wallet className="size-4" />
                          </span>
                          <span>
                            <span className="block text-[13px] font-medium text-ivory">
                              Connect browser wallet
                            </span>
                            <span className="mt-0.5 block text-[11px] text-sage">
                              {getInjectedWallet()
                                ? `Detected wallet · ${NETWORK.label}`
                                : "No extension detected in this browser"}
                            </span>
                          </span>
                        </span>
                        {busy === "connect" ? (
                          <Loader2 className="size-4 animate-spin text-mint" />
                        ) : (
                          <ArrowRight className="size-4 text-mint" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDemoSigner}
                        disabled={Boolean(busy)}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-hairline bg-black/20 px-4 py-4 text-left transition-colors hover:border-mint/25 disabled:opacity-60"
                      >
                        <span className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-lg bg-[#E9B45E]/10 text-[#E9B45E]">
                            <KeyRound className="size-4" />
                          </span>
                          <span>
                            <span className="block text-[13px] font-medium text-ivory">
                              Use a sandbox signer
                            </span>
                            <span className="mt-0.5 block text-[11px] text-sage">
                              Generates an address with no key. Clearly marked unverified.
                            </span>
                          </span>
                        </span>
                        {busy === "demo" ? (
                          <Loader2 className="size-4 animate-spin text-[#E9B45E]" />
                        ) : (
                          <ArrowRight className="size-4 text-sage" />
                        )}
                      </button>
                    </div>
                  )}
                </StepShell>
              )}

              {step === 1 && (
                <StepShell
                  icon={Fingerprint}
                  eyebrow="Step two"
                  title={wallet?.verification === "SIGNATURE" ? "Ownership verified" : "Prove this wallet is yours"}
                  description="A connected address is not proof. NONCE issues a one-time message bound to this domain, chain and nonce. A valid signature proves control; it does not authorise a transaction."
                >
                  {wallet?.verification === "SIGNATURE" ? (
                    <div className="rounded-xl border border-mint/25 bg-mint/[0.05] p-4">
                      <div className="flex items-center gap-2 text-mint">
                        <BadgeCheck className="size-4" />
                        <p className="text-[12px] font-medium">Verified by wallet signature</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Address value={wallet.address} />
                        <StatusPill label={`Chain ${wallet.chainId}`} tone="neutral" />
                      </div>
                      <p className="mt-3 text-[11px] leading-5 text-sage">
                        Only this signed identity can satisfy the ownership check. The challenge has
                        been consumed and cannot be replayed.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-[#E9B45E]/25 bg-[#E9B45E]/[0.05] p-4">
                        <div className="flex items-center gap-2 text-[#E9B45E]">
                          <TriangleAlert className="size-4" />
                          <p className="text-[12px] font-medium">Unverified demo signer</p>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-[#E9B45E]/90">
                          This address has no key and cannot sign. Protection stays below
                          “Protected” until ownership is proven — that limitation is real, not a
                          display bug.
                        </p>
                        <div className="mt-3">
                          <Address value={wallet?.address} />
                        </div>
                      </div>

                      {getInjectedWallet() && (
                        <div className="rounded-xl border border-hairline/70 bg-black/20 p-4">
                          <p className="text-[12px] font-medium text-ivory">Verify a real wallet instead</p>
                          <p className="mt-1 text-[11px] leading-5 text-sage">
                            Connecting replaces the sandbox signer as the primary identity once the
                            signature checks out.
                          </p>
                          {challenge ? (
                            <div className="space-y-2">
                              {pendingAddress && (
                                <p className="font-mono text-[10px] text-sage">
                                  Signing as {pendingAddress.slice(0, 8)}…{pendingAddress.slice(-4)}
                                </p>
                              )}
                              <Button
                                onClick={handleSign}
                                disabled={Boolean(busy)}
                                className="h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright"
                              >
                                {busy === "sign" ? <Loader2 className="size-3.5 animate-spin" /> : "Sign the message"}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={handleUseBrowserWallet}
                              disabled={Boolean(busy)}
                              variant="outline"
                              className="mt-3 h-9 rounded-lg border-mint/25 bg-transparent text-xs text-mint hover:bg-mint/10"
                            >
                              {busy === "connect" ? <Loader2 className="size-3.5 animate-spin" /> : "Connect a wallet"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </StepShell>
              )}

              {step === 2 && (
                <StepShell
                  icon={Lock}
                  eyebrow="Step three"
                  title="Same key. Different rules."
                  description="A normal wallet executes anything its key signs. A NONCE vault adds rules around what a valid signature is allowed to do — before funds leave."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-hairline/70 bg-black/20 p-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-sage">Ordinary wallet</p>
                      <ul className="mt-3 space-y-2 text-[11px] leading-5 text-sage">
                        <li>Signature releases funds immediately</li>
                        <li>No delay, no limit, no second opinion</li>
                        <li>One compromised key is enough</li>
                      </ul>
                    </div>
                    <div className="rounded-xl border border-mint/25 bg-mint/[0.04] p-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-mint">NONCE vault</p>
                      <ul className="mt-3 space-y-2 text-[11px] leading-5 text-ivory/80">
                        <li>Large withdrawals wait in a cancellable queue</li>
                        <li>Two of three guardians approve signer replacement</li>
                        <li>Decoys expose intrusion attempts early</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#79A9E8]/20 bg-[#79A9E8]/[0.05] px-3.5 py-3 text-[11px] leading-5 text-[#79A9E8]">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                    NONCE never becomes a custodian. Your wallet keeps control; the vault narrows
                    what a stolen key can do, and recovery replaces that key.
                  </div>
                </StepShell>
              )}

              {step === 3 && (
                <StepShell
                  icon={VaultIcon}
                  eyebrow="Step four"
                  title="Create a sandbox vault"
                  description="This records a vault in NONCE with simulated deployment. No contract is deployed and no chain transaction is submitted — the interface will say so everywhere."
                >
                  {vault ? (
                    <div className="rounded-xl border border-mint/25 bg-mint/[0.05] p-4">
                      <p className="text-[12px] font-medium text-ivory">{vault.name}</p>
                      <p className="mt-1 text-[11px] text-sage">
                        Sandbox vault · deployment simulated · owned by{" "}
                        <span className="font-mono">{vault.ownerSigner.slice(0, 8)}…</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-hairline/70 bg-black/20 p-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-sage">What will exist</p>
                        <ul className="mt-3 space-y-2 text-[12px] text-ivory/80">
                          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 text-mint" /> A vault record with an explicit simulated deployment status</li>
                          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 text-mint" /> ETH and USDC ledger entries starting at zero</li>
                          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 text-mint" /> A default withdrawal policy you will review next</li>
                        </ul>
                      </div>
                      <Button
                        onClick={handleCreateVault}
                        disabled={Boolean(busy)}
                        className="h-10 rounded-lg bg-mint px-5 text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
                      >
                        {busy === "vault" ? <Loader2 className="size-4 animate-spin" /> : "Create sandbox vault"}
                      </Button>
                    </div>
                  )}
                </StepShell>
              )}

              {step === 4 && (
                <StepShell
                  icon={ShieldCheck}
                  eyebrow="Step five"
                  title="Set the rules that slow an attacker down"
                  description="These values are stored in the sandbox policy and shown on every withdrawal. Delays are the real defence; a freeze can still race an attacker."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Per-transaction limit (ETH)" hint="Larger requests require guardian approval.">
                      <Input
                        value={policy.maxPerTransaction}
                        onChange={(event) => setPolicy({ ...policy, maxPerTransaction: event.target.value })}
                        inputMode="decimal"
                        className="h-10 border-hairline bg-black/25 text-sm"
                      />
                    </Field>
                    <Field label="Large-withdrawal threshold (ETH)" hint="Above this, the delay applies.">
                      <Input
                        value={policy.largeWithdrawalThreshold}
                        onChange={(event) => setPolicy({ ...policy, largeWithdrawalThreshold: event.target.value })}
                        inputMode="decimal"
                        className="h-10 border-hairline bg-black/25 text-sm"
                      />
                    </Field>
                    <Field label="Delay (minutes)" hint="Pending requests can be cancelled during this window.">
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={policy.delayMinutes}
                        onChange={(event) => setPolicy({ ...policy, delayMinutes: Number(event.target.value) })}
                        className="h-10 border-hairline bg-black/25 text-sm"
                      />
                    </Field>
                    <Field label="Guardian threshold" hint="Fixed at two of three in this build.">
                      <div className="flex h-10 items-center rounded-md border border-hairline bg-white/[0.02] px-3 text-sm text-sage">
                        2 of 3 guardians
                      </div>
                    </Field>
                  </div>

                  <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-hairline/70 bg-black/20 p-3.5">
                    <input
                      type="checkbox"
                      checked={policy.allowlistOnly}
                      onChange={(event) => setPolicy({ ...policy, allowlistOnly: event.target.checked })}
                      className="mt-0.5 size-4 accent-[#57D5A5]"
                    />
                    <span>
                      <span className="block text-[12px] text-ivory">Allowlist-only withdrawals</span>
                      <span className="mt-0.5 block text-[11px] text-sage">
                        When enabled, destinations must match the saved list.
                      </span>
                    </span>
                  </label>

                  {policy.allowlistOnly && (
                    <Field label="Allowed destinations" hint="Comma-separated EVM addresses.">
                      <Input
                        value={policy.allowlist}
                        onChange={(event) => setPolicy({ ...policy, allowlist: event.target.value })}
                        placeholder="0x…, 0x…"
                        className="h-10 border-hairline bg-black/25 font-mono text-xs"
                      />
                    </Field>
                  )}

                  <Button
                    onClick={handleSavePolicy}
                    disabled={Boolean(busy)}
                    className="mt-5 h-10 rounded-lg bg-mint px-5 text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
                  >
                    {busy === "policy" ? <Loader2 className="size-4 animate-spin" /> : "Save withdrawal policy"}
                  </Button>
                </StepShell>
              )}

              {step === 5 && (
                <StepShell
                  icon={Users}
                  eyebrow="Step six"
                  title="Name three guardians. Two must agree."
                  description="A guardian approves replacing a compromised signer. They cannot move funds on their own. In this sandbox, their confirmations are simulated and labelled that way."
                >
                  <div className="space-y-3">
                    {guardians.map((guardian, index) => (
                      <div key={index} className="rounded-xl border border-hairline/70 bg-black/20 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-sage">
                            Guardian {index + 1}
                          </span>
                          {activeGuardianAddresses.has(guardian.address.toLowerCase()) && (
                            <StatusPill label="Confirmed" tone="safe" />
                          )}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
                          <Input
                            value={guardian.label}
                            onChange={(event) =>
                              setGuardians(guardians.map((entry, i) =>
                                i === index ? { ...entry, label: event.target.value } : entry,
                              ))
                            }
                            placeholder="Label"
                            className="h-9 border-hairline bg-black/25 text-xs"
                          />
                          <div className="flex gap-2">
                            <Input
                              value={guardian.address}
                              onChange={(event) =>
                                setGuardians(guardians.map((entry, i) =>
                                  i === index ? { ...entry, address: event.target.value } : entry,
                                ))
                              }
                              className="h-9 border-hairline bg-black/25 font-mono text-[11px]"
                            />
                            <button
                              type="button"
                              title="Generate a sandbox address"
                              onClick={() =>
                                setGuardians(guardians.map((entry, i) =>
                                  i === index ? { ...entry, address: generateSandboxAddress() } : entry,
                                ))
                              }
                              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline text-sage hover:text-mint"
                            >
                              <KeyRound className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#E9B45E]/20 bg-[#E9B45E]/[0.05] px-3.5 py-3 text-[11px] leading-5 text-[#E9B45E]">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    Sandbox addresses have no keys. Confirming them records a simulated approval —
                    it does not prove anyone can actually sign.
                  </div>

                  <Button
                    onClick={handleAddGuardians}
                    disabled={Boolean(busy) || confirmedGuardians.length >= 3}
                    className="mt-4 h-10 rounded-lg bg-mint px-5 text-sm font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-50"
                  >
                    {busy === "guardians" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : confirmedGuardians.length >= 3 ? (
                      "Three guardians confirmed"
                    ) : (
                      "Save and confirm guardians"
                    )}
                  </Button>
                </StepShell>
              )}

              {step === 6 && (
                <StepShell
                  icon={Radar}
                  eyebrow="Step seven"
                  title="Deploy alarms, not more funds"
                  description="Decoy addresses have no vault role. Anything meaningful happening at one is evidence that someone is using a key they should not have. Inbound spam is treated as noise, never as a reason to freeze."
                >
                  <div className="space-y-3">
                    {decoyLabels.map((label, index) => {
                      const existing = workspace.decoys.find((decoy) => decoy.label === label);
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-3 rounded-xl border border-hairline/70 bg-black/20 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-lg border border-hairline bg-surface text-mint">
                              <Radar className="size-3.5" />
                            </span>
                            <div>
                              <p className="text-[12px] text-ivory">{label}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-sage">
                                {existing ? existing.address.slice(0, 14) + "…" : "Generated on enable"}
                              </p>
                            </div>
                          </div>
                          <StatusPill
                            label={existing?.status === "ACTIVE" ? "Monitoring" : "Not active"}
                            tone={existing?.status === "ACTIVE" ? "safe" : "neutral"}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-4 text-[11px] leading-5 text-sage">
                    Sandbox decoys receive no real chain traffic. The Protection screen can simulate
                    a signed transaction, nonce change, contract call or spam transfer so every
                    response path is visible.
                  </p>

                  <Button
                    onClick={handleAddDecoys}
                    disabled={Boolean(busy) || activeDecoys.length >= 3}
                    className="mt-4 h-10 rounded-lg bg-mint px-5 text-sm font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-50"
                  >
                    {busy === "decoys" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : activeDecoys.length >= 3 ? (
                      "Decoy monitoring active"
                    ) : (
                      "Enable decoy monitoring"
                    )}
                  </Button>
                </StepShell>
              )}

              {step === 7 && (
                <StepShell
                  icon={BadgeCheck}
                  eyebrow="Step eight"
                  title="Verify what is actually true"
                  description="Protection is computed from stored state, not from what the UI wishes were true. Anything missing stays missing until it is fixed."
                >
                  <div className="space-y-2">
                    {(protection?.checklist ?? []).map((item) => (
                      <div
                        key={item.key}
                        className="flex items-start justify-between gap-4 rounded-xl border border-hairline/70 bg-black/20 px-4 py-3"
                      >
                        <div>
                          <p className="text-[12px] text-ivory">{item.label}</p>
                          <p className="mt-1 text-[11px] leading-5 text-sage">{item.detail}</p>
                        </div>
                        <StatusPill
                          label={
                            item.status === "OK"
                              ? "OK"
                              : item.status === "WARN"
                                ? "Warning"
                                : item.status === "BLOCKED"
                                  ? "Blocked"
                                  : "Missing"
                          }
                          tone={
                            item.status === "OK"
                              ? "safe"
                              : item.status === "WARN"
                                ? "warn"
                                : item.status === "BLOCKED"
                                  ? "danger"
                                  : "neutral"
                          }
                        />
                      </div>
                    ))}
                    {(!protection || protection.checklist.length === 0) && (
                      <p className="rounded-xl border border-hairline/70 bg-black/20 px-4 py-6 text-center text-xs text-sage">
                        No vault yet, so there is nothing to verify.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      onClick={handleVerify}
                      disabled={Boolean(busy) || !vault}
                      variant="outline"
                      className="h-10 rounded-lg border-hairline bg-transparent text-xs text-ivory hover:border-mint/30"
                    >
                      {busy === "verify" ? <Loader2 className="size-3.5 animate-spin" /> : "Re-run verification"}
                    </Button>
                    {protection && (
                      <span className="text-[11px] text-sage">
                        Coverage {protection.score}% ·{" "}
                        {protection.mandatoryMet ? "mandatory safeguards met" : "mandatory safeguards incomplete"}
                      </span>
                    )}
                  </div>
                </StepShell>
              )}

              {step === 8 && (
                <div>
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="max-w-xl">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-mint/80">Setup complete</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ivory">
                        {protection?.label ?? "Protection status unavailable"}
                      </h2>
                      <p className="mt-2 text-[12px] leading-6 text-sage">{protection?.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusPill label={`${protection?.score ?? 0}% coverage`} tone="neutral" />
                        <StatusPill
                          label={vault?.mode === "DEMO" ? "Simulated safeguards" : "Live"}
                          tone="warn"
                        />
                        <StatusPill
                          label={wallet?.verification === "SIGNATURE" ? "Ownership verified" : "Unverified signer"}
                          tone={wallet?.verification === "SIGNATURE" ? "safe" : "warn"}
                        />
                      </div>
                    </div>
                    <div className="w-full max-w-[220px] shrink-0">
                      <VaultDial compact />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Guardians", value: `${confirmedGuardians.length}/3 confirmed` },
                      { label: "Decoys", value: `${activeDecoys.length}/3 active` },
                      { label: "Withdrawal delay", value: `${workspace.policy?.delayMinutes ?? 0} minutes` },
                    ].map((entry) => (
                      <div key={entry.label} className="rounded-lg border border-hairline/70 bg-black/20 px-3.5 py-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-sage">{entry.label}</p>
                        <p className="mt-1 text-[12px] text-ivory">{entry.value}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-5 text-[11px] leading-5 text-sage">
                    This vault does not hold real assets. The next screen shows simulated balances you
                    can fund for demonstration; every transfer and freeze stays labelled.
                  </p>

                  <Button
                    onClick={() => navigate("/dashboard")}
                    className="mt-5 h-11 rounded-lg bg-mint px-6 text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
                  >
                    Enter the dashboard <ArrowRight className="size-4" />
                  </Button>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3.5 py-2.5 text-[11px] leading-5 text-[#F17676]">
                  {error}
                </p>
              )}
              {notice && !error && (
                <p className="mt-4 rounded-lg border border-mint/20 bg-mint/[0.04] px-3.5 py-2.5 text-[11px] leading-5 text-mint/90">
                  {notice}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1.5 text-[11px] text-sage transition-colors hover:text-ivory disabled:opacity-40"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
                  disabled={!canContinue}
                  className="h-10 rounded-lg bg-mint px-5 text-xs font-semibold text-[#04241a] hover:bg-mint-bright disabled:opacity-40"
                >
                  Continue <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="text-[11px] text-mint hover:text-mint-bright"
                >
                  Skip the tour and open the dashboard →
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: typeof Wallet;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-mint">
        <Icon className="size-3.5" />
        <p className="text-[9px] uppercase tracking-[0.2em]">{eyebrow}</p>
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-ivory sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-[12px] leading-6 text-sage">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
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
      <span className="text-[11px] font-medium text-ivory/80">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1.5 block text-[10px] leading-4 text-sage">{hint}</span>}
    </label>
  );
}

function AttachedWallet({ wallet }: { wallet: NonNullable<ReturnType<typeof useWorkspace>["workspace"]>["wallet"] }) {
  const [copied, setCopied] = useState(false);
  if (!wallet) return null;
  return (
    <div className="rounded-xl border border-hairline/70 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-sage">Attached wallet</p>
          <p className="mt-1.5 font-mono text-[12px] text-ivory">{wallet.address}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline text-sage hover:text-mint"
          aria-label="Copy wallet address"
        >
          {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusPill label={wallet.label ?? "Primary"} tone="neutral" />
        <StatusPill
          label={wallet.verification === "SIGNATURE" ? "Signature verified" : "Demo signer · unverified"}
          tone={wallet.verification === "SIGNATURE" ? "safe" : "warn"}
        />
      </div>
    </div>
  );
}
