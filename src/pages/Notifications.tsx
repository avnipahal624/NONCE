import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/nonce/AppShell";
import { EmptyState, PageHeader, SectionLabel } from "@/components/nonce/PageHeader";
import { StatusPill } from "@/components/nonce/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/nonce";

type Filter = "ALL" | "UNREAD" | "CRITICAL";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "UNREAD", label: "Unread" },
  { id: "CRITICAL", label: "Critical" },
];

function severityTone(severity: string): "danger" | "warn" | "safe" | "neutral" {
  return severity === "CRITICAL"
    ? "danger"
    : severity === "WARNING"
      ? "warn"
      : severity === "SUCCESS"
        ? "safe"
        : "neutral";
}

export default function Notifications() {
  const data = useQuery(api.nonce.notifications.list);
  const markRead = useMutation(api.nonce.notifications.markRead);
  const markAllRead = useMutation(api.nonce.notifications.markAllRead);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.notifications.filter((notification) => {
      if (filter === "UNREAD" && notification.readAt) return false;
      if (filter === "CRITICAL" && notification.severity !== "CRITICAL") return false;
      if (!needle) return true;
      return [notification.title, notification.body, notification.category]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, filter, query]);

  if (data === undefined) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72 bg-white/[0.06]" />
          <Skeleton className="h-64 w-full bg-white/[0.04]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Notification Center"
          title="What needs your attention"
          description="In-app security events, withdrawal notices and guardian actions. External email, SMS and push delivery are not connected in this workspace."
          actions={
            <Button
              onClick={async () => {
                setBusy(true);
                try {
                  await markAllRead({});
                } finally {
                  setBusy(false);
                }
              }}
              disabled={!data.unread || busy}
              variant="outline"
              className="h-9 gap-2 rounded-lg border-hairline bg-black/20 text-xs"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline/60 bg-black/15 px-4 py-3">
          <div className="flex items-center gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setFilter(entry.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[10px] transition-colors",
                  filter === entry.id
                    ? "border-mint/30 bg-mint/[0.08] text-mint"
                    : "border-hairline bg-black/20 text-sage hover:text-ivory",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-sage" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notifications…"
              aria-label="Search notifications"
              className="h-9 border-hairline bg-black/25 pl-9 text-[11px]"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <SectionLabel>
            {filtered.length} notification{filtered.length === 1 ? "" : "s"} ·{" "}
            {data.unread} unread
          </SectionLabel>
          <StatusPill label="In-app delivery" tone="neutral" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-5" />}
            title="No notifications match"
            description="Security events and guardian actions appear here. This build has no external email, SMS or push delivery provider."
          />
        ) : (
          <div className="divide-y divide-hairline/50 overflow-hidden rounded-2xl border border-hairline/70 bg-[#0b1f17]/75">
            {filtered.map((notification) => (
              <article
                key={notification._id}
                className={cn(
                  "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between",
                  notification.readAt ? "opacity-65" : "bg-white/[0.012]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      label={notification.severity}
                      tone={severityTone(notification.severity)}
                      className="text-[8px]"
                    />
                    <p className="text-[12px] font-medium text-ivory">{notification.title}</p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-sage">{notification.body}</p>
                  <p className="mt-1.5 text-[9px] text-sage/70">
                    {notification.category} · {formatDateTime(notification.createdAt)} ·{" "}
                    {notification.channel === "IN_APP" ? "delivered in-app" : "external channel"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[9px] text-sage/60">{timeAgo(notification.createdAt)}</span>
                  {!notification.readAt && (
                    <Button
                      onClick={() => void markRead({ notificationId: notification._id })}
                      variant="ghost"
                      className="h-7 px-2 text-[9px] text-mint"
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-[#E9B45E]/20 bg-[#E9B45E]/[0.04] px-4 py-3 text-[10px] leading-5 text-sage">
          Critical in-app alerts are not hidden by quiet hours. Email, SMS and push delivery are
          unavailable until an approved provider, retry policy and delivery-receipt path exist.
        </div>
      </div>
    </AppShell>
  );
}
