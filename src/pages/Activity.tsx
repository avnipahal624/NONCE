import { useState } from "react";
import { Link } from "react-router";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  FileSearch,
  Fingerprint,
  Loader2,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { AppShell, NoVaultYet } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Address } from "@/components/nonce/Address";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatDateTime,
  formatTime,
  incidentLabel,
  incidentTone,
  monitoringCopy,
  riskTone,
  timeAgo,
} from "@/lib/nonce";

const FILTERS = [
  { id: "ALL", label: "Everything" },
  { id: "WITHDRAWAL", label: "Withdrawals" },
  { id: "INCIDENT", label: "Incidents" },
  { id: "RECOVERY", label: "Recovery" },
  { id: "GUARDIAN", label: "Guardians" },
];

const KIND_ICON = {
  WITHDRAWAL: ArrowUpRight,
  DEPOSIT: ActivityIcon,
  INCIDENT: ShieldAlert,
  RECOVERY: ShieldCheck,
  GUARDIAN: Users,
  SECURITY: Fingerprint,
} as const;

export default function ActivityPage() {
  const { workspace, isLoading } = useWorkspace();
  const incidents = useQuery(api.nonce.incidents.list);
  const feed = useQuery(api.nonce.activity.feed, { limit: 60 });
  const log = useQuery(api.nonce.activity.securityLog);
  const [filter, setFilter] = useState("ALL");

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-mint" />
        </div>
      </AppShell>
    );
  }

  if (!workspace?.vault) {
    return (
      <AppShell>
        <NoVaultYet />
      </AppShell>
    );
  }

  const openIncident = incidents?.find(
    (incident) => incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
  );
  const filteredFeed = (feed ?? []).filter((item) => filter === "ALL" || item.kind === filter);
  const monitoring = monitoringCopy(log?.checkpoint?.health);

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Activity"
          title="Everything that happened, with its real status"
          description="Withdrawals, decoy signals, lockdown attempts, guardian approvals and audit records share one timeline. Pending and failed states are never softened into success."
          actions={<StatusPill label="Append-only audit trail" tone="safe" />}
        />

        {openIncident && (
          <Link
            to={`/activity/${openIncident._id}`}
            className="flex flex-col gap-2 rounded-xl border border-[#E9B45E]/25 bg-[#E9B45E]/[0.05] px-4 py-3 transition-colors hover:border-[#E9B45E]/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#E9B45E]" />
              <div>
                <p className="text-[12px] font-medium text-ivory">
                  Open incident · {openIncident.reference} · {incidentLabel(openIncident.status)}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#E9B45E]/90">{openIncident.responseStatus}</p>
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-[#E9B45E]">Review evidence →</span>
          </Link>
        )}

        <Tabs defaultValue="timeline">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-lg border border-hairline/60 bg-black/20 p-1 sm:w-auto">
            <TabsTrigger value="timeline" className="rounded-md px-3 py-1.5 text-[11px]">
              Timeline
            </TabsTrigger>
            <TabsTrigger value="incidents" className="rounded-md px-3 py-1.5 text-[11px]">
              Incidents ({incidents?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-md px-3 py-1.5 text-[11px]">
              Audit log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline/60 px-4 py-3">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setFilter(entry.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] transition-colors",
                      filter === entry.id
                        ? "bg-mint/10 text-mint"
                        : "text-sage hover:bg-white/[0.03] hover:text-ivory",
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {!feed ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-4 animate-spin text-mint" />
                </div>
              ) : filteredFeed.length === 0 ? (
                <EmptyState
                  icon={<ActivityIcon className="size-4" />}
                  title="Nothing in this filter"
                  description="Activity appears here as soon as a deposit, withdrawal, signal or guardian action is recorded."
                  className="m-4 border-0 bg-transparent py-10"
                />
              ) : (
                <ul className="divide-y divide-hairline/40">
                  {filteredFeed.map((item) => {
                    const Icon = KIND_ICON[item.kind as keyof typeof KIND_ICON] ?? ActivityIcon;
                    const content = (
                      <div className="flex items-start gap-3.5 px-5 py-3.5">
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                            item.tone === "danger"
                              ? "border-[#F17676]/25 bg-[#F17676]/10 text-[#F17676]"
                              : item.tone === "warn"
                                ? "border-[#E9B45E]/25 bg-[#E9B45E]/10 text-[#E9B45E]"
                                : item.tone === "safe"
                                  ? "border-mint/25 bg-mint/10 text-mint"
                                  : "border-hairline bg-black/25 text-sage",
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[12px] font-medium text-ivory">{item.title}</p>
                            <StatusPill
                              label={item.status}
                              tone={
                                item.tone === "danger"
                                  ? "danger"
                                  : item.tone === "warn"
                                    ? "warn"
                                    : item.tone === "safe"
                                      ? "safe"
                                      : "neutral"
                              }
                              className="text-[9px]"
                            />
                            {item.simulated && (
                              <span className="rounded-sm border border-hairline px-1 py-0.5 text-[8px] uppercase tracking-wider text-sage">
                                simulated
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-sage">{item.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-sage/80">
                            <span>{timeAgo(item.timestamp)}</span>
                            <span>{formatDateTime(item.timestamp)}</span>
                            {item.amount && (
                              <span className="font-tabular text-ivory/70">
                                {formatAmount(item.amount)} {item.symbol}
                              </span>
                            )}
                            {item.simulationRef && <span className="font-mono">{item.simulationRef}</span>}
                          </div>
                        </div>
                        {item.incidentId && (
                          <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-sage" />
                        )}
                      </div>
                    );
                    return (
                      <li key={item.id}>
                        {item.incidentId ? (
                          <Link to={`/activity/${item.incidentId}`} className="block transition-colors hover:bg-white/[0.02]">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="incidents" className="mt-4">
            {!incidents || incidents.length === 0 ? (
              <EmptyState
                icon={<Radar className="size-4" />}
                title="No incidents recorded"
                description="Incidents are created only when a verified signal crosses the risk threshold. You can produce a sandbox signal from Protection."
                action={
                  <Link
                    to="/protection#decoys"
                    className="rounded-lg border border-hairline px-3 py-2 text-[11px] text-ivory hover:border-mint/30 hover:text-mint"
                  >
                    Produce a sandbox signal
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {incidents.map((incident) => {
                  const latestLockdown = incident.lockdownRequests[0];
                  return (
                    <li key={incident._id}>
                      <Link
                        to={`/activity/${incident._id}`}
                        className="block rounded-xl border border-hairline/70 bg-[#0b1c16]/80 p-4 transition-colors hover:border-mint/25"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] text-sage">{incident.reference}</span>
                              <StatusPill
                                label={incidentLabel(incident.status)}
                                tone={incidentTone(incident.status)}
                                className="text-[9px]"
                              />
                              <StatusPill
                                label={`${incident.riskLevel} risk`}
                                tone={riskTone(incident.riskLevel)}
                                className="text-[9px]"
                              />
                            </div>
                            <p className="mt-2 text-[13px] text-ivory">{incident.title}</p>
                            <p className="mt-1 text-[11px] leading-5 text-sage">{incident.summary}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-sage">
                              <span>{formatDateTime(incident.detectedAt)}</span>
                              <span>{incident.evidenceCount} evidence records</span>
                              {incident.decoyLabel && <span>Decoy · {incident.decoyLabel}</span>}
                              {latestLockdown && (
                                <span
                                  className={cn(
                                    "rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                                    latestLockdown.status === "CONFIRMED"
                                      ? "bg-[#F17676]/10 text-[#F17676]"
                                      : latestLockdown.status === "FAILED"
                                        ? "bg-[#F17676]/10 text-[#F17676]"
                                        : "bg-[#E9B45E]/10 text-[#E9B45E]",
                                  )}
                                >
                                  Lockdown {latestLockdown.status.toLowerCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-mint">
                            Evidence <ArrowUpRight className="size-3" />
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80">
                <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                  <SectionLabel>Audit events</SectionLabel>
                  <span className="text-[10px] text-sage">{log?.events.length ?? 0} records</span>
                </div>
                {!log || log.events.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[11px] text-sage">
                    No audit events yet. Configuration changes and security actions are recorded here.
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline/40">
                    {log.events.map((event) => (
                      <li key={event._id} className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-mint/80">{event.action}</span>
                          <span className="text-[9px] text-sage">{formatDateTime(event.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-sage">{event.detail}</p>
                        {event.actorAddress && (
                          <div className="mt-1">
                            <Address value={event.actorAddress} lead={6} tail={4} className="text-[10px]" />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-5">
                <div className="flex items-center justify-between">
                  <SectionLabel>Service health</SectionLabel>
                  <StatusPill label={monitoring.label} tone={monitoring.tone} />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-sage">{monitoring.detail}</p>
                <div className="mt-3 space-y-2">
                  {(log?.health ?? []).map((service) => (
                    <div
                      key={service._id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-[11px] text-ivory">{service.service}</p>
                        <p className="mt-0.5 text-[9px] text-sage">{service.detail}</p>
                      </div>
                      <StatusPill
                        label={service.status}
                        tone={service.status === "ACTIVE" ? "safe" : service.status === "DEGRADED" ? "warn" : "danger"}
                        className="text-[9px]"
                      />
                    </div>
                  ))}
                  {(!log?.health || log.health.length === 0) && (
                    <p className="text-[10px] text-sage">No service records are available.</p>
                  )}
                </div>
                <div className="mt-4 border-t border-hairline/50 pt-3 text-[10px] leading-5 text-sage">
                  <p className="flex items-center gap-1.5">
                    <FileSearch className="size-3 text-mint/70" /> Checkpoint{" "}
                    {log?.checkpoint?.lastProcessedBlock?.toLocaleString() ?? "—"} ·{" "}
                    {log?.checkpoint ? formatTime(log.checkpoint.lastProcessedAt) : "no run recorded"}
                  </p>
                  <p className="mt-1">Audit records are append-only from the application's perspective.</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
