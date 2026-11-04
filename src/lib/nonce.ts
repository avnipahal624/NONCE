import { formatDistanceToNowStrict } from "date-fns";

/** Client-side mirror of the supported network (display only). */
export const NETWORK = {
  id: "base-sepolia",
  chainId: 84532,
  label: "Base Sepolia",
  explorer: "https://sepolia.basescan.org",
  currency: "ETH",
} as const;

export type Tone = "safe" | "warn" | "danger" | "neutral" | "info";

export const TONE_STYLES: Record<
  Tone,
  { text: string; bg: string; border: string; dot: string }
> = {
  safe: {
    text: "text-[#79E8BD]",
    bg: "bg-[#57D5A5]/10",
    border: "border-[#57D5A5]/30",
    dot: "bg-[#57D5A5]",
  },
  warn: {
    text: "text-[#E9B45E]",
    bg: "bg-[#E9B45E]/10",
    border: "border-[#E9B45E]/30",
    dot: "bg-[#E9B45E]",
  },
  danger: {
    text: "text-[#F17676]",
    bg: "bg-[#F17676]/10",
    border: "border-[#F17676]/35",
    dot: "bg-[#F17676]",
  },
  info: {
    text: "text-[#79A9E8]",
    bg: "bg-[#79A9E8]/10",
    border: "border-[#79A9E8]/30",
    dot: "bg-[#79A9E8]",
  },
  neutral: {
    text: "text-[#94ACA0]",
    bg: "bg-white/[0.04]",
    border: "border-[#28483B]",
    dot: "bg-[#94ACA0]",
  },
};

export function truncateMiddle(value: string | undefined | null, lead = 6, tail = 4): string {
  if (!value) return "—";
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Trim trailing zeros without inventing precision. */
export function formatAmount(value: string | number | undefined, maxDecimals = 4): string {
  if (value === undefined || value === null || value === "") return "0";
  const raw = typeof value === "number" ? value.toString() : value;
  const [whole, fraction = ""] = raw.split(".");
  const trimmedFraction = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  const withSeparators = Number(whole || "0").toLocaleString("en-US");
  return trimmedFraction ? `${withSeparators}.${trimmedFraction}` : withSeparators;
}

export function formatFullAmount(value: string | undefined): string {
  if (!value) return "0";
  const [whole, fraction = ""] = value.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-US");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return `${formatDistanceToNowStrict(new Date(timestamp))} ago`;
}

export function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function explorerTx(hash: string): string {
  return `${NETWORK.explorer}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${NETWORK.explorer}/address/${address}`;
}

const VAULT_STATE_COPY: Record<
  string,
  { label: string; tone: Tone; description: string }
> = {
  NORMAL: {
    label: "Normal",
    tone: "safe",
    description: "Withdrawals follow your saved withdrawal policy.",
  },
  RESTRICTED: {
    label: "Restricted",
    tone: "warn",
    description: "High-risk operations need extra verification.",
  },
  LOCKDOWN: {
    label: "Locked down",
    tone: "danger",
    description: "Ordinary withdrawals are blocked until guardian recovery completes.",
  },
  RECOVERY: {
    label: "Recovery",
    tone: "warn",
    description: "Guardians are replacing the compromised signer.",
  },
  RESTORED: {
    label: "Restored",
    tone: "safe",
    description: "The compromised signer was revoked. Confirm your new settings.",
  },
};

export function vaultStateCopy(state: string | undefined): {
  label: string;
  tone: Tone;
  description: string;
} {
  return (
    VAULT_STATE_COPY[state ?? "NORMAL"] ?? {
      label: state ?? "Unknown",
      tone: "neutral" as Tone,
      description: "State unavailable.",
    }
  );
}

const INCIDENT_TONE: Record<string, Tone> = {
  DETECTED: "warn",
  VERIFIED: "warn",
  RESPONSE_PENDING: "warn",
  LOCKDOWN_CONFIRMED: "danger",
  RECOVERY: "warn",
  RESOLVED: "safe",
  FALSE_POSITIVE: "neutral",
  FAILED: "danger",
};

export function incidentTone(status: string): Tone {
  return INCIDENT_TONE[status] ?? "neutral";
}

export function incidentLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function riskTone(risk: string): Tone {
  if (risk === "HIGH") return "danger";
  if (risk === "MEDIUM") return "warn";
  return "neutral";
}

export function monitoringCopy(status: string | undefined): {
  label: string;
  tone: Tone;
  detail: string;
} {
  if (status === "ACTIVE")
    return {
      label: "Active",
      tone: "safe",
      detail: "Sandbox detector is processing simulated events.",
    };
  if (status === "DEGRADED")
    return {
      label: "Degraded",
      tone: "warn",
      detail: "Automated responses are withheld while the watcher is unhealthy.",
    };
  return {
    label: "Offline",
    tone: "danger",
    detail: "No monitor is processing events. On-chain delays remain the active safeguard.",
  };
}

export function protectionTone(level: string): Tone {
  switch (level) {
    case "PROTECTED":
      return "safe";
    case "PARTIAL":
      return "warn";
    case "AT_RISK":
      return "danger";
    case "LOCKDOWN":
    case "RECOVERY":
      return "danger";
    default:
      return "neutral";
  }
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
