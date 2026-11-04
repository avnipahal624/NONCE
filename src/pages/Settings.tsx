import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  Check,
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AppShell } from "@/components/nonce/AppShell";
import { PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNavigate } from "react-router";

export default function Settings() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const settings = useQuery(api.nonce.notifications.settings);
  const workspace = useWorkspace().workspace;
  const updatePreferences = useMutation(api.nonce.notifications.updatePreferences);
  const setPrimary = useMutation(api.nonce.wallets.setPrimaryWallet);
  const revokeWallet = useMutation(api.nonce.wallets.revokeWallet);

  const [displayName, setDisplayName] = useState("");
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings?.account) return;
    setDisplayName(settings.account.displayName ?? settings.account.name ?? "");
    setNotifyInApp(settings.account.notifyInApp ?? true);
  }, [settings?.account]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That change could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const vaultSigner = workspace?.vault?.ownerSigner;

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Settings"
          title="Account and environment"
          description="Preferences, wallet identities and the honest status of this deployment. Security configuration lives under Protection and Recovery."
          actions={<StatusPill label="Sandbox environment" tone="warn" />}
        />

        {error && (
          <p role="alert" className="rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.06] px-4 py-2.5 text-[11px] text-[#F17676]">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg border border-mint/20 bg-mint/[0.04] px-4 py-2.5 text-[11px] text-mint/90">
            Changes saved.
          </p>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-mint" />
              <SectionLabel>Profile</SectionLabel>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-medium text-ivory/80">Display name</span>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="How NONCE addresses you"
                  className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
                />
              </label>
              <div>
                <span className="text-[11px] font-medium text-ivory/80">Email</span>
                <div className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-hairline bg-white/[0.02] px-3 text-[12px] text-sage">
                  <Mail className="size-3.5" />
                  {settings?.account?.email ?? "Sandbox account · no email"}
                  {settings?.account?.isAnonymous && (
                    <StatusPill label="Anonymous" tone="warn" className="ml-auto text-[9px]" />
                  )}
                </div>
                <p className="mt-1 text-[10px] text-sage">Email changes are handled by sign-in, not here.</p>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-hairline/70 bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={notifyInApp}
                  onChange={(event) => setNotifyInApp(event.target.checked)}
                  className="mt-0.5 size-4 accent-[#57D5A5]"
                />
                <span>
                  <span className="block text-[12px] text-ivory">In-app notifications</span>
                  <span className="mt-0.5 block text-[10px] leading-5 text-sage">
                    Security events, pending freezes and guardian approvals appear in the bell menu.
                  </span>
                </span>
              </label>

              <Button
                onClick={() =>
                  void run("profile", async () => {
                    if (displayName.trim().length < 2) throw new Error("Enter a display name.");
                    await updatePreferences({ displayName: displayName.trim(), notifyInApp });
                  })
                }
                disabled={Boolean(busy)}
                className="h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright"
              >
                {busy === "profile" ? <Loader2 className="size-3.5 animate-spin" /> : "Save preferences"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center gap-2">
              <Bell className="size-3.5 text-mint" />
              <SectionLabel>Notification delivery</SectionLabel>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-ivory">In-app</p>
                  <p className="mt-0.5 text-[9px] text-sage">Recorded and delivered to the bell menu.</p>
                </div>
                <StatusPill label={notifyInApp ? "Enabled" : "Off"} tone={notifyInApp ? "safe" : "neutral"} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-ivory">Email</p>
                  <p className="mt-0.5 text-[9px] text-sage">
                    No email provider is configured. Notifications are not sent by email.
                  </p>
                </div>
                <StatusPill label="Not configured" tone="warn" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-ivory">Push / SMS</p>
                  <p className="mt-0.5 text-[9px] text-sage">Out of scope for this build.</p>
                </div>
                <StatusPill label="Not available" tone="neutral" />
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-sage">
              NONCE never marks an external notification as delivered. “Sent” would require a
              provider receipt, which this build does not have.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
          <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-3.5 text-mint" />
              <SectionLabel>Wallet identities</SectionLabel>
            </div>
            <Link to="/onboarding" className="text-[10px] text-mint hover:text-mint-bright">
              Add or verify wallet →
            </Link>
          </div>
          {!workspace?.wallets || workspace.wallets.length === 0 ? (
            <p className="px-5 py-6 text-center text-[11px] text-sage">No wallet is attached to this account.</p>
          ) : (
            <ul className="divide-y divide-hairline/40">
              {workspace.wallets.map((wallet) => {
                const isVaultSigner = vaultSigner?.toLowerCase() === wallet.address.toLowerCase();
                return (
                  <li key={wallet._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Address value={wallet.address} lead={8} tail={6} />
                        <StatusPill
                          label={wallet.verification === "SIGNATURE" ? "Signature verified" : "Demo signer"}
                          tone={wallet.verification === "SIGNATURE" ? "safe" : "warn"}
                          className="text-[9px]"
                        />
                        {wallet.isPrimary && <StatusPill label="Primary" tone="neutral" className="text-[9px]" />}
                        {isVaultSigner && <StatusPill label="Vault signer" tone="info" className="text-[9px]" />}
                      </div>
                      <p className="mt-1 text-[10px] text-sage">
                        {wallet.label ?? "Wallet"} · chain {wallet.chainId} · added{" "}
                        {new Date(wallet.verifiedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!wallet.isPrimary && (
                        <button
                          type="button"
                          onClick={() =>
                            void run(`primary-${wallet._id}`, async () => {
                              if (wallet.verification !== "SIGNATURE") {
                                throw new Error("An unverified demo signer cannot become the primary identity.");
                              }
                              await setPrimary({ walletId: wallet._id });
                            })
                          }
                          disabled={Boolean(busy)}
                          className="rounded-md border border-hairline px-2.5 py-1.5 text-[10px] text-sage hover:border-mint/30 hover:text-mint"
                        >
                          Make primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void run(`revoke-${wallet._id}`, async () => {
                            await revokeWallet({ walletId: wallet._id });
                          })
                        }
                        disabled={Boolean(busy) || isVaultSigner}
                        title={isVaultSigner ? "The vault signer cannot be revoked while it protects a vault." : undefined}
                        className="flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1.5 text-[10px] text-sage hover:border-[#F17676]/30 hover:text-[#F17676] disabled:opacity-40"
                      >
                        <Trash2 className="size-3" /> Revoke
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-hairline/50 px-5 py-3 text-[10px] leading-5 text-sage">
            NONCE stores an address and how ownership was verified. It does not store a private key,
            seed phrase or wallet password for any identity.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-mint" />
              <SectionLabel>Environment</SectionLabel>
            </div>
            <dl className="mt-3 space-y-2.5 text-[11px]">
              {[
                { label: "Network", value: "Base Sepolia · chain 84532" },
                { label: "Mode", value: "Sandbox / DEMO" },
                { label: "Vault deployment", value: "Simulated · no contract address" },
                { label: "Contract version", value: workspace?.vault?.contractVersion ?? "nonce-vault 0.1.0-demo" },
                { label: "RPC watcher", value: "Not configured" },
                { label: "Payment or fiat rails", value: "None" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <dt className="text-sage">{item.label}</dt>
                  <dd className="text-right text-ivory/85">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[10px] leading-5 text-sage">
              Do not send real assets. A production vault requires a deployed, audited contract and a
              live monitor.
            </p>
          </div>

          <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-mint" />
              <SectionLabel>Security & data</SectionLabel>
            </div>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-sage">
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-mint" /> Every vault action is authorized on the server against the signed-in owner.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-mint" /> Evidence hashes are SHA-256 over canonical event data.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-mint" /> Audit records are append-only from the application's perspective.</li>
              <li className="flex gap-2"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[#E9B45E]" /> This is a demonstration build; no independent audit, insurance or legal attestation exists.</li>
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/security"
                className="rounded-lg border border-hairline px-3 py-2 text-[10px] text-ivory hover:border-mint/30 hover:text-mint"
              >
                Security architecture
              </Link>
              <Link
                to="/faq"
                className="rounded-lg border border-hairline px-3 py-2 text-[10px] text-ivory hover:border-mint/30 hover:text-mint"
              >
                FAQ
              </Link>
            </div>

            <div className="mt-4 border-t border-hairline/50 pt-3">
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
                className="inline-flex items-center gap-1.5 text-[10px] text-[#F17676] hover:underline"
              >
                <LogOut className="size-3" /> Sign out of this device
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-hairline/70 bg-[#0b1c16]/60 px-4 py-3">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-mint/70" />
          <p className="text-[10px] leading-5 text-sage">
            Lost your wallet? Recovery starts from a trusted device and needs two guardian approvals.
            NONCE support cannot reset it, because NONCE cannot move or recover your keys.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
