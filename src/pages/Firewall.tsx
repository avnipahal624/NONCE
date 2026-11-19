import { DappResearchPanel } from "@/components/nonce/DappResearchPanel";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { ArrowRight, ScanSearch, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { FirewallPanel } from "@/components/nonce/FirewallPanel";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/nonce";

export default function Firewall() {
  const { workspace, isLoading } = useWorkspace();
  const [assetId, setAssetId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");

  const vault = workspace?.vault;
  const assets = useMemo(() => workspace?.assets ?? [], [workspace?.assets]);
  const policy = workspace?.policy;
  const selected = assets.find((asset) => asset._id === assetId) ?? assets[0];
  const addressBook = useQuery(
    api.nonce.addresses.list,
    vault ? { vaultId: vault._id } : "skip",
  );
  const destinationValid = /^0x[a-fA-F0-9]{40}$/.test(destination.trim());
  const firewall = useQuery(
    api.nonce.intelligence.analyzeWithdrawal,
    vault && selected && amount.trim() && destinationValid
      ? {
          vaultId: vault._id,
          assetId: selected._id,
          amount: amount.trim(),
          destination: destination.trim(),
        }
      : "skip",
  );

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72 bg-white/[0.06]" />
          <Skeleton className="h-64 w-full bg-white/[0.04]" />
        </div>
      </AppShell>
    );
  }

  if (!vault || !selected || !policy) {
    return (
      <AppShell>
        <div className="space-y-6"><DappResearchPanel /><NoVaultYet /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Transaction Firewall"
          title="Review the policy before the wallet"
          description="A deterministic pre-signing explanation of the saved withdrawal policy, balance, recipient and current vault state. It is advisory; the backend and contract remain authoritative."
          actions={
            <Button
              asChild
              variant="outline"
              className="h-9 gap-2 rounded-lg border-hairline bg-black/20 text-xs"
            >
              <Link to="/vault">
                Open protected payment <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-mint/20 bg-mint/[0.04] px-4 py-3 text-[11px] leading-5 text-sage">
          <StatusPill
            label={vault.mode === "DEMO" ? "Sandbox policy" : "Testnet policy"}
            tone={vault.mode === "DEMO" ? "warn" : "neutral"}
            icon={<ShieldCheck className="size-3" />}
          />
          <span>
            No transaction is submitted here. A protected payment is queued from the Vault and
            still waits for the backend, the saved delay and any guardian quorum.
          </span>
        </div>

        <DappResearchPanel />

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <div className="flex items-center justify-between">
              <div>
                <SectionLabel>Proposed payment</SectionLabel>
                <h2 className="mt-1 text-[15px] font-medium text-ivory">Test the rule path</h2>
              </div>
              <ScanSearch className="size-4 text-mint" />
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-medium text-ivory/80">Asset</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {assets.map((asset) => (
                  <button
                    key={asset._id}
                    type="button"
                    onClick={() => setAssetId(asset._id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected._id === asset._id
                        ? "border-mint/40 bg-mint/[0.07]"
                        : "border-hairline bg-black/20 hover:border-mint/20",
                    )}
                  >
                    <span className="block text-[12px] text-ivory">{asset.symbol}</span>
                    <span className="mt-0.5 block text-[10px] text-sage">
                      Balance {formatAmount(asset.balance)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="firewall-amount" className="text-[11px] font-medium text-ivory/80">
                Amount
              </label>
              <Input
                id="firewall-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </div>

            <div className="mt-4">
              <label
                htmlFor="firewall-destination"
                className="text-[11px] font-medium text-ivory/80"
              >
                Destination
              </label>
              <Input
                id="firewall-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="0x…"
                className="mt-1.5 h-10 border-hairline bg-black/25 font-mono text-[11px]"
              />
              {(addressBook ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(addressBook ?? []).slice(0, 6).map((entry) => (
                    <button
                      key={entry._id}
                      type="button"
                      onClick={() => setDestination(entry.address)}
                      className="rounded-full border border-hairline/70 bg-black/20 px-2 py-1 text-[9px] text-sage transition-colors hover:border-mint/30 hover:text-mint"
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-sage">Saved policy</p>
              <p className="mt-1.5 text-[10px] leading-5 text-sage">
                {policy.maxPerTransaction} ETH per transfer · {policy.rollingLimit ?? "—"} ETH
                rolling 24h · {policy.delayMinutes} min delay above{" "}
                {policy.largeWithdrawalThreshold} ETH · {policy.guardianThreshold}-of-3 guardian
                quorum
                {policy.allowlistOnly ? " · allowlist-only" : ""}.
              </p>
              {selected.symbol !== "ETH" && (
                <p className="mt-1.5 text-[9px] leading-4 text-[#E9B45E]">
                  Token-unit limits are separate. The USDC entry is a sandbox ledger asset until a
                  reviewed ERC-20 module exists.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <SectionLabel>Firewall result</SectionLabel>
            <h2 className="mt-1 text-[15px] font-medium text-ivory">Evidence-backed checks</h2>
            <div className="mt-4">
              <FirewallPanel
                result={firewall?.ok ? firewall.result : null}
                error={firewall && !firewall.ok ? firewall.error : null}
                guardianThreshold={policy.guardianThreshold}
              />
            </div>
            <p className="mt-3 text-[10px] leading-5 text-sage">
              This view does not reserve balance or create a request. If the recipient is not in
              the address book, verify it out-of-band; a saved address is not automatically
              allowlist-approved.
            </p>
            <Button
              asChild
              className="mt-4 h-9 w-full rounded-lg bg-mint text-[11px] font-semibold text-[#04241a] hover:bg-mint-bright"
            >
              <Link to="/vault">Continue to protected payment</Link>
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
