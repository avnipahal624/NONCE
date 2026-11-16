import { Link } from "react-router";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  Download,
  FileText,
  LockKeyhole,
  ShieldAlert,
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
import { timeAgo } from "@/lib/nonce";
import type { CopilotBrief, FirewallRisk } from "@/lib/intelligence";

const RISK_TONE: Record<FirewallRisk, "danger" | "warn" | "safe"> = {
  HIGH: "danger",
  MEDIUM: "warn",
  LOW: "safe",
};

function downloadReport(brief: CopilotBrief) {
  const sections = brief.report.sections.map(
    (section) =>
      `## ${section.heading}\n\n${section.body}\n\nEvidence: ${section.evidenceRefs.join(", ")}`,
  );
  const markdown = [
    `# ${brief.report.title}`,
    `Generated: ${new Date(brief.report.generatedAt).toISOString()}`,
    `Risk: ${brief.risk}`,
    brief.report.disclaimer,
    ...sections,
  ].join("\n\n");
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nonce-security-brief-${new Date(brief.generatedAt)
    .toISOString()
    .slice(0, 10)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5",
        className,
      )}
    >
      <SectionLabel>{eyebrow ?? title}</SectionLabel>
      {eyebrow && <h2 className="mt-1 text-[15px] font-medium text-ivory">{title}</h2>}
      {children}
    </section>
  );
}

export default function Copilot() {
  const copilot = useQuery(api.nonce.intelligence.copilot);

  if (copilot === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72 bg-white/[0.06]" />
          <Skeleton className="h-40 w-full bg-white/[0.04]" />
          <Skeleton className="h-64 w-full bg-white/[0.04]" />
        </div>
      </AppShell>
    );
  }

  if (!copilot?.configured) {
    return (
      <AppShell>
        <NoVaultYet />
      </AppShell>
    );
  }

  const { brief, scope } = copilot;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="AI Security Copilot"
          title="Explainable security intelligence"
          description="A scoped, evidence-grounded explanation of your vault, policy, guardians, monitoring and incidents. It cannot sign, freeze, approve recovery or change policy."
          actions={
            <Button
              onClick={() => downloadReport(brief)}
              variant="outline"
              className="h-9 gap-2 rounded-lg border-hairline bg-black/20 text-xs"
            >
              <Download className="size-3.5" /> Export brief
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-mint/20 bg-mint/[0.04] px-4 py-3 text-[11px] leading-5 text-sage">
          <StatusPill label="Local rules engine" tone="safe" icon={<Sparkles className="size-3" />} />
          <span>
            No external model or paid AI service is connected. Only the fields listed below are
            used; email, session tokens, keys, seed phrases and RPC credentials are excluded.
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-hairline/70 bg-[linear-gradient(145deg,#0d2a20,#091a14)] p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Current risk</SectionLabel>
              <ShieldAlert className="size-4 text-sage" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-ivory">{brief.risk}</p>
            <p className="mt-1 text-[11px] leading-5 text-sage">{brief.headline}</p>
            <StatusPill
              className="mt-3"
              label={`${brief.findings.length} finding(s)`}
              tone={RISK_TONE[brief.risk]}
            />
          </div>
          <div className="rounded-2xl border border-hairline/70 bg-[linear-gradient(145deg,#0d2a20,#091a14)] p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Posture</SectionLabel>
              <ShieldCheck className="size-4 text-mint" />
            </div>
            <p className="mt-3 text-[13px] leading-6 text-ivory">{brief.postureSummary}</p>
            <p className="mt-3 text-[10px] text-sage">{brief.disclaimer}</p>
          </div>
          <div className="rounded-2xl border border-hairline/70 bg-[linear-gradient(145deg,#0d2a20,#091a14)] p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Authority boundary</SectionLabel>
              <LockKeyhole className="size-4 text-[#E9B45E]" />
            </div>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-sage">
              <li>No transaction signing</li>
              <li>No autonomous freeze</li>
              <li>No recovery or policy approval</li>
              <li>Human wallet action remains required</li>
            </ul>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <Panel title="Findings" eyebrow="What the evidence says">
            <div className="mt-4 divide-y divide-hairline/50">
              {brief.findings.map((finding) => (
                <article key={finding.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      label={finding.severity}
                      tone={RISK_TONE[finding.severity]}
                      className="text-[9px]"
                    />
                    <h3 className="text-[12px] font-medium text-ivory">{finding.title}</h3>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-sage">{finding.explanation}</p>
                  {finding.action && (
                    <p className="mt-1 text-[10px] leading-5 text-mint/90">{finding.action}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {finding.evidenceRefs.map((ref) => (
                      <span
                        key={ref}
                        className="rounded border border-hairline/60 bg-black/20 px-1.5 py-0.5 font-mono text-[8px] text-sage"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Recommended actions" eyebrow="Human decisions">
            <div className="mt-4 space-y-3">
              {brief.recommendations.length === 0 ? (
                <p className="text-[11px] leading-5 text-sage">
                  No additional action is proposed by the local rules engine. This is not a
                  guarantee of safety.
                </p>
              ) : (
                brief.recommendations.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-hairline/60 bg-black/20 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-ivory">{item.title}</p>
                      <StatusPill
                        label={item.priority}
                        tone={item.priority === "NOW" ? "warn" : "neutral"}
                        className="text-[8px]"
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] leading-4 text-sage">{item.why}</p>
                    <p className="mt-1.5 text-[10px] leading-4 text-mint/80">{item.action}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Incident summaries" eyebrow="Threat correlation">
            {brief.incidentSummaries.length === 0 ? (
              <p className="mt-4 text-[11px] leading-5 text-sage">
                No incidents are in the scoped backend context.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {brief.incidentSummaries.map((incident) => (
                  <div
                    key={incident.reference}
                    className="rounded-xl border border-hairline/60 bg-black/20 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[10px] text-ivory">{incident.reference}</p>
                      <StatusPill
                        label={incident.risk}
                        tone={RISK_TONE[incident.risk as FirewallRisk] ?? "neutral"}
                        className="text-[8px]"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-sage">{incident.summary}</p>
                    <p className="mt-1 text-[10px] text-sage/70">
                      {incident.evidenceRefs.join(" · ")}
                    </p>
                    <Button asChild variant="ghost" className="mt-2 h-7 px-0 text-[10px] text-mint">
                      <Link to={`/activity/${incident.id}`}>
                        Open response center <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recovery guidance" eyebrow="If the signer is compromised">
            <ol className="mt-4 space-y-3">
              {brief.recoveryGuidance.map((step, index) => (
                <li key={step} className="flex gap-3 text-[11px] leading-5 text-sage">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-mint/20 bg-mint/[0.06] font-mono text-[9px] text-mint">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel title="Scope and coverage" eyebrow="What is actually connected">
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {brief.coverage.map((item) => (
              <div
                key={item.area}
                className="rounded-lg border border-hairline/50 bg-black/20 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ivory">{item.area}</p>
                  <StatusPill
                    label={item.status}
                    tone={
                      item.status === "VERIFIED"
                        ? "safe"
                        : item.status === "SANDBOX"
                          ? "warn"
                          : "neutral"
                    }
                    className="text-[8px]"
                  />
                </div>
                <p className="mt-1 text-[10px] leading-4 text-sage">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 rounded-xl border border-hairline/60 bg-black/20 p-3.5 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-sage">
                <FileText className="size-3" /> Fields used
              </p>
              <p className="mt-1.5 text-[10px] leading-5 text-sage">{scope.fields.join(" · ")}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-sage">
                <Activity className="size-3" /> Excluded
              </p>
              <p className="mt-1.5 text-[10px] leading-5 text-sage">{scope.excluded.join(" · ")}</p>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-sage/70">
            Last context generated {timeAgo(brief.generatedAt)}. Expand-only disclosure: select a
            section above to review the evidence-backed explanation.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
