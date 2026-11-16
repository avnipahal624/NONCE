import { useState } from "react";
import { useQuery } from "convex/react";
import {
  BadgeCheck,
  Check,
  Copy,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/nonce";

const STATUS_TONE = {
  VERIFIED: "safe",
  SANDBOX: "warn",
  INCOMPLETE: "warn",
  AT_RISK: "danger",
} as const;

export default function Passport() {
  const result = useQuery(api.nonce.intelligence.securityPassport);
  const [copied, setCopied] = useState(false);

  if (result === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72 bg-white/[0.06]" />
          <Skeleton className="h-[420px] w-full bg-white/[0.04]" />
        </div>
      </AppShell>
    );
  }

  if (!result?.configured) {
    return (
      <AppShell>
        <NoVaultYet />
      </AppShell>
    );
  }

  const { passport, contract } = result;

  const copyShare = async () => {
    const text = [
      "NONCE Security Passport",
      passport.label,
      `Network: ${passport.network}`,
      `Holder: ${passport.holderMasked}`,
      `Contract version: ${passport.contractVersion}`,
      `Deployment: ${passport.deploymentLabel}`,
      "This is a scoped backend summary, not an independent certification.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Security Passport"
          title="Your protection, evidenced"
          description="A privacy-safe identity card derived from scoped backend records and contract status. It is not a certification and never upgrades a sandbox or unverified deployment."
          actions={
            <Button
              onClick={() => void copyShare()}
              variant="outline"
              className="h-9 gap-2 rounded-lg border-hairline bg-black/20 text-xs"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy share text"}
            </Button>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="group relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,rgba(131,196,179,0.16),transparent_55%)] blur-2xl transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none" />
            <section className="relative overflow-hidden rounded-[1.75rem] border border-mint/20 bg-[linear-gradient(125deg,#0a2118_0%,#103b35_48%,#071713_100%)] p-1 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[-0.4deg] motion-reduce:transform-none">
              <div className="nonce-shell-grid relative overflow-hidden rounded-[1.45rem] border border-white/[0.07] p-6 sm:p-8">
                <div className="absolute right-[-15%] top-[-20%] size-64 rounded-full border border-mint/10 bg-[radial-gradient(circle,rgba(131,196,179,0.18),transparent_68%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.28em] text-mint/75">
                      <Sparkles className="size-3" /> NONCE Security Passport
                    </p>
                    <h2 className="mt-4 max-w-sm text-2xl font-semibold leading-tight tracking-tight text-ivory sm:text-[30px]">
                      {passport.label}
                    </h2>
                    <p className="mt-2 font-mono text-[10px] text-sage">
                      {passport.holderMasked} · {passport.network}
                    </p>
                  </div>
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-mint/30 bg-mint/[0.08] text-mint shadow-[inset_0_0_20px_rgba(131,196,179,0.12)]">
                    <Fingerprint className="size-7" />
                  </div>
                </div>

                <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.18em] text-sage/70">Status</p>
                    <StatusPill
                      label={passport.status}
                      tone={STATUS_TONE[passport.status]}
                      className="mt-1.5 text-[8px]"
                    />
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.18em] text-sage/70">Coverage</p>
                    <p className="mt-1 font-tabular text-lg font-semibold text-ivory">
                      {passport.score}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.18em] text-sage/70">Version</p>
                    <p className="mt-1 text-[10px] text-ivory">{passport.contractVersion}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.18em] text-sage/70">Deployment</p>
                    <p className="mt-1 text-[10px] text-ivory">{passport.deploymentLabel}</p>
                  </div>
                </div>

                <div className="relative mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-4">
                  <p className="flex items-center gap-1.5 text-[9px] text-sage">
                    <BadgeCheck className="size-3 text-mint/80" />
                    Backend evidence · last sync {formatDateTime(passport.lastSyncedAt)}
                  </p>
                  <p className="font-mono text-[8px] text-sage/60">
                    {contract.maskedAddress ?? "No contract address configured"}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Verification checklist</SectionLabel>
              <LockKeyhole className="size-3.5 text-sage" />
            </div>
            <div className="mt-4 divide-y divide-hairline/50">
              {passport.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      check.status === "PASS"
                        ? "border-mint/30 bg-mint/10 text-mint"
                        : check.status === "WARN"
                          ? "border-[#E9B45E]/30 bg-[#E9B45E]/10 text-[#E9B45E]"
                          : "border-[#EF7777]/30 bg-[#EF7777]/10 text-[#EF7777]",
                    )}
                  >
                    {check.status === "PASS" ? (
                      <Check className="size-2.5" />
                    ) : (
                      <span className="size-1 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-ivory">{check.label}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-sage">{check.detail}</p>
                  </div>
                  <StatusPill
                    label={check.status}
                    tone={check.status === "PASS" ? "safe" : check.status === "WARN" ? "warn" : "danger"}
                    className="ml-auto shrink-0 text-[8px]"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <SectionLabel>Milestones</SectionLabel>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {passport.milestones.map((milestone) => (
                <div
                  key={milestone.label}
                  className="rounded-lg border border-hairline/50 bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-ivory">{milestone.label}</p>
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        milestone.complete ? "bg-mint" : "bg-[#E9B45E]",
                      )}
                      aria-label={milestone.complete ? "Complete" : "Incomplete"}
                    />
                  </div>
                  <p className="mt-1 text-[9px] text-sage">{milestone.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
            <SectionLabel>Protection coverage</SectionLabel>
            <div className="mt-4 space-y-2">
              {passport.coverage.map((item) => (
                <div key={item.area} className="flex items-start justify-between gap-3 border-b border-hairline/40 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-[11px] text-ivory">{item.area}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-sage">{item.detail}</p>
                  </div>
                  <StatusPill
                    label={item.status}
                    tone={
                      item.status === "VERIFIED"
                        ? "safe"
                        : item.status === "SANDBOX"
                          ? "warn"
                          : "neutral"
                    }
                    className="shrink-0 text-[8px]"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[#E9B45E]/20 bg-[#E9B45E]/[0.04] px-4 py-3 text-[10px] leading-5 text-sage">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#E9B45E]" />
          {passport.disclaimer}
        </div>
      </div>
    </AppShell>
  );
}
