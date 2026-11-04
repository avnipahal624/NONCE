import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_STYLES, type Tone } from "@/lib/nonce";

/**
 * Status is never communicated by colour alone: every pill carries a text label
 * and, where it matters, an icon supplied by the caller.
 */
export function StatusPill({
  label,
  tone = "neutral",
  icon,
  className,
  size = "sm",
}: {
  label: string;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  const styles = TONE_STYLES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        styles.bg,
        styles.border,
        styles.text,
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        className,
      )}
    >
      {icon ?? <span className={cn("size-1.5 rounded-full", styles.dot)} aria-hidden="true" />}
      {label}
    </span>
  );
}

export function MonoTile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-hairline/70 bg-black/25 px-2 py-1 font-mono text-[11px] text-sage",
        className,
      )}
    >
      {children}
    </span>
  );
}
