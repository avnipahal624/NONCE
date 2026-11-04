import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function NonceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("size-9", className)}
    >
      <defs>
        <linearGradient id="nonce-mark-gradient" x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#79E8BD" />
          <stop offset="0.55" stopColor="#57D5A5" />
          <stop offset="1" stopColor="#2E8F6C" />
        </linearGradient>
      </defs>
      <path
        d="M32 6 54 18.5v27L32 58 10 45.5v-27z"
        fill="rgba(87,213,165,0.06)"
        stroke="url(#nonce-mark-gradient)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M32 6v26m0 0 22-13.5M32 32 10 18.5M32 32v26"
        fill="none"
        stroke="url(#nonce-mark-gradient)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx="32" cy="32" r="4" fill="#79E8BD" />
    </svg>
  );
}

export function Logo({
  to = "/",
  tagline = true,
  className,
}: {
  to?: string;
  tagline?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label="NONCE home"
      className={cn(
        "group inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      <NonceMark className="size-9 transition-transform duration-500 group-hover:rotate-[8deg]" />
      <span className="flex flex-col leading-none">
        <span className="text-[20px] font-semibold tracking-[-0.03em] text-ivory">
          NONCE<span className="text-mint">.</span>
        </span>
        {tagline && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-sage">
            Your crypto security bank
          </span>
        )}
      </span>
    </Link>
  );
}
