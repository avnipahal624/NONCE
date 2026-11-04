import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { truncateMiddle } from "@/lib/nonce";

export function Address({
  value,
  lead = 6,
  tail = 4,
  className,
  copyable = true,
  label,
}: {
  value: string | undefined | null;
  lead?: number;
  tail?: number;
  className?: string;
  copyable?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="font-mono text-xs text-sage">—</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs text-ivory/85", className)}>
      {label && <span className="font-sans text-[11px] text-sage">{label}</span>}
      <span title={value}>{truncateMiddle(value, lead, tail)}</span>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Address copied" : "Copy address"}
          className="rounded p-0.5 text-sage transition-colors hover:text-mint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint"
        >
          {copied ? <Check className="size-3 text-mint" /> : <Copy className="size-3" />}
        </button>
      )}
    </span>
  );
}
