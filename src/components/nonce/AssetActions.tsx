import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { formatAmount, formatTime } from "@/lib/nonce";

const withdrawSchema = z.object({
  amount: z
    .string()
    .min(1, "Enter an amount.")
    .refine((value) => /^\d*\.?\d+$/.test(value) && Number(value) > 0, "Enter a positive amount."),
  destination: z
    .string()
    .min(1, "Enter a destination address.")
    .refine((value) => /^0x[a-fA-F0-9]{40}$/.test(value.trim()), "Enter a valid EVM address."),
});

type WithdrawValues = z.infer<typeof withdrawSchema>;

export function DepositDialog({
  vaultId,
  assets,
  defaultSymbol = "ETH",
  children,
}: {
  vaultId: Id<"vaults">;
  assets: Doc<"vaultAssets">[];
  defaultSymbol?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fund = useMutation(api.nonce.vaults.fundDemoAsset);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    setBusy(true);
    try {
      await fund({ vaultId, symbol, amount });
      setDone(true);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sandbox deposit did not complete.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDone(false);
          setError(null);
          setAmount("");
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="border-hairline bg-[#0b1c16] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ivory">Deposit into the sandbox vault</DialogTitle>
          <DialogDescription className="text-[12px] leading-6 text-sage">
            No RPC connection exists in this build. Funding records a simulated balance and is
            labelled as such — do not send real assets to any address shown in NONCE.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="rounded-xl border border-mint/25 bg-mint/[0.05] p-4">
            <p className="text-[12px] font-medium text-mint">Sandbox balance updated</p>
            <p className="mt-1.5 text-[11px] leading-5 text-sage">
              The ledger entry is recorded as SIMULATED. No chain transaction occurred and no
              transaction hash was produced.
            </p>
            <Button
              onClick={() => setDone(false)}
              variant="outline"
              className="mt-4 h-9 rounded-lg border-hairline bg-transparent text-xs"
            >
              Add more
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-[11px] font-medium text-ivory/80">Asset</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {assets.map((asset) => (
                  <button
                    key={asset._id}
                    type="button"
                    onClick={() => setSymbol(asset.symbol)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      symbol === asset.symbol
                        ? "border-mint/40 bg-mint/[0.07]"
                        : "border-hairline bg-black/20 hover:border-mint/20",
                    )}
                  >
                    <span className="block text-[12px] text-ivory">{asset.symbol}</span>
                    <span className="mt-0.5 block text-[10px] text-sage">
                      {asset.name} · balance {formatAmount(asset.balance)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="deposit-amount" className="text-[11px] font-medium text-ivory/80">
                Amount
              </label>
              <Input
                id="deposit-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </div>

            {error && <p className="text-[11px] text-[#F17676]">{error}</p>}

            <Button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-lg bg-mint text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Record simulated deposit"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawDialog({
  vaultId,
  assets,
  policy,
  defaultSymbol = "ETH",
  children,
}: {
  vaultId: Id<"vaults">;
  assets: Doc<"vaultAssets">[];
  policy: Doc<"withdrawalPolicies"> | null;
  defaultSymbol?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: string;
    executeAfter: number;
  } | null>(null);
  const requestWithdrawal = useMutation(api.nonce.withdrawals.request);
  const asset = assets.find((entry) => entry.symbol === symbol) ?? assets[0];

  const form = useForm<WithdrawValues>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { amount: "", destination: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    if (!asset) {
      setError("No asset is available on this vault.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await requestWithdrawal({
        vaultId,
        assetId: asset._id,
        amount: values.amount,
        destination: values.destination.trim(),
      });
      setResult({ status: response.status, executeAfter: response.executeAfter });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The withdrawal request was rejected.");
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="border-hairline bg-[#0b1c16] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ivory">Request a withdrawal</DialogTitle>
          <DialogDescription className="text-[12px] leading-6 text-sage">
            Every withdrawal is queued for at least 10 minutes. Requests above the large or
            cumulative threshold also need two guardian approvals. Nothing releases immediately.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div
            className={cn(
              "rounded-xl border p-4",
              result.status === "COMPLETED"
                ? "border-mint/25 bg-mint/[0.05]"
                : "border-[#E9B45E]/25 bg-[#E9B45E]/[0.05]",
            )}
          >
            <StatusPill
              label={
                result.status === "COMPLETED"
                  ? "Simulated transfer complete"
                  : result.status === "AWAITING_GUARDIANS"
                    ? "Awaiting guardians + delay"
                    : "Queued under guard"
              }
              tone={result.status === "COMPLETED" ? "safe" : "warn"}
            />
            <p className="mt-3 text-[11px] leading-5 text-sage">
              {result.status === "COMPLETED"
                ? "The sandbox ledger recorded this transfer as SIMULATED. No on-chain transaction was submitted."
                : `Execution is not before ${formatTime(result.executeAfter)}. Cancel it from the vault before then if this was not you.`}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setResult(null)}
                variant="outline"
                className="h-9 rounded-lg border-hairline bg-transparent text-xs"
              >
                New request
              </Button>
              <Button
                onClick={() => setOpen(false)}
                className="h-9 rounded-lg bg-mint text-xs font-semibold text-[#04241a] hover:bg-mint-bright"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-[11px] font-medium text-ivory/80">Asset</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {assets.map((entry) => (
                  <button
                    key={entry._id}
                    type="button"
                    onClick={() => setSymbol(entry.symbol)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      symbol === entry.symbol
                        ? "border-mint/40 bg-mint/[0.07]"
                        : "border-hairline bg-black/20 hover:border-mint/20",
                    )}
                  >
                    <span className="block text-[12px] text-ivory">{entry.symbol}</span>
                    <span className="mt-0.5 block text-[10px] text-sage">
                      Available {formatAmount(entry.balance)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="withdraw-amount" className="text-[11px] font-medium text-ivory/80">
                  Amount
                </label>
                {asset && (
                  <button
                    type="button"
                    onClick={() => form.setValue("amount", asset.balance, { shouldValidate: true })}
                    className="text-[10px] text-mint hover:text-mint-bright"
                  >
                    Use max
                  </button>
                )}
              </div>
              <Input
                id="withdraw-amount"
                inputMode="decimal"
                placeholder="0.00"
                {...form.register("amount")}
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
              {form.formState.errors.amount && (
                <p className="mt-1 text-[10px] text-[#F17676]">{form.formState.errors.amount.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="withdraw-destination" className="text-[11px] font-medium text-ivory/80">
                Destination address
              </label>
              <Input
                id="withdraw-destination"
                placeholder="0x…"
                {...form.register("destination")}
                className="mt-1.5 h-10 border-hairline bg-black/25 font-mono text-[11px]"
              />
              {form.formState.errors.destination && (
                <p className="mt-1 text-[10px] text-[#F17676]">
                  {form.formState.errors.destination.message}
                </p>
              )}
            </div>

            {policy && (
              <div className="rounded-lg border border-hairline/70 bg-black/20 px-3.5 py-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-sage">
                  <ShieldCheck className="size-3 text-mint" /> Applied policy
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-sage">
                  Limit {policy.maxPerTransaction} ETH per transaction · {policy.rollingLimit ?? "2.5"}{" "}
                  ETH per rolling 24 hours · delays above {policy.largeWithdrawalThreshold} ETH held{" "}
                  {policy.delayMinutes} min · minimum delay 10 min
                  {policy.allowlistOnly ? " · allowlist-only destinations" : ""}.
                </p>
                {symbol !== "ETH" && (
                  <p className="mt-1.5 text-[10px] leading-4 text-[#E9B45E]">
                    {symbol} uses a separate test-token policy: 2,500 per transfer, 10,000 per
                    24h, guardian approval above 500. ETH limits are never applied to token units.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#F17676]">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-lg bg-mint text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <ArrowUpFromLine className="size-4" /> Submit withdrawal request
                </>
              )}
            </Button>
            <p className="text-center text-[10px] text-sage">
              Execution is simulated. No chain transaction is signed or broadcast.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DepositButton({
  vaultId,
  assets,
  children,
}: {
  vaultId: Id<"vaults">;
  assets: Doc<"vaultAssets">[];
  children?: React.ReactNode;
}) {
  return (
    <DepositDialog vaultId={vaultId} assets={assets}>
      <Button className="h-9 rounded-lg bg-mint px-4 text-xs font-semibold text-[#04241a] hover:bg-mint-bright">
        {children ?? (
          <>
            <ArrowDownToLine className="size-3.5" /> Deposit
          </>
        )}
      </Button>
    </DepositDialog>
  );
}
