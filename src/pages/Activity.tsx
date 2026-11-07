import { useState } from "react";
import { Link } from "react-router";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Check,
  Clock3,
  FileSearch,
  Fingerprint,
  Loader2,
  Lock,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Siren,
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

const PROTOCOL = [
  {
    icon: Radar,
    title: "Detect",
    detail: "A decoy or monitor observation is recorded with evidence and a classification.",
  },
  {
    icon: ShieldAlert,
    title: "Verify",
    detail: "The signal is assessed. Detection alone never proves compromise or freezes a vault.",
  },
  {
    icon: Siren,
    title: "Respond",
    detail: "An authorized action is requested. Submission and on-chain confirmation are separate.",
  },
  {
    icon: Users,
    title: "Recover",
    detail: "Guardian quorum replaces a compromised signer after the contract delay.",
  },
];

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

  const openIncidents = (incidents ?? []).filter(
    (incident) => incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE",
  );
  const activeIncident = openIncidents[0];
  const filteredFeed = (feed ?? []).filter((item) => filter === "ALL" || item.kind === filter);
  const monitoring = monitoringCopy(log?.checkpoint?.health);
  const closedCount = (incidents?.length ?? 0) - openIncidents.length;

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Response Center"
          title="From detection to a confirmed response"
          description="Review the incident queue, inspect evidence, and see exactly which actions are recorded by NONCE versus confirmed by a wallet or contract. Pending, failed and simulated states are never softened into success."
          actions={
            <>
              <StatusPill
                label={openIncidents.length ? `${openIncidents.length} open` : "No open incidents"}
                tone={openIncidents.length ? "danger" : "safe"}
              />
              <StatusPill label={monitoring.label} tone={monitoring.tone} />
              <StatusPill label="Base Sepolia sandbox" tone="warn" />
            </>
          }
        />

        <section
          className={cn(
            "overflow-hidden rounded-2xl border bg-[#0b1f17]/75",
            activeIncident
              ? "border-[#E9B45E]/30"
              : "border-hairline/70",
          )}
        >
          <div className="grid gap-0 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Response status</SectionLabel>
                <StatusPill
                  label={activeIncident ? "Action required" : "Standby"}
                  tone={activeIncident ? "warn" : "safe"}
                />
                {activeIncident && (
                  <StatusPill
                    label={`${activeIncident.riskLevel} risk`}
                    tone={riskTone(activeIncident.riskLevel)}
                  />
                )}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ivory">
                {activeIncident ? activeIncident.title : "No active response is waiting"}
              </h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-6 text-sage">
                {activeIncident
                  ? activeIncident.responseStatus
                  : "Decoy and monitor records are still available below. A new incident appears here only after a signal is verified and classified."}
              </p>
              {activeIncident && (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Incident", value: activeIncident.reference },
                    { label: "Detected", value: formatDateTime(activeIncident.detectedAt) },
                    {
                      label: "Source",
                      value: activeIncident.decoyLabel
                        ? `Decoy · ${activeIncident.decoyLabel}`
                        : "Monitor observation",
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-hairline/50 bg-black/15 px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-sage">{item.label}</p>
                      <p className="mt-1 truncate text-[10px] text-ivory/90">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {activeIncident ? (
                  <Link
                    to={`/activity/${activeIncident._id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-mint px-4 text-[11px] font-semibold text-[#04241a] transition-colors hover:bg-mint-bright"
                  >
                    Review evidence <ArrowUpRight className="size-3.5" />
                  </Link>
                ) : (
                  <Link
                    to="/protection#decoys"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mint/25 bg-mint/[0.05] px-4 text-[11px] font-medium text-mint transition-colors hover:bg-mint/10"
                  >
                    Run a sandbox detection drill <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
                <Link
                  to="/protection#monitoring"
                  className="rounded-lg border border-hairline/70 px-3.5 py-2 text-[11px] text-sage transition-colors hover:border-mint/30 hover:text-ivory"
                >
                  Monitoring health
                </Link>
              </div>
            </div>

            <div className="border-t border-hairline/60 p-5 xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Response protocol</SectionLabel>
                <OpenCount open={openIncidents.length} closed={closedCount} />
              </div>
              <ol className="mt-3 space-y-3">
                {PROTOCOL.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-black/20 text-mint/80">
                      <step.icon className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-ivory">
                        <span className="mr-1.5 font-mono text-[9px] text-sage/70">0{index + 1}</span>
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-4 text-sage">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2 text-[9px] leading-4 text-sage">
                Incident classification lives in Convex. Vault freeze state, guardian approvals and
                confirmed transactions must come from the contract or a confirmed receipt.
              </p>
            </div>
          </div>
        </section>

        <Tabs defaultValue="incidents">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-lg border border-hairline/60 bg-black/20 p-1 sm:w-auto">
            <TabsTrigger value="incidents" className="rounded-md px-3 py-1.5 text-[11px]">
              Response queue ({openIncidents.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-md px-3 py-1.5 text-[11px]">
              Activity
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-md px-3 py-1.5 text-[11px]">
              Audit log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incidents" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
                <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-3.5">
                  <SectionLabel>Incident queue</SectionLabel>
                  <span className="text-[10px] text-sage">
                    {incidents?.length ?? 0} recorded · {openIncidents.length} open
                  </span>
                </div>
                {!incidents ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="size-4 animate-spin text-mint" />
                  </div>
                ) : incidents.length === 0 ? (
                  <EmptyState
                    icon={<Radar className="size-4" />}
                    title="No incidents recorded"
                    description="Incidents are created only when a verified signal crosses the risk threshold. Produce a sandbox signal from Protection to exercise the full classifier."
                    action={
                      <Link
                        to="/protection#decoys"
                        className="rounded-lg border border-hairline px-3 py-2 text-[11px] text-ivory hover:border-mint/30 hover:text-mint"
                      >
                        Produce a sandbox signal
                      </Link>
                    }
                    className="m-4 border-0 bg-transparent py-10"
                  />
                ) : (
                  <ul className="divide-y divide-hairline/40">
                    {incidents.map((incident) => {
                      const latestLockdown = incident.lockdownRequests[0];
                      const open =
                        incident.status !== "RESOLVED" && incident.status !== "FALSE_POSITIVE";
                      return (
                        <li key={incident._id}>
                          <Link
                            to={`/activity/${incident._id}`}
                            className="group block px-5 py-4 transition-colors hover:bg-white/[0.02]"
                          >
                            <div className="flex gap-3">
                              <span
                                className={cn(
                                  "mt-0.5 w-1 shrink-0 rounded-full",
                                  incident.riskLevel === "HIGH"
                                    ? "bg-[#EF7777]"
                                    : incident.riskLevel === "MEDIUM"
                                      ? "bg-[#E9B45E]"
                                      : "bg-sage/40",
                                )}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[10px] text-sage">
                                    {incident.reference}
                                  </span>
                                  <StatusPill
                                    label={incidentLabel(incident.status)}
                                    tone={incidentTone(incident.status)}
                                    className="text-[8px]"
                                  />
                                  <StatusPill
                                    label={`${incident.riskLevel} risk`}
                                    tone={riskTone(incident.riskLevel)}
                                    className="text-[8px]"
                                  />
                                  {open && (
                                    <span className="rounded-sm border border-[#E9B45E]/25 bg-[#E9B45E]/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-[#E9B45E]">
                                      Open
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-[13px] font-medium text-ivory">
                                  {incident.title}
                                </p>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-sage">
                                  {incident.summary}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-sage">
                                  <span>{formatDateTime(incident.detectedAt)}</span>
                                  <span>{incident.evidenceCount} evidence record(s)</span>
                                  {incident.decoyLabel && <span>Source · {incident.decoyLabel}</span>}
                                  {latestLockdown && (
                                    <span
                                      className={cn(
                                        "rounded-sm px-1.5 py-0.5 uppercase tracking-wider",
                                        latestLockdown.status === "CONFIRMED"
                                          ? "bg-[#EF7777]/10 text-[#EF7777]"
                                          : latestLockdown.status === "FAILED"
                                            ? "bg-[#EF7777]/10 text-[#EF7777]"
                                            : "bg-[#E9B45E]/10 text-[#E9B45E]",
                                      )}
                                    >
                                      Freeze {latestLockdown.status.toLowerCase()}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 flex items-start gap-1.5 text-[9px] leading-4 text-sage/90">
                                  <Clock3 className="mt-0.5 size-3 shrink-0" />
                                  {incident.responseStatus}
                                </p>
                              </div>
                              <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-sage transition-colors group-hover:text-mint" />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>Authority boundary</SectionLabel>
                    <Lock className="size-3.5 text-[#E9B45E]" />
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-sage">
                    Marking an incident reviewed does not unfreeze a vault. A sandbox freeze request
                    is recorded by NONCE; on testnet, the contract's monitor must sign the freeze
                    transaction from its own wallet.
                  </p>
                  <div className="mt-3 space-y-2">
                    {[
                      {
                        title: "Owner review",
                        detail: "Acknowledge and false-positive review are application records.",
                        icon: Check,
                      },
                      {
                        title: "Freeze",
                        detail: "Requires the monitor role on-chain; never auto-signed by the backend.",
                        icon: Siren,
                      },
                      {
                        title: "Recovery",
                        detail: "Requires the contract's guardian quorum and delay.",
                        icon: Users,
                      },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-2 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2">
                        <item.icon className="mt-0.5 size-3 shrink-0 text-mint/70" />
                        <div>
                          <p className="text-[10px] text-ivory">{item.title}</p>
                          <p className="mt-0.5 text-[9px] leading-4 text-sage">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/testnet"
                    className="mt-3 inline-flex items-center gap-1 text-[10px] text-mint hover:text-mint-bright"
                  >
                    Open testnet console <ArrowUpRight className="size-3" />
                  </Link>
                </div>

                <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
                  <SectionLabel>Service health</SectionLabel>
                  <p className="mt-2 text-[11px] text-ivory">{monitoring.label}</p>
                  <p className="mt-1 text-[10px] leading-5 text-sage">{monitoring.detail}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/50 pt-3 text-[9px] text-sage">
                    <span>Checkpoint</span>
                    <span className="font-mono text-ivory/80">
                      {log?.checkpoint?.lastProcessedBlock?.toLocaleString() ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-sage">
                    <span>Last run</span>
                    <span>{log?.checkpoint ? formatTime(log.checkpoint.lastProcessedAt) : "—"}</span>
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
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
                              ? "border-[#EF7777]/25 bg-[#EF7777]/10 text-[#EF7777]"
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
                              className="text-[8px]"
                            />
                            {item.simulated && (
                              <span className="rounded-sm border border-hairline px-1 py-0.5 text-[8px] uppercase tracking-wider text-sage">
                                simulated
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-sage">{item.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-sage/80">
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
                        {item.incidentId && <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-sage" />}
                      </div>
                    );
                    return (
                      <li key={item.id}>
                        {item.incidentId ? (
                          <Link
                            to={`/activity/${item.incidentId}`}
                            className="block transition-colors hover:bg-white/[0.02]"
                          >
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

          <TabsContent value="audit" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
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

              <div className="rounded-2xl border border-hairline/70 bg-[#0b1f17]/75 p-5">
                <div className="flex items-center justify-between">
                  <SectionLabel>Service health</SectionLabel>
                  <StatusPill label={monitoring.label} tone={monitoring.tone} />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-sage">{monitoring.detail}</p>
                <div className="mt-3 space-y-2">
                  {(log?.health ?? []).map((service) => (
                    <div
                      key={service._id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline/50 bg-black/15 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-[11px] text-ivory">{service.service}</p>
                        <p className="mt-0.5 text-[9px] text-sage">{service.detail}</p>
                      </div>
                      <StatusPill
                        label={service.status}
                        tone={
                          service.status === "ACTIVE"
                            ? "safe"
                            : service.status === "DEGRADED"
                              ? "warn"
                              : "danger"
                        }
                        className="text-[8px]"
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

function OpenCount({ open, closed }: { open: number; closed: number }) {
  return (
    <span className="text-[9px] text-sage">
      {open} open · {closed} closed
    </span>
  );
}
