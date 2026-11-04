import { Link } from "react-router";
import {
  Activity,
  ArrowRight,
  Clock,
  FileSearch,
  Lock,
  Radar,
  ShieldAlert,
  Timer,
  Users,
} from "lucide-react";
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

const PHASES = [
  {
    number: "01",
    icon: Radar,
    title: "Detect",
    summary: "Evidence before action.",
    points: [
      "A dedicated monitor ingests decoy and vault events, tracking block checkpoints so restarts can replay safely.",
      "Signals are classified by rule, not by volume. Inbound spam is low risk and never freezes a vault.",
      "Risk assessment requires corroboration: an unexpected signature plus a policy that forbids signing.",
      "Every event is fingerprinted with a SHA-256 evidence hash before any response begins.",
    ],
    status: "Sandbox detector implemented; live RPC ingestion is not configured.",
  },
  {
    number: "02",
    icon: Lock,
    title: "Defend",
    summary: "Narrow authority, bounded action.",
    points: [
      "A verified high-risk signal creates a lockdown request. Submission and confirmation are tracked as separate states.",
      "Only a confirmed transition marks the vault locked. A failed submission is shown as failed, never softened.",
      "Lockdown blocks withdrawals and dangerous permission changes. Queued withdrawals are cancelled with an audit trail.",
      "The monitoring backend holds a narrowly scoped freeze permission. It cannot withdraw, upgrade or transfer assets.",
    ],
    status: "Lockdown state machine implemented and executed against the sandbox vault.",
  },
  {
    number: "03",
    icon: Users,
    title: "Recover",
    summary: "Replace the key, not the ownership.",
    points: [
      "Recovery starts from a trusted device and names a replacement signer. The compromised signer is not required.",
      "Guardians approve a proposal bound to the vault, chain, nonce and replacement address. Replays and duplicates are rejected.",
      "A recovery delay must pass. The vault stays locked until the replacement is armed and permissions are cleared.",
      "Normal operation resumes only after the compromised wallet is revoked and pending withdrawals are cancelled.",
    ],
    status: "Guardian approval and signer replacement implemented with simulated approvals.",
  },
];

const STATES = [
  {
    name: "NORMAL",
    tone: "safe" as const,
    body: "Permitted operations follow the configured withdrawal policy.",
  },
  {
    name: "RESTRICTED",
    tone: "warn" as const,
    body: "High-risk actions require additional verification or remain delayed.",
  },
  {
    name: "LOCKDOWN",
    tone: "danger" as const,
    body: "Ordinary withdrawals and dangerous permission changes are blocked.",
  },
  {
    name: "RECOVERY",
    tone: "warn" as const,
    body: "A narrowly scoped guardian process is replacing the signer.",
  },
  {
    name: "RESTORED",
    tone: "safe" as const,
    body: "Compromised permissions are revoked; normal operation can resume.",
  },
];

export default function HowItWorks() {
  return (
    <MarketingShell>
      <div className="border-b border-hairline/50">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">How NONCE works</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ivory sm:text-5xl">
            A breach should trigger a process,{" "}
            <span className="font-display italic font-normal text-mint">not a scramble.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-sage">
            NONCE links three independent mechanisms: decoy sensors that produce evidence,
            a vault that enforces restrictions, and guardians who can replace a compromised
            signer. Each works without trusting the others blindly.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <StatusPill label="Sandbox implementation" tone="warn" />
            <StatusPill label="Server-enforced authorization" tone="safe" />
            <StatusPill label="No private keys held" tone="safe" />
          </div>
        </div>
      </div>

      <Section>
        <div className="space-y-4">
          {PHASES.map((phase, index) => (
            <Reveal key={phase.number} delay={index * 0.05}>
              <div className="grid gap-8 rounded-2xl border border-hairline/70 bg-[#0b1c16]/70 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-mint/20 bg-mint/[0.07] text-mint">
                      <phase.icon className="size-[18px]" />
                    </span>
                    <span className="font-mono text-[10px] text-sage/70">{phase.number}</span>
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ivory">{phase.title}</h2>
                  <p className="mt-1.5 font-display text-lg italic text-mint/90">{phase.summary}</p>
                  <p className="mt-4 inline-flex rounded-md border border-[#E9B45E]/20 bg-[#E9B45E]/[0.06] px-2.5 py-1.5 text-[11px] leading-5 text-[#E9B45E]">
                    {phase.status}
                  </p>
                </div>
                <ul className="space-y-3.5">
                  {phase.points.map((point) => (
                    <CheckLine key={point}>{point}</CheckLine>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-y border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead
            eyebrow="Vault states"
            title="Five states, explicit transitions."
            description="No state is inferred from a UI toggle. Every transition is validated, recorded, and explained with what it does and does not block."
          />
          <div className="space-y-3">
            {STATES.map((state) => (
              <div
                key={state.name}
                className="flex flex-col gap-2 rounded-xl border border-hairline/70 bg-black/20 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <StatusPill label={state.name} tone={state.tone} className="font-mono" />
                <p className="text-[12px] leading-5 text-sage sm:max-w-md sm:text-right">{state.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <SectionHead
              eyebrow="Withdrawal lifecycle"
              title="Nothing releases on the first click."
              description="A withdrawal is a queued, cancellable, continuously re-evaluated request — not a button that immediately empties a balance. The contract checks conditions at execution time, not only at request time."
            />
            <div className="mt-8 space-y-0">
              {[
                { icon: FileSearch, title: "Authorize", body: "The vault signer is checked. A stolen session alone cannot submit a valid request." },
                { icon: Activity, title: "Evaluate", body: "Limits, allowlists, delay thresholds and guardian requirements are applied by policy." },
                { icon: Timer, title: "Hold", body: "Delayed requests enter a pending state. You can cancel; a confirmed lockdown cancels them automatically." },
                { icon: ShieldAlert, title: "Re-check at execution", body: "State, balance, approvals and lockdown status are re-verified immediately before release." },
                { icon: Clock, title: "Settle", body: "Only a successful, confirmed execution is described as complete. Pending never reads as done." },
              ].map((step, index, all) => (
                <div key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
                  {index < all.length - 1 && (
                    <span className="absolute left-[15px] top-8 h-full w-px bg-hairline/70" aria-hidden="true" />
                  )}
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-mint">
                    <step.icon className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ivory">{step.title}</p>
                    <p className="mt-1 text-[12px] leading-6 text-sage">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Reveal>
            <Panel hover={false}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-sage">Known bypass paths we evaluate</p>
              <ul className="mt-4 space-y-2.5">
                <CheckLine>Direct withdrawals and batch transactions</CheckLine>
                <CheckLine>Token approvals and delegated spending</CheckLine>
                <CheckLine>Module execution and arbitrary contract calls</CheckLine>
                <CheckLine>Ownership changes and contract upgrades</CheckLine>
                <CheckLine>Signature replay across chain, vault or proposal</CheckLine>
              </ul>
              <p className="mt-5 text-[12px] leading-6 text-sage">
                Any path that cannot be secured in production is disabled or explicitly
                restricted rather than quietly left open. The reference contract documents
                these decisions; the sandbox does not enforce them on-chain.
              </p>
            </Panel>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="See the whole lifecycle run end to end."
        description="Load the demo vault, trigger a decoy signal and watch detection, lockdown and guardian recovery share one state machine."
      />
      <div className="mx-auto -mt-10 w-full max-w-7xl px-5 pb-20 sm:px-8">
        <Link to="/auth?returnTo=%2Fonboarding" className="inline-flex items-center gap-2 text-sm text-mint hover:text-mint-bright">
          Open the sandbox <ArrowRight className="size-4" />
        </Link>
      </div>
    </MarketingShell>
  );
}
