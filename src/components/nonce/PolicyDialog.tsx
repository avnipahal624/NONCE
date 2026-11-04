import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
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
  const updatePolicy = useMutation(api.nonce.withdrawals.updatePolicy);

  const [form, setForm] = useState({
    maxPerTransaction: "1",
    largeWithdrawalThreshold: "0.25",
    delayMinutes: 30,
    allowlistOnly: false,
    allowlist: "",
  });

  useEffect(() => {
    if (!policy) return;
    setForm({
      maxPerTransaction: policy.maxPerTransaction,
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
    const threshold = Number(form.largeWithdrawalThreshold);
    const entries = form.allowlist
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!Number.isFinite(max) || max <= 0) return setError("Enter a positive per-transaction limit.");
    if (!Number.isFinite(threshold) || threshold <= 0) return setError("Enter a positive threshold.");
    if (threshold > max) return setError("The threshold cannot exceed the per-transaction limit.");
    if (!Number.isFinite(form.delayMinutes) || form.delayMinutes < 1)
      return setError("The delay must be at least one minute.");
    if (form.allowlistOnly && entries.length === 0)
      return setError("Add at least one allowlisted address, or turn allowlist-only off.");
    if (entries.some((entry) => !isValidAddress(entry)))
      return setError("Every allowlist entry must be a valid EVM address.");

    setBusy(true);
    try {
      await updatePolicy({
        vaultId,
        maxPerTransaction: form.maxPerTransaction,
        delayMinutes: form.delayMinutes,
        largeWithdrawalThreshold: form.largeWithdrawalThreshold,
        guardianApprovalRequired: true,
        guardianThreshold: 2,
        allowlistOnly: form.allowlistOnly,
        allowlist: entries,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The policy could not be saved.");
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
      <DialogContent className="border-hairline bg-[#0b1c16] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-ivory">Withdrawal protection</DialogTitle>
          <DialogDescription className="text-[12px] leading-6 text-sage">
            These rules are enforced against sandbox withdrawal requests. In production they must
            live in the vault contract — a server-side setting alone is not enforcement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">Per-transaction limit (ETH)</span>
              <Input
                value={form.maxPerTransaction}
                onChange={(event) => setForm({ ...form, maxPerTransaction: event.target.value })}
                inputMode="decimal"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">Large request threshold (ETH)</span>
              <Input
                value={form.largeWithdrawalThreshold}
                onChange={(event) => setForm({ ...form, largeWithdrawalThreshold: event.target.value })}
                inputMode="decimal"
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">Delay (minutes)</span>
              <Input
                type="number"
                min={1}
                max={1440}
                value={form.delayMinutes}
                onChange={(event) => setForm({ ...form, delayMinutes: Number(event.target.value) })}
                className="mt-1.5 h-10 border-hairline bg-black/25 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ivory/80">Guardian threshold</span>
              <div className="mt-1.5 flex h-10 items-center rounded-md border border-hairline bg-white/[0.02] px-3 text-sm text-sage">
                2 of 3 · fixed in this build
              </div>
            </label>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-hairline/70 bg-black/20 p-3.5">
            <input
              type="checkbox"
              checked={form.allowlistOnly}
              onChange={(event) => setForm({ ...form, allowlistOnly: event.target.checked })}
              className="mt-0.5 size-4 accent-[#57D5A5]"
            />
            <span>
              <span className="block text-[12px] text-ivory">Allowlist-only destinations</span>
              <span className="mt-0.5 block text-[11px] text-sage">
                Enabling this rejects every destination outside the saved list.
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

          <div className="flex items-start gap-2 rounded-lg border border-[#79A9E8]/20 bg-[#79A9E8]/[0.05] px-3.5 py-2.5 text-[10px] leading-5 text-[#79A9E8]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Every change is recorded in the audit trail with the actor and timestamp.
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#F17676]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
            </p>
          )}
          {saved && (
            <p className="rounded-md border border-mint/25 bg-mint/[0.05] px-3 py-2 text-[11px] text-mint">
              Withdrawal policy saved.
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-lg bg-mint text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save protection rules"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
