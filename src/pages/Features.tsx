import {
  Activity,
  ArrowRight,
  Bell,
  Clock,
  Fingerprint,
  FileSearch,
  Landmark,
  Lock,
  Radar,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { MarketingShell } from "@/components/nonce/MarketingShell";
import {
  CheckLine,
  CtaBand,
  Panel,
  Reveal,
  Section,
  SectionHead,
} from "@/components/nonce/MarketingBlocks";
import { StatusPill } from "@/components/nonce/StatusPill";

const GROUPS = [
  {
    label: "Protection",
    features: [
      {
        icon: Landmark,
        title: "Policy-enforcing vault",
        body: "Per-transaction limits, a rolling 24-hour budget, a minimum delay on every withdrawal, recipient allowlists and cancellation before settlement.",
        badge: "Sandbox state machine",
      },
      {
        icon: Clock,
        title: "Withdrawal guard",
        body: "Every queued withdrawal is re-checked at execution time. A lockdown cancels it instead of silently releasing it.",
        badge: "Implemented",
      },
      {
        icon: Lock,
        title: "Lockdown state",
        body: "Freezes withdrawals and dangerous permission changes. Confirmation is tracked separately from submission.",
        badge: "Implemented",
      },
    ],
  },
  {
    label: "Detection",
    features: [
      {
        icon: Radar,
        title: "Decoy sensors",
        body: "Monitored addresses with no vault role. Inbound noise is ignored; unexpected signatures raise a signal.",
        badge: "Sandbox detector",
      },
      {
        icon: FileSearch,
        title: "Evidence preservation",
        body: "Chain id, block, log index, observation time and a SHA-256 evidence hash are stored with each incident.",
        badge: "Implemented",
      },
      {
        icon: Bell,
        title: "Auditable response",
        body: "Every automated action records its trigger, rationale, timestamp and outcome in an append-only audit trail.",
        badge: "Implemented",
      },
    ],
  },
  {
    label: "Recovery",
    features: [
      {
        icon: Users,
        title: "Two-of-three guardians",
        body: "Independent approvals bound to the exact proposal, nonce, vault and chain. Duplicates and replays are rejected.",
        badge: "Simulated approvals",
      },
      {
        icon: ShieldCheck,
        title: "Signer replacement",
        body: "The compromised or lost signer is revoked, pending withdrawals are cleared, and the vault returns to a restored state.",
        badge: "Implemented",
      },
      {
        icon: FileSearch,
        title: "Reviewable incidents",
        body: "A complete timeline: detected, verified, response pending, confirmed, recovery, resolved — plus failed and false-positive outcomes.",
        badge: "Implemented",
      },
    ],
  },
  {
    label: "Experience",
    features: [
      {
        icon: Fingerprint,
        title: "Signature authentication",
        body: "An address alone is never accepted. SIWE-style nonce, expiry, one-time consumption and chain checks.",
        badge: "Live when a wallet is present",
      },
      {
        icon: Smartphone,
        title: "Consumer-grade interface",
        body: "Clear labels first, technical detail on demand. Responsive, keyboard accessible and reduced-motion aware.",
        badge: "Implemented",
      },
      {
        icon: Activity,
        title: "Honest status language",
        body: "No green shield without configuration. Monitoring outages, pending freezes and simulated balances are labelled as such.",
        badge: "Implemented",
      },
    ],
  },
];

export default function Features() {
  return (
    <MarketingShell>
      <div className="border-b border-hairline/50">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">Features</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ivory sm:text-5xl">
            The security you can verify,{" "}
            <span className="font-display italic font-normal text-mint">the limits we admit.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-sage">
            NONCE focuses on the window between suspicious access and settlement.
            It does not promise to make a compromised key safe, catch every attacker, or
            undo a confirmed transfer.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <StatusPill label="No seed phrases requested" tone="safe" />
            <StatusPill label="Testnet concepts only" tone="warn" />
            <StatusPill label="No mainnet deployment" tone="danger" />
          </div>
        </div>
      </div>

      {GROUPS.map((group, groupIndex) => (
        <Section
          key={group.label}
          className={groupIndex % 2 === 1 ? "border-y border-hairline/40 bg-[#081713]/60" : ""}
        >
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-mint/70">0{groupIndex + 1}</span>
            <h2 className="text-xl font-semibold tracking-tight text-ivory">{group.label}</h2>
            <span className="h-px flex-1 bg-hairline/50" aria-hidden="true" />
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.features.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.05}>
                <Panel className="h-full">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-mint/15 bg-mint/[0.06] text-mint">
                      <feature.icon className="size-[18px]" />
                    </span>
                    <StatusPill label={feature.badge} tone="neutral" />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold text-ivory">{feature.title}</h3>
                  <p className="mt-2 text-[12px] leading-6 text-sage">{feature.body}</p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Section>
      ))}

      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHead
            eyebrow="Deliberately excluded"
            title="A shorter list of promises."
            description="Version one is one chain, one vault model and one honest demo. These are left out on purpose rather than mocked up."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel hover={false} className="border-[#E9B45E]/20 bg-[#E9B45E]/[0.03]">
              <p className="text-xs font-medium text-[#E9B45E]">Not in this build</p>
              <ul className="mt-4 space-y-2.5">
                <CheckLine muted>Live chain balance reads or real transfers</CheckLine>
                <CheckLine muted>Guardian approval signatures from separate accounts</CheckLine>
                <CheckLine muted>Email or push delivery providers</CheckLine>
                <CheckLine muted>Bitcoin, Solana or other non-EVM vaults</CheckLine>
              </ul>
            </Panel>
            <Panel hover={false} className="border-mint/15 bg-mint/[0.03]">
              <p className="text-xs font-medium text-mint">In this build</p>
              <ul className="mt-4 space-y-2.5">
                <CheckLine>Full authentication, authorization and vault state machine</CheckLine>
                <CheckLine>Incidents with evidence hashes and failed-response handling</CheckLine>
                <CheckLine>Simulated approvals and execution, clearly labelled</CheckLine>
                <CheckLine>Complete dashboard, recovery and audit experience</CheckLine>
              </ul>
            </Panel>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/security" className="inline-flex items-center gap-2 text-sm text-mint hover:text-mint-bright">
            Read the security model <ArrowRight className="size-4" />
          </Link>
          <Link to="/how-it-works" className="inline-flex items-center gap-2 text-sm text-sage hover:text-ivory">
            Walk through the lifecycle <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>

      <CtaBand
        title="Open the vault and inspect every state."
        description="The sandbox dashboard exposes protection configuration, monitor health, incidents and recovery without hiding failed paths."
      />
    </MarketingShell>
  );
}
