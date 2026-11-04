import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  Activity,
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Vault,
  Wallet,
} from "lucide-react";
import { Logo } from "./Logo";
import { Address } from "./Address";
import { StatusPill } from "./StatusPill";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { greeting, protectionTone, timeAgo, truncateMiddle } from "@/lib/nonce";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { label: "Home", to: "/dashboard", icon: LayoutDashboard },
  { label: "My Vault", to: "/vault", icon: Vault },
  { label: "Protection", to: "/protection", icon: ShieldCheck },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Recovery", to: "/recovery", icon: Users },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];

const MOBILE_NAV = NAV.filter((item) => item.to !== "/settings");

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { workspace, isLoading } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const accountName =
    workspace?.account.displayName ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Vault owner";

  const protection = workspace?.protection;
  const tone = protectionTone(protection?.level ?? "UNCONFIGURED");
  const isDemo = workspace?.vault?.mode === "DEMO" || !workspace?.vault;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const activeLabel = NAV.find((item) => location.pathname.startsWith(item.to))?.label;

  return (
    <div className="min-h-screen bg-abyss text-ivory">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-hairline/60 bg-[#081713] lg:flex">
        <div className="flex h-[76px] shrink-0 items-center border-b border-hairline/50 px-6">
          <Logo to="/dashboard" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Vault navigation">
          <p className="px-3 pb-2 text-[9px] font-medium uppercase tracking-[0.22em] text-sage/70">
            Vault workspace
          </p>
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-all",
                      isActive
                        ? "bg-mint/[0.09] text-ivory ring-1 ring-inset ring-mint/20"
                        : "text-sage hover:bg-white/[0.03] hover:text-ivory",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "size-[17px]",
                          isActive ? "text-mint" : "text-sage group-hover:text-ivory/80",
                        )}
                      />
                      {item.label}
                      {item.to === "/protection" &&
                        workspace?.activeIncident && (
                          <span className="ml-auto size-1.5 rounded-full bg-[#F17676]" aria-label="Open incident" />
                        )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-hairline/50 p-4">
          <div className="rounded-xl border border-hairline/70 bg-black/25 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-mint/20 bg-mint/10">
                {isLoading ? (
                  <Loader2 className="size-3 animate-spin text-mint" />
                ) : (
                  <ShieldCheck className="size-3 text-mint" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-ivory">
                  {isLoading ? "Checking protection" : protection?.label ?? "Not configured"}
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-sage">
                  {workspace?.vault
                    ? "Demo environment · simulated safeguards"
                    : "Create a sandbox vault to begin."}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  tone === "safe" ? "bg-mint" : tone === "danger" ? "bg-[#F17676]" : "bg-[#E9B45E]",
                )}
                style={{ width: `${protection?.score ?? 0}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-[0.16em] text-sage">Coverage</span>
              <span className="font-tabular text-[10px] text-sage">{protection?.score ?? 0}%</span>
            </div>
          </div>

          <Link
            to={workspace?.vault ? "/protection" : "/onboarding"}
            className="flex items-center justify-between rounded-lg border border-hairline/50 px-3 py-2.5 text-[11px] text-sage transition-colors hover:border-mint/30 hover:text-mint"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5" />
              {workspace?.vault ? "Review safeguards" : "Start onboarding"}
            </span>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-hairline/60 bg-[#071310]/90 backdrop-blur-xl">
          <div className="flex h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo to="/dashboard" tagline={false} />
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-[15px] font-medium text-ivory">
                  {location.pathname === "/dashboard"
                    ? `${greeting()}, ${accountName}`
                    : activeLabel ?? "NONCE"}
                </p>
                <p className="truncate text-[11px] text-sage">
                  {location.pathname === "/dashboard"
                    ? workspace?.vault?.mode === "DEMO"
                      ? "Sandbox vault · simulated execution only"
                      : "Your digital assets are monitored by NONCE."
                    : "Self-custodial vault workspace"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-hairline/80 bg-black/25 px-3 py-1.5 sm:flex">
                <span className="flex size-4 items-center justify-center rounded-full bg-[#79A9E8]/15">
                  <span className="size-1.5 rounded-full bg-[#79A9E8]" />
                </span>
                <span className="text-[11px] text-ivory/90">Base Sepolia</span>
                {isDemo && (
                  <span className="rounded-sm border border-[#E9B45E]/30 bg-[#E9B45E]/10 px-1 py-0.5 text-[8px] uppercase tracking-wider text-[#E9B45E]">
                    demo
                  </span>
                )}
              </div>

              <NotificationsPopover />
              <AccountMenu
                name={accountName}
                email={workspace?.account.email ?? user?.email ?? null}
                wallet={workspace?.wallet?.address ?? null}
                verification={workspace?.wallet?.verification ?? null}
                onSignOut={handleSignOut}
              />
            </div>
          </div>

          {isDemo && (
            <div className="border-t border-[#E9B45E]/15 bg-[#E9B45E]/[0.05]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-[10px] text-[#E9B45E]/90 sm:px-6 lg:px-8">
                <span className="rounded-sm border border-[#E9B45E]/30 px-1.5 py-0.5 font-medium uppercase tracking-wider">
                  Demo environment
                </span>
                <span>
                  Balances, transfers, monitoring and lockdown execution are simulated. No
                  on-chain transaction is submitted and no real funds are involved.
                </span>
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline/70 bg-[#081713]/95 backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        <ul className="flex items-stretch justify-around px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5">
          {MOBILE_NAV.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[9px] transition-colors",
                    isActive ? "text-mint" : "text-sage hover:text-ivory",
                  )
                }
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NotificationsPopover() {
  const data = useQuery(api.nonce.notifications.list);
  const markAllRead = useMutation(api.nonce.notifications.markAllRead);
  const [busy, setBusy] = useState(false);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`}
          className="relative flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-black/20 text-sage transition-colors hover:border-mint/30 hover:text-ivory"
        >
          <Bell className="size-4" />
          {Boolean(data?.unread) && (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-mint ring-2 ring-[#071310]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(92vw,360px)] border-hairline bg-[#0b1c16] p-0"
      >
        <div className="flex items-center justify-between border-b border-hairline/70 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-ivory">Notifications</p>
            <p className="text-[10px] text-sage">
              {data?.unread ?? 0} unread · in-app only
            </p>
          </div>
          <button
            type="button"
            disabled={!data?.unread || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await markAllRead({});
              } finally {
                setBusy(false);
              }
            }}
            className="text-[10px] text-mint disabled:text-sage/50"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {!data || data.notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-sage">
              No notifications yet. Security events and guardian approvals appear here.
            </p>
          ) : (
            <ul className="divide-y divide-hairline/40">
              {data.notifications.slice(0, 12).map((notification) => (
                <li
                  key={notification._id}
                  className={cn(
                    "px-4 py-3",
                    notification.readAt ? "opacity-60" : "bg-white/[0.015]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium text-ivory">{notification.title}</p>
                    <span className="shrink-0 text-[9px] text-sage">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-sage">{notification.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-hairline/70 px-4 py-2.5">
          <Link to="/activity" className="text-[10px] text-mint hover:text-mint-bright">
            Open incident center →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu({
  name,
  email,
  wallet,
  verification,
  onSignOut,
}: {
  name: string;
  email: string | null;
  wallet: string | null;
  verification: string | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-hairline/80 bg-black/20 py-1 pl-1 pr-2 text-left transition-colors hover:border-mint/30"
          aria-label="Account menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-mint/15 text-[11px] font-semibold uppercase text-mint">
            {name.slice(0, 1)}
          </span>
          <ChevronDown className="hidden size-3 text-sage sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-hairline bg-[#0b1c16]">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs font-medium text-ivory">{name}</p>
          <p className="mt-0.5 truncate text-[10px] text-sage">{email ?? "Sandbox account"}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-hairline/60" />
        <div className="px-2 py-2">
          <p className="text-[9px] uppercase tracking-[0.16em] text-sage">Vault signer</p>
          {wallet ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <Address value={wallet} lead={5} tail={4} />
              <StatusPill
                label={verification === "SIGNATURE" ? "Verified" : "Demo"}
                tone={verification === "SIGNATURE" ? "safe" : "warn"}
              />
            </div>
          ) : (
            <Link to="/onboarding" className="mt-1 text-[11px] text-mint">
              Attach a wallet →
            </Link>
          )}
        </div>
        <DropdownMenuSeparator className="bg-hairline/60" />
        <DropdownMenuItem asChild>
          <Link to="/vault" className="flex items-center gap-2 text-xs">
            <Wallet className="size-3.5" /> My vault
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center gap-2 text-xs">
            <SettingsIcon className="size-3.5" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-hairline/60" />
        <DropdownMenuItem
          onClick={() => void onSignOut()}
          className="flex items-center gap-2 text-xs text-[#F17676] focus:text-[#F17676]"
        >
          <LogOut className="size-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NoVaultYet() {
  return (
    <div className="rounded-2xl border border-hairline/70 bg-[#0b1c16]/70 p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-mint/20 bg-mint/[0.07] text-mint">
        <Vault className="size-5" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-ivory">No vault on this account yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-sage">
        Protection status stays incomplete until a vault, withdrawal policy, three guardians
        and decoy monitoring exist. The onboarding flow walks through each one.
      </p>
      <Button asChild className="mt-6 h-10 rounded-full bg-mint px-6 text-[#04241a] hover:bg-mint-bright">
        <Link to="/onboarding">Create a sandbox vault</Link>
      </Button>
    </div>
  );
}

export function truncateAddress(value: string | null | undefined) {
  return truncateMiddle(value, 5, 4);
}
