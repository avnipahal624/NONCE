import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const NAV = [
  { label: "How it works", to: "/how-it-works" },
  { label: "Security", to: "/security" },
  { label: "Features", to: "/features" },
  { label: "FAQ", to: "/faq" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-hairline/60 bg-[#071310]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-4 py-2 text-[13px] transition-colors",
                  isActive || location.pathname === item.to
                    ? "bg-white/[0.05] text-ivory"
                    : "text-sage hover:bg-white/[0.03] hover:text-ivory",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <Button
            asChild
            variant="ghost"
            className="h-9 rounded-full px-4 text-[13px] text-sage hover:bg-white/[0.04] hover:text-ivory"
          >
            <Link to="/auth">{isAuthenticated ? "Open app" : "Sign in"}</Link>
          </Button>
          <Button
            asChild
            className="h-9 rounded-full bg-mint px-4 text-[13px] font-semibold text-[#04241a] hover:bg-mint-bright"
          >
            <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fonboarding"}>
              {isAuthenticated ? "Dashboard" : "Launch app"}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        <button
          type="button"
          className="rounded-lg border border-hairline p-2 text-ivory sm:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <motion.div
          id="mobile-nav"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-hairline/60 bg-[#071310] px-5 pb-6 pt-4 sm:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm text-sage hover:bg-white/[0.04] hover:text-ivory"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2">
            <Button asChild className="h-10 rounded-lg bg-mint text-[#04241a] hover:bg-mint-bright">
              <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fonboarding"}>
                {isAuthenticated ? "Open dashboard" : "Launch app"}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-lg border-hairline bg-transparent">
              <Link to="/auth">{isAuthenticated ? "Switch account" : "Sign in"}</Link>
            </Button>
          </div>
        </motion.div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-hairline/60 bg-[#06110e]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-sm text-sm leading-6 text-sage">
            A self-custodial vault that separates what you protect from what
            attackers can find. Detect the breach. Defend the vault.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#E9B45E]/25 bg-[#E9B45E]/[0.06] px-3 py-1.5 text-[11px] text-[#E9B45E]">
            Sandbox preview · no mainnet deployment · no real funds
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sage">Product</p>
          <ul className="mt-4 space-y-3 text-sm text-ivory/80">
            <li><Link className="hover:text-mint" to="/how-it-works">How NONCE works</Link></li>
            <li><Link className="hover:text-mint" to="/security">Security architecture</Link></li>
            <li><Link className="hover:text-mint" to="/features">Features</Link></li>
            <li><Link className="hover:text-mint" to="/faq">FAQ</Link></li>
            <li><Link className="hover:text-mint" to="/dashboard">Launch app</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sage">Honest by design</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ivory/80">
            <li>Blockchain transactions are irreversible. NONCE never claims to reverse them.</li>
            <li>Decoy sensors raise evidence, not proof of theft.</li>
            <li>Nothing here is audited, insured, or a guarantee of safety.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-hairline/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 py-6 text-[11px] text-sage/80 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} NONCE. Demonstration software, provided as-is.</p>
          <p>Self-custody means you keep responsibility for your keys.</p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-abyss">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
