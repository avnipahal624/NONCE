import { ShieldCheck, TriangleAlert } from "lucide-react";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import type { FirewallResult } from "@/lib/intelligence";

export function FirewallPanel({
  result,
  error,
  guardianThreshold = 2,
}: {
  result?: FirewallResult | null;
  error?: string | null;
  guardianThreshold?: number;
}) {
  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-[#F17676]/25 bg-[#F17676]/[0.05] px-3.5 py-3 text-[10px] leading-5 text-[#F17676]">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
      </p>
    );
  }

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-hairline/70 bg-black/15 px-3.5 py-3 text-[10px] leading-5 text-sage">
        Enter a valid amount and destination to run the policy preflight. The backend still
        re-validates before queuing a payment.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3.5 py-3",
        result.risk === "HIGH"
          ? "border-[#F17676]/30 bg-[#F17676]/[0.05]"
          : result.risk === "MEDIUM"
            ? "border-[#E9B45E]/25 bg-[#E9B45E]/[0.04]"
            : "border-mint/20 bg-mint/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-sage">
          <ShieldCheck className="size-3 text-mint" /> Transaction Firewall
        </span>
        <StatusPill
          label={`${result.risk} · ${result.score}`}
          tone={
            result.risk === "HIGH" ? "danger" : result.risk === "MEDIUM" ? "warn" : "safe"
          }
          className="text-[8px]"
        />
      </div>
      <p className="mt-1.5 text-[10px] leading-5 text-sage">{result.summary}</p>
      <div className="mt-2 space-y-1">
        {result.checks.slice(0, 8).map((check) => (
          <p key={check.id} className="flex items-start gap-1.5 text-[9px] leading-4 text-sage">
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                check.status === "FAIL"
                  ? "bg-[#F17676]"
                  : check.status === "WARN"
                    ? "bg-[#E9B45E]"
                    : "bg-mint",
              )}
            />
            <span>
              <span className="text-ivory/85">{check.label}:</span> {check.detail}
            </span>
          </p>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-4 text-sage/70">
        {result.requiresGuardians
          ? `This will require ${guardianThreshold} guardian approvals and the saved delay.`
          : `This stays below the guardian threshold; the minimum ${result.delayMinutes}-minute delay still applies.`}
      </p>
      {result.evidence.length > 0 && (
        <p className="mt-2 font-mono text-[8px] leading-4 text-sage/55">
          {result.evidence.slice(0, 4).join(" · ")}
        </p>
      )}
    </div>
  );
}
