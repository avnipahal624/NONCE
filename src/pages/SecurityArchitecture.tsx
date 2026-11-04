import {
  AlertTriangle,
  ArrowRight,
  Database,
  Fingerprint,
  KeyRound,
  Lock,
  Radar,
  Server,
  ShieldCheck,
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
import { Link } from "react-router";

const BOUNDARIES = [
  {
    icon: Server,
    title: "The backend can",
    tone: "safe" as const,
    items: [
      "Verify sessions and vault ownership on every request",
      "Ingest events, assess risk and preserve evidence hashes",
      "Request a constrained lockdown through a scoped role",
      "Notify you and record an immutable audit trail",
    ],
  },
  {
    icon: Database,
    title: "The backend cannot",
    tone: "danger" as const,
    items: [
      "Withdraw, transfer or redirect vault assets",
      "Read or store seed phrases or private keys",
      "Silently widen a withdrawal limit or guardian threshold",
      "Mark a lockdown confirmed before confirmation is observed",
    ],
  },
  {
    icon: Lock,
    title: "The vault enforces",
    tone: "warn" as const,
    items: [
      "Withdrawal limits, delays and recipient restrictions",
      "Lockdown blocks on withdrawals and permission changes",
      "Two-of-three guardian recovery with nonce binding",
      "Signer replacement and safe restoration conditions",
    ],
  },
];

const FAILURES = [
  {
    scenario: "Attacker ignores the decoys entirely",
    response: "Independent withdrawal delays, limits and guardian approvals stay active. Decoys are additive, not the only defence.",
  },
  {
    scenario: "Someone spams tokens at a decoy",
    response: "Recorded as low-risk inbound noise. No incident, no lockdown, no notification storm.",
  },
  {
    scenario: "The vault signer is stolen",
    response: "The attacker still meets the policy. Large withdrawals queue; a verified signal can freeze the vault before release.",
  },
  {
    scenario: "One guardian is compromised",
    response: "One approval never meets a two-of-three threshold. The proposal cannot execute.",
  },
  {
    scenario: "Monitoring goes offline",
    response: "Power is shown as degraded or offline, automated responses are withheld, and on-chain delays remain the safeguard.",
  },
  {
    scenario: "A lockdown transaction fails",
    response: "It is displayed as failed. Retries are bounded and audited. The vault is never described as locked without confirmation.",
  },
  {
    scenario: "An attacker front-runs the freeze",
    response: "The delay is the real defence. NONCE does not promise instantaneous lockdown or transaction reversal.",
  },
  {
    scenario: "The application database is compromised",
    response: "It holds no keys and grants no asset control. On-chain authorization and guardian approval still gate recovery and withdrawal.",
  },
  {
    scenario: "A false positive locks the vault",
    response: "Recovery is deliberate: review the evidence, then two guardians approve restoration. A review click alone cannot unlock it.",
  },
];

export default function SecurityArchitecture() {
  return (
    <MarketingShell>
      <div className="border-b border-hairline/50">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">Security architecture</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ivory sm:text-5xl">
            Boundaries you can inspect,{" "}
            <span className="font-display italic font-normal text-mint">limits we will name.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-sage">
            NONCE is not a custodial service and not a promise of invulnerability.
            It is an architecture that reduces single points of failure and makes automated
            security decisions auditable.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <StatusPill label="Reference contract unaudited" tone="warn" />
            <StatusPill label="Testnet only" tone="warn" />
            <StatusPill label="Append-only audit trail" tone="safe" />
          </div>
        </div>
      </div>

      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {BOUNDARIES.map((boundary, index) => (
            <Reveal key={boundary.title} delay={index * 0.07}>
              <Panel className="h-full">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-hairline bg-black/25 text-mint">
                    <boundary.icon className="size-4" />
                  </span>
                  <StatusPill
                    label={boundary.tone === "safe" ? "Permitted" : boundary.tone === "danger" ? "Blocked" : "Enforced"}
                    tone={boundary.tone}
                  />
                </div>
                <h2 className="mt-5 text-base font-semibold text-ivory">{boundary.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {boundary.items.map((item) => (
                    <li key={item} className="flex gap-2 text-[12px] leading-5 text-sage">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-sage/60" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Panel>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-y border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionHead
              eyebrow="Layers and trust"
              title="Observation never becomes custody."
              description="The system is split so that a failure in one layer cannot silently grant authority in another. Monitoring is evidence, guardians are approval, and the vault is enforcement."
            />
            <div className="mt-8 space-y-3">
              {[
                { icon: Fingerprint, title: "Wallet identity", body: "EIP-191 signature over a server-issued nonce with expiry and one-time consumption. Domain and chain are recorded." },
                { icon: Radar, title: "Independent monitor", body: "Checkpoints, restart-safe replay, duplicate suppression, rate limits and incident cooldowns." },
                { icon: Users, title: "Guardian quorum", body: "Approvals bound to vault, chain, proposal nonce and replacement address. One approval is never enough." },
                { icon: KeyRound, title: "Narrow automation", body: "The responder can request a freeze only. No withdrawal, upgrade or arbitrary-call authority." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 rounded-xl border border-hairline/70 bg-black/20 px-4 py-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-mint">
                    <item.icon className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ivory">{item.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-sage">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Reveal>
            <Panel hover={false} className="border-[#F17676]/20 bg-[#F17676]/[0.03]">
              <p className="flex items-center gap-2 text-xs font-medium text-[#F17676]">
                <AlertTriangle className="size-4" /> What NONCE will not claim
              </p>
              <ul className="mt-4 space-y-3">
                <CheckLine muted>That a hacked wallet becomes safe again without recovery</CheckLine>
                <CheckLine muted>That a confirmed blockchain transfer can be reversed</CheckLine>
                <CheckLine muted>That decoys catch every attacker</CheckLine>
                <CheckLine muted>That three compromised guardians can still be stopped</CheckLine>
                <CheckLine muted>That this build is audited, insured or production-ready</CheckLine>
              </ul>
              <div className="mt-5 rounded-lg border border-hairline/60 bg-black/25 px-3.5 py-3 text-[11px] leading-5 text-sage">
                Threat attribution is deliberately absent. A transaction does not identify the
                website or person responsible, so NONCE does not fabricate attacker identities
                or threat feeds.
              </div>
            </Panel>
          </Reveal>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Failure scenarios"
          title="Designed for the day it goes wrong."
          description="Every scenario below is handled explicitly. Where the honest answer is “this remains a risk”, the product says so."
        />
        <div className="mt-10 overflow-hidden rounded-2xl border border-hairline/70">
          <div className="hidden grid-cols-[0.9fr_1.1fr] gap-6 border-b border-hairline/70 bg-black/25 px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-sage md:grid">
            <span>Scenario</span>
            <span>Handling</span>
          </div>
          {FAILURES.map((failure, index) => (
            <div
              key={failure.scenario}
              className={[
                "grid gap-2 px-5 py-4 md:grid-cols-[0.9fr_1.1fr] md:gap-6",
                index !== FAILURES.length - 1 ? "border-b border-hairline/50" : "",
                index % 2 === 0 ? "bg-transparent" : "bg-white/[0.012]",
              ].join(" ")}
            >
              <p className="text-[13px] font-medium text-ivory">{failure.scenario}</p>
              <p className="text-[12px] leading-6 text-sage">{failure.response}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-t border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-8 lg:grid-cols-3">
          <SectionHead
            eyebrow="Trust assumptions"
            title="Read this before relying on it."
            className="lg:col-span-1"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            {[
              "Your wallet and its key handling are outside NONCE's control.",
              "A production vault must be deployed, reviewed and audited per chain.",
              "Guardians must be genuinely independent people or devices.",
              "Recovery requires at least two guardians to be available and honest.",
              "Blockchain public activity is not private; NONCE makes no anonymity claim.",
              "This demonstration uses simulated execution and testnet-only concepts.",
            ].map((item) => (
              <div key={item} className="flex gap-2.5 rounded-lg border border-hairline/60 bg-black/20 px-3.5 py-3 text-[12px] leading-5 text-sage">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-mint/80" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <Link to="/faq" className="mt-8 inline-flex items-center gap-2 text-sm text-mint hover:text-mint-bright">
          More in the FAQ <ArrowRight className="size-4" />
        </Link>
      </Section>

      <CtaBand
        title="Inspect the boundaries inside the product."
        description="The activity and recovery screens show the same authorization model described here, including failed and pending responses."
      />
    </MarketingShell>
  );
}
