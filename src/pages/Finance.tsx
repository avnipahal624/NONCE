import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Clock3,
  Download,
  Landmark,
  Link2Off,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { WithdrawDialog } from "@/components/nonce/AssetActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatDateTime, formatRemaining } from "@/lib/nonce";
import { PLANNED_FEATURES } from "@/lib/features";

export default function Finance() {
  const finance = useQuery(api.nonce.intelligence.financeOverview);
  const addEntry = useMutation(api.nonce.addresses.add);
  const removeEntry = useMutation(api.nonce.addresses.remove);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredActivity = useMemo(() => {
    if (!finance?.configured) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return finance.activity;
    return finance.activity.filter((entry) =>
      [entry.kind, entry.status, entry.symbol, entry.amount, entry.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [finance, query]);

  if (finance === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72 bg-white/[0.06]" />
          <Skeleton className="h-48 w-full bg-white/[0.04]" />
          <Skeleton className="h-64 w-full bg-white/[0.04]" />
        </div>
      </AppShell>
    );
  }

  if (!finance?.configured) {
    return (
      <AppShell>
        <NoVaultYet />
      </AppShell>
    );
  }

  const addRecipient = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addEntry({ vaultId: finance.vault.id, label, address });
      setLabel("");
      setAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recipient could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const exportActivity = () => {
    const rows = [
      ["timestamp", "kind", "status", "symbol", "amount", "description", "source"],
      ...finance.activity.map((entry) => [
        new Date(entry.createdAt).toISOString(),
        entry.kind,
        entry.status,
        entry.symbol ?? "",
        entry.amount ?? "",
        entry.description,
        entry.source,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nonce-finance-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Finance Overview"
          title="One verified view of the vault"
          description="Supported balances, protected payments and evidence-backed activity. Fiat values, subscriptions, token allowances and DeFi exposure stay explicitly unavailable until a verified source exists."
          actions={
            <WithdrawDialog
              vaultId={finance.vault.id}
              assets={finance.assets}
              policy={finance.policy}
            >
              <Button className="h-9 gap-2 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright">
                <ShieldCheck className="size-3.5" /> Protected payment
              </Button>
            </WithdrawDialog>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {finance.assets.map((asset) => (
            <div
              key={asset._id}
              className="rounded-2xl border border-hairline/70 bg-[linear-gradient(145deg,#0c251b,#081811)] p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sage">
                  {asset.symbol}
                </p>
                <StatusPill
                  label={
                    asset.symbol === "ETH"
                      ? finance.vault.mode === "DEMO"
                        ? "SANDBOX"
                        : "SUPPORTED"
                      : "NOT CONNECTED"
                  }
                  tone={asset.symbol === "ETH" ? "warn" : "neutral"}
                  className="text-[8px]"
                />
              </div>
              <p className="mt-3 font-tabular text-2xl font-semibold tracking-tight text-ivory">
                {formatAmount(asset.balance)}
              </p>
              <p className="mt-1 text-[10px] text-sage">{asset.name} · {asset.decimals} decimals</p>
            </div>
          ))}
          <div className="rounded-2xl border border-dashed border-hairline/70 bg-black/15 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sage">Fiat value</p>
              <Link2Off className="size-3.5 text-sage" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-ivory">Not connected</p>
            <p className="mt-1 text-[10px] leading-4 text-sage">{finance.fiat.reason}</p>
          </div>
          <Link
            to="/copilot"
            className="rounded-2xl border border-hairline/70 bg-[linear-gradient(145deg,#0c251b,#081811)] p-4 transition-colors hover:border-mint/30"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sage">Portfolio risk</p>
              <ShieldCheck className="size-3.5 text-mint" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-ivory">{finance.risk.label}</p>
            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-sage">{finance.risk.summary}</p>
          </Link>
        </div>

        {finance.vault.mode === "DEMO" && (
          <div className="rounded-xl border border-[#E9B45E]/25 bg-[#E9B45E]/[0.04] px-4 py-3 text-[11px] leading-5 text-[#E9B45E]">
            Sandbox ledger only. These balances are not on-chain, the USDC entry is a test ledger
            asset, and no fiat conversion is claimed.
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionLabel>Protected payments</SectionLabel>
                <h2 className="mt-1 text-[15px] font-medium text-ivory">Scheduled by the vault policy</h2>
              </div>
              <Button
                onClick={exportActivity}
                variant="outline"
                className="h-8 gap-1.5 rounded-md border-hairline bg-transparent text-[10px]"
              >
                <Download className="size-3" /> Export activity
              </Button>
            </div>
            {finance.pendingPayments.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-hairline/70 bg-black/15 px-4 py-8 text-center">
                <Clock3 className="mx-auto size-5 text-sage" />
                <p className="mt-2 text-[12px] text-ivory">No payments in flight</p>
                <p className="mt-1 text-[10px] leading-5 text-sage">
                  A protected payment starts in the Vault with a saved recipient, policy preflight
                  and a mandatory delay. Nothing executes immediately.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {finance.pendingPayments.map((payment) => (
                  <div
                    key={payment._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline/60 bg-black/20 px-3.5 py-3"
                  >
                    <div>
                      <p className="text-[11px] text-ivory">
                        {payment.amount} {payment.symbol} to{" "}
                        <span className="font-mono text-[10px]">{payment.destination.slice(0, 10)}…</span>
                      </p>
                      <p className="mt-1 text-[10px] text-sage">
                        {payment.status.replace(/_/g, " ").toLowerCase()} · unlocks {formatRemaining(payment.executeAfter)}
                      </p>
                    </div>
                    <Button asChild variant="ghost" className="h-7 px-2 text-[10px] text-mint">
                      <Link to="/vault">Review <ArrowUpRight className="size-3" /></Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <SectionLabel>Recipient address book</SectionLabel>
            <p className="mt-1 text-[11px] leading-5 text-sage">
              Private labels for this vault. Saved addresses still require out-of-band verification
              before a payment.
            </p>
            <form onSubmit={addRecipient} className="mt-4 space-y-2">
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Label, e.g. Treasury"
                maxLength={40}
                className="h-9 border-hairline bg-black/25 text-[11px]"
              />
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x…"
                className="h-9 border-hairline bg-black/25 font-mono text-[10px]"
              />
              <Button
                type="submit"
                disabled={busy || label.trim().length < 2 || !address.trim()}
                className="h-8 w-full gap-1.5 rounded-md bg-mint text-[10px] font-semibold text-[#04241a] hover:bg-mint-bright"
              >
                <Plus className="size-3" /> Save recipient
              </Button>
              {error && <p className="text-[10px] leading-4 text-[#F17676]">{error}</p>}
            </form>
            <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
              {finance.addressBook.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-hairline/50 bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-ivory">{entry.label}</p>
                    <p className="truncate font-mono text-[9px] text-sage">
                      {entry.address.slice(0, 10)}…{entry.address.slice(-6)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void removeEntry({ vaultId: finance.vault.id, entryId: entry._id })
                    }
                    className="rounded p-1 text-sage transition-colors hover:bg-white/[0.04] hover:text-[#F17676]"
                    aria-label={`Remove ${entry.label}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
              {finance.addressBook.length === 0 && (
                <p className="text-[10px] text-sage">No saved recipients yet.</p>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionLabel>Financial activity</SectionLabel>
              <h2 className="mt-1 text-[15px] font-medium text-ivory">Searchable vault ledger</h2>
            </div>
            <label className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-sage" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search kind, asset, status…"
                className="h-9 border-hairline bg-black/25 pl-9 text-[11px]"
                aria-label="Search financial activity"
              />
            </label>
          </div>
          <div className="mt-4 divide-y divide-hairline/50">
            {filteredActivity.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-sage">No matching activity.</p>
            ) : (
              filteredActivity.slice(0, 30).map((entry) => (
                <div key={entry._id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-ivory">
                      {entry.kind.replace(/_/g, " ").toLowerCase()}{" "}
                      {entry.amount && <span className="text-sage">· {entry.amount} {entry.symbol}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-sage">{entry.description}</p>
                    <p className="mt-1 text-[9px] text-sage/70">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <StatusPill
                    label={entry.source}
                    tone={entry.source === "SIMULATED" ? "warn" : "safe"}
                    className="shrink-0 text-[8px]"
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Subscriptions & token approvals",
              body: "No allowance or subscription data source is connected. NONCE will not invent approvals or recurring charges.",
              status: "NOT CONNECTED",
            },
            {
              title: "DeFi and NFT exposure",
              body: "No position, marketplace-operator or collection indexer is connected. Exposure remains planned, not monitored.",
              status: "PLANNED",
            },
            {
              title: "Fees and fiat analytics",
              body: finance.feeAnalytics.reason,
              status: "UNAVAILABLE",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-hairline/60 bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium text-ivory">{item.title}</p>
                <StatusPill label={item.status} tone="neutral" className="shrink-0 text-[8px]" />
              </div>
              <p className="mt-2 text-[10px] leading-5 text-sage">{item.body}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
          <SectionLabel>Planned and disabled capabilities</SectionLabel>
          <p className="mt-1 text-[11px] leading-5 text-sage">
            These flags default off. Turning a label on without the reviewed backend, contract and
            data source does not create coverage.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED_FEATURES.slice(0, 6).map((feature) => (
              <div
                key={feature.name}
                className="rounded-lg border border-hairline/50 bg-black/20 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-ivory">{feature.label}</p>
                  <StatusPill label="PLANNED" tone="neutral" className="shrink-0 text-[8px]" />
                </div>
                <p className="mt-1 text-[9px] leading-4 text-sage">{feature.reason}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-xl border border-hairline/60 bg-black/15 px-4 py-3 text-[10px] leading-5 text-sage">
          <Landmark className="mt-0.5 size-3.5 shrink-0 text-sage" />
          <div>
            <p className="flex items-center gap-1.5 text-ivory">
              <WalletCards className="size-3.5" /> Supported scope
            </p>
            <p className="mt-1">{finance.limited.join(" ")}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
