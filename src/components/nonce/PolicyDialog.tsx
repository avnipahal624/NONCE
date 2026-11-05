import { useEffect, useState } from "react";
import { Clock, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
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
import { isValidAddress } from "@/lib/wallet";

export function PolicyDialog({
  vaultId,
  policy,
  children,
}: {
  vaultId: Id<"vaults">;
  policy: Doc<"withdrawalPolicies"> | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const propose = useMutation(api.nonce.policy.propose);

  const [form, setForm] = useState({
    maxPerTransaction: "1",
    rollingLimit: "2.5",
    largeWithdrawalThreshold: "0.25",
    delayMinutes: 30,
    allowlistOnly: false,
    allowlist: "",
  });

  useEffect(() => {
    if (!policy) return;
    setForm({
      maxPerTransaction: policy.maxPerTransaction,
      rollingLimit: policy.rollingLimit ?? "2.5",
      largeWithdrawalThreshold: policy.largeWithdrawalThreshold,
      delayMinutes: policy.delayMinutes,
      allowlistOnly: policy.allowlistOnly,
      allowlist: policy.allowlist.join(", "),
    });
  }, [policy, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const max = Number(form.maxPerTransaction);
    const rolling = Number(form.rollingLimit);
    const threshold = Number(form.largeWithdrawalThreshold);
    const entries = form.allowlist
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!Number.isFinite(max) || max <= 0)
      return setError("Enter a positive per-transaction limit.");
    if (!Number.isFinite(rolling) || rolling < max)
      return setError("The 24-hour limit must be at least the per-transaction limit.");
    if (!Number.isFinite(threshold) || threshold <= 0)
      return setError("Enter a positive threshold.");
    if (threshold > max)
      return setError("The threshold cannot exceed the per-transaction limit.");
    if (!Number.isFinite(form.delayMinutes) || form.delayMinutes < 10)
      return setError("The security delay cannot be lower than 10 minutes.");
    if (form.allowlistOnly && entries.length === 0)
      return setError("Add at least one allowlisted address, or turn allowlist-only off.");
    if (entries.some((entry) => !isValidAddress(entry)))
      return setError("Every allowlist entry must be a valid EVM address.");

    setBusy(true);
    try {
      await propose({
        vaultId,
        policy: {
          maxPerTransaction: form.maxPerTransaction,
          rollingLimit: form.rollingLimit,
          delayMinutes: form.delayMinutes,
          largeWithdrawalThreshold: form.largeWithdrawalThreshold,
          guardianThreshold: 2,
          allowlistOnly: form.allowlistOnly,
          allowlist: entries,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The policy proposal could not be created.",
      );
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
          setSaved(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-hairline bg-[#0b1c16] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-ivory">Propose a protection change</DialogTitle>
          <DialogDescription className="text-[12px] leading-6 text-sage">
            Policy edits are no longer instant. Every change waits out a timelock; any
            security-reducing field also needs two of three guardian approvals. The current
            policy remains in force until the proposal executes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">
                Per-transaction limit (ETH)
              </span>
              <Input
                value={form.maxPerTransaction}
                onChange={(event) =>
                  setForm({ ...form, maxPerTransaction: event.target.value })
                }
                inputMode="decimal"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">
                Rolling 24-hour limit (ETH)
              </span>
              <Input
                value={form.rollingLimit}
                onChange={(event) => setForm({ ...form, rollingLimit: event.target.value })}
                inputMode="decimal"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">
                Large request threshold (ETH)
              </span>
              <Input
                value={form.largeWithdrawalThreshold}
                onChange={(event) =>
                  setForm({ ...form, largeWithdrawalThreshold: event.target.value })
                }
                inputMode="decimal"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">Delay (minutes)</span>
              <Input
                type="number"
                min={10}
                max={1440}
                value={form.delayMinutes}
                onChange={(event) =>
                  setForm({ ...form, delayMinutes: Number(event.target.value) })
                }
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-hairline/70 bg-black/20 p-3.5">
            <input
              type="checkbox"
              checked={form.allowlistOnly}
              onChange={(event) =>
                setForm({ ...form, allowlistOnly: event.target.checked })
              }
              className="mt-0.5 size-4 accent-[#57D5A5]"
            />
            <span>
              <span className="block text-[12px] text-ivory">Allowlist-only destinations</span>
              <span className="mt-0.5 block text-[11px] text-sage">
                Disabling this or removing a saved recipient is classified as weakening.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-ivory/80">Allowed addresses</span>
            <Input
              value={form.allowlist}
              onChange={(event) => setForm({ ...form, allowlist: event.target.value })}
              placeholder="0x…, 0x…"
              className="mt-1.5 h-10 border-hairline bg-black/25 font-mono text-[11px]"
            />
          </label>

          <div className="rounded-lg border border-[#E9B45E]/20 bg-[#E9B45E]/[0.05] px-3.5 py-3 text-[10px] leading-5 text-[#E9B45E]">
            <p className="flex items-start gap-2">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              Contract minimum policy delay is 24 hours. This sandbox compresses it to two
              minutes and labels the proposal as simulated.
            </p>
            <p className="mt-1.5 flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Weakening changes need 2-of-3 guardians. There is no owner-only override.
            </p>
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#F17676]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
            </p>
          )}
          {saved && (
            <p className="rounded-md border border-mint/25 bg-mint/[0.05] px-3 py-2 text-[11px] leading-5 text-mint">
              Proposal created. The current policy is unchanged until the timelock, and
              guardian quorum if required, is satisfied.
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
              "Create timelocked proposal"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
