import { motion } from "framer-motion";
import { Link } from "react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Eye,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  Radar,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VaultDial } from "@/components/nonce/VaultDial";
import { MarketingShell } from "@/components/nonce/MarketingShell";
import {
  CheckLine,
  CtaBand,
  FaqList,
  GuardianVisual,
  Panel,
  Reveal,
  Section,
  SectionHead,
} from "@/components/nonce/MarketingBlocks";
import type { FaqItem } from "@/components/nonce/MarketingBlocks";
import { StatusPill } from "@/components/nonce/StatusPill";

const FAQS: FaqItem[] = [
  {
    question: "Does NONCE ever hold my private keys or seed phrase?",
    answer:
      "No. NONCE never asks for a seed phrase or a private key, and the backend never stores one. Your wallet signs messages and transactions locally. The vault contract holds assets and enforces policy; the application only coordinates state and evidence.",
  },
  {
    question: "Can NONCE reverse a transaction that already confirmed?",
    answer:
      "No, and we will not pretend otherwise. A confirmed blockchain transfer is irreversible. NONCE is designed to make unauthorised transfers harder and slower before they confirm, not to recover funds after they are gone.",
  },
  {
    question: "What is a decoy wallet?",
    answer:
      "A decoy is a monitored address that has no operational role in your vault. If someone unexpectedly signs from it, that activity is evidence that key material may be compromised. Decoys are alarms, not traps: they do not attract every attacker, and inbound spam is ignored.",
  },
  {
    question: "Is the vault running on mainnet with real money?",
    answer:
      "No. This build is a sandbox demonstration. Balances, deposits, withdrawals, monitoring and lockdown execution are simulated and labelled as such. No contract is deployed to mainnet and no real funds should be deposited. The reference vault contract is unaudited.",
  },
  {
    question: "What happens if I lose access to my wallet?",
    answer:
      "A recovery proposal names a replacement signer. Two of three guardians approve it, a recovery delay passes, and the compromised or lost signer is revoked. Guardians in this custody model can replace the signer but cannot move your funds on their own.",
  },
  {
    question: "What if the monitoring service goes down?",
    answer:
      "Monitoring health is shown separately from vault protection. If monitoring is degraded or offline, NONCE says so, withholds automated responses, and your independent on-chain withdrawal delay remains the active safeguard.",
  },
];

const HOW_STEPS = [
  {
    icon: Radar,
    title: "Detect",
    body: "Decoy addresses watch for signatures, nonce changes and contract calls that should never happen. Evidence is hashed and preserved before anyone acts.",
  },
  {
    icon: Lock,
    title: "Defend",
    body: "A verified high-risk signal can lock the vault: withdrawals and dangerous permission changes are blocked, and queued withdrawals are cancelled.",
  },
  {
    icon: Users,
    title: "Recover",
    body: "Two of three guardians approve a replacement signer. After the recovery delay, the compromised key is revoked and normal operation resumes.",
  },
];

const PROBLEM = [
  {
    icon: KeyRound,
    title: "One key, total control",
    body: "A stolen wallet key can move everything immediately. There is no second opinion and no waiting period unless the wallet enforces one.",
  },
  {
    icon: Timer,
    title: "Irreversible by design",
    body: "Confirmed transfers cannot be clawed back. Security has to happen before execution, not after the loss.",
  },
  {
    icon: Eye,
    title: "Silent until it is over",
    body: "A normal wallet has no concept of an intrusion. You usually learn about a compromise from the missing balance.",
  },
];

export default function Landing() {
  return (
    <MarketingShell>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-hairline/50">
        <div className="pointer-events-none absolute inset-0 nonce-shell-grid opacity-[0.5]" aria-hidden="true" />
        <div
          className="pointer-events-none absolute left-1/2 top-[-18rem] h-[38rem] w-[62rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(87,213,165,0.16), transparent 72%)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex flex-wrap items-center gap-2">
              <StatusPill
                label="Sandbox preview · Base Sepolia"
                tone="warn"
                icon={<span className="size-1.5 rounded-full bg-[#E9B45E]" aria-hidden="true" />}
              />
              <span className="text-[11px] text-sage">No real funds. No audited mainnet vault.</span>
            </div>

            <h1 className="mt-7 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-ivory sm:text-[64px]">
              Your crypto.
              <br />
              <span className="font-display italic font-normal tracking-[-0.01em] text-mint">
                One step ahead.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-7 text-sage sm:text-base">
              A smarter way to protect digital assets with decoy-powered intrusion
              detection, enforced withdrawal safeguards, and guardian-assisted recovery.
              Self-custody, with a security layer that acts before a breach becomes a loss.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="h-12 rounded-full bg-mint px-7 text-sm font-semibold text-[#04241a] shadow-none hover:bg-mint-bright"
              >
                <Link to="/auth?returnTo=%2Fonboarding">
                  Protect my wallet
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 rounded-full border-hairline bg-white/[0.02] px-7 text-sm text-ivory hover:border-mint/40 hover:bg-white/[0.04] hover:text-mint"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-hairline/60 pt-6">
              {[
                { value: "2-of-3", label: "guardian recovery" },
                { value: "10 min", label: "minimum withdrawal delay" },
                { value: "0", label: "private keys held" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="font-tabular text-lg font-semibold text-ivory">{item.value}</p>
                  <p className="mt-1 text-[11px] leading-4 text-sage">{item.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="relative mx-auto w-full max-w-[520px]"
          >
            <VaultDial />

            <div className="absolute -left-2 top-[16%] hidden rounded-xl border border-hairline/80 bg-[#081914]/90 px-3.5 py-2.5 backdrop-blur-md sm:block">
              <p className="text-[9px] uppercase tracking-[0.18em] text-sage">Enforced core</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mint">
                <Lock className="size-3" /> Policy enforced
              </p>
            </div>
            <div className="absolute -right-1 top-[42%] hidden rounded-xl border border-[#E9B45E]/30 bg-[#081914]/90 px-3.5 py-2.5 backdrop-blur-md sm:block">
              <p className="text-[9px] uppercase tracking-[0.18em] text-sage">Decoy sensors</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#E9B45E]">
                <Radar className="size-3" /> 3 monitoring
              </p>
            </div>
            <div className="absolute bottom-[6%] left-[10%] rounded-xl border border-hairline/80 bg-[#081914]/90 px-3.5 py-2.5 backdrop-blur-md">
              <p className="text-[9px] uppercase tracking-[0.18em] text-sage">Withdrawal guard</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ivory">
                <Timer className="size-3 text-mint" /> Delay armed
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Detect · Defend · Recover */}
      <Section id="how-it-works">
        <SectionHead
          eyebrow="The NONCE loop"
          title="Detect the breach."
          accent="Defend the vault."
          description="Three independent layers, engineered so that no single failure removes your protection. Each layer is useful on its own; together they cover the gap between a stolen key and an executed transfer."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08}>
              <Panel className="h-full">
                <div className="flex items-start justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-mint/20 bg-mint/[0.07] text-mint">
                    <step.icon className="size-[18px]" />
                  </span>
                  <span className="font-mono text-[10px] text-sage/70">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-ivory">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-sage">{step.body}</p>
                <Link
                  to="/how-it-works"
                  className="mt-5 inline-flex items-center gap-1.5 text-xs text-mint transition-colors hover:text-mint-bright"
                >
                  Read the flow <ArrowUpRight className="size-3.5" />
                </Link>
              </Panel>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* The problem */}
      <Section className="border-y border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHead
            eyebrow="The problem"
            title="A stolen key is a signed blank cheque."
            description="Most wallet security stops at the moment of signing. By then, the attacker already has everything they need. NONCE is built around the window between suspicious access and irreversible settlement."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {PROBLEM.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.08}>
                <div className="h-full border-t border-hairline/70 pt-5">
                  <item.icon className="size-5 text-[#F17676]/80" />
                  <h3 className="mt-4 text-sm font-semibold text-ivory">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-sage">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Vault security */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHead
              eyebrow="Smart vault security"
              title="Rules that live with the assets,"
              accent="not just in the interface."
              description="Withdrawal limits, delays and guardian thresholds belong in the vault, where an attacker with a stolen session cannot quietly switch them off. The interface explains them; the contract enforces them."
            />
            <ul className="mt-8 space-y-3">
              <CheckLine>Per-transaction limits and recipient restrictions</CheckLine>
              <CheckLine>Every withdrawal held in a cancellable pending state</CheckLine>
              <CheckLine>Lockdown blocks withdrawals and dangerous permission changes</CheckLine>
              <CheckLine>A monitoring outage never silently widens access</CheckLine>
            </ul>
            <p className="mt-6 rounded-lg border border-[#79A9E8]/20 bg-[#79A9E8]/[0.05] px-4 py-3 text-[12px] leading-6 text-[#79A9E8]">
              Honest limitation: in this sandbox, vault state and transfers are simulated.
              Enforced enforcement requires deploying and auditing the reference contract
              with a real signer architecture.
            </p>
          </div>

          <Reveal>
            <Panel hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline/60 px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-sage">Withdrawal lifecycle</p>
                  <p className="mt-1 text-sm font-medium text-ivory">0.35 ETH to an external wallet</p>
                </div>
                <StatusPill label="Held under guard" tone="warn" />
              </div>
              <div className="space-y-0 px-5 py-4">
                {[
                  {
                    title: "Request signed by vault signer",
                    detail: "Authorization checked before policy evaluation.",
                    state: "Done",
                    tone: "safe" as const,
                  },
                  {
                    title: "Policy evaluated inside the vault",
                    detail: "Every request has a delay; at or above 0.1 ETH, two guardian approvals also apply.",
                    state: "Done",
                    tone: "safe" as const,
                  },
                  {
                    title: "Security window · policy delay",
                    detail: "You can cancel. Monitoring continues. A confirmed lockdown also cancels it.",
                    state: "Active",
                    tone: "warn" as const,
                  },
                  {
                    title: "Guardian threshold reached · release",
                    detail: "Only when every required condition is satisfied at execution time.",
                    state: "Pending",
                    tone: "neutral" as const,
                  },
                ].map((row, index, all) => (
                  <div key={row.title} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < all.length - 1 && (
                      <span className="absolute left-[9px] top-5 h-full w-px bg-hairline/70" aria-hidden="true" />
                    )}
                    <span
                      className={[
                        "relative mt-1.5 size-[19px] shrink-0 rounded-full border",
                        row.tone === "safe"
                          ? "border-mint/40 bg-mint/15"
                          : row.tone === "warn"
                            ? "border-[#E9B45E]/50 bg-[#E9B45E]/15"
                            : "border-hairline bg-surface",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute inset-1 rounded-full",
                          row.tone === "safe"
                            ? "bg-mint"
                            : row.tone === "warn"
                              ? "bg-[#E9B45E]"
                              : "bg-sage/40",
                        ].join(" ")}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13px] font-medium text-ivory">{row.title}</p>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-sage">{row.state}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-sage">{row.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-hairline/60 bg-black/20 px-5 py-3.5">
                <span className="flex items-center gap-2 text-[11px] text-sage">
                  <Activity className="size-3.5 text-mint" /> Monitoring continues during the delay
                </span>
                <span className="font-mono text-[10px] text-sage">SIM-EXAMPLE</span>
              </div>
            </Panel>
          </Reveal>
        </div>
      </Section>

      {/* Decoys */}
      <Section className="border-y border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <Reveal className="order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-2xl border border-hairline/70 bg-[#06140f] p-6">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-mint/10 blur-2xl" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-sage">Signal log</p>
              <div className="mt-4 space-y-3">
                {[
                  {
                    title: "Inbound transfer to Decoy #2",
                    risk: "Low",
                    tone: "neutral" as const,
                    detail: "Recorded as spam. No vault action. Public addresses receive unsolicited tokens.",
                    time: "09:41",
                  },
                  {
                    title: "Outbound signature from Decoy #2",
                    risk: "High",
                    tone: "danger" as const,
                    detail: "Policy forbids signing. Two independent conditions verified before response.",
                    time: "09:44",
                  },
                  {
                    title: "Lockdown requested",
                    risk: "Action",
                    tone: "warn" as const,
                    detail: "Submission tracked separately from confirmation. Latency measured.",
                    time: "09:44",
                  },
                  {
                    title: "Vault locked down",
                    risk: "Confirmed",
                    tone: "safe" as const,
                    detail: "Queued withdrawals cancelled. Guardians notified. Evidence hash stored.",
                    time: "09:44",
                  },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="rounded-lg border border-hairline/60 bg-black/25 px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] font-medium text-ivory">{row.title}</span>
                      <StatusPill label={row.risk} tone={row.tone} />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-sage">{row.detail}</p>
                    <p className="mt-1 font-mono text-[9px] text-sage/60">{row.time} · simulated</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="order-1 lg:order-2">
            <SectionHead
              eyebrow="Decoy wallet monitoring"
              title="An alarm the attacker"
              accent="does not know is ringing."
              description="Decoys are isolated addresses with no role in your vault. Using one is inconsistent with any legitimate workflow, which makes unexpected signatures meaningful evidence rather than noise."
            />
            <ul className="mt-8 space-y-3">
              <CheckLine>Unsolicited token transfers are recorded, never escalated</CheckLine>
              <CheckLine>Signed transactions and nonce changes are the strong signals</CheckLine>
              <CheckLine>Duplicate suppression and cooldowns stop lockout spam</CheckLine>
              <CheckLine muted>Decoys do not attract every attacker, and are never marketed that way</CheckLine>
            </ul>
            <div className="mt-7 flex items-start gap-3 rounded-lg border border-hairline/70 bg-black/20 px-4 py-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-mint" />
              <p className="text-[12px] leading-6 text-sage">
                Detection is not proof of theft. Every alert shows what happened, why it
                was flagged, what evidence exists, and whether the response is pending or
                confirmed.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Guardians */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHead
              eyebrow="Guardian-assisted recovery"
              title="A way back in that does not"
              accent="trust the stolen key."
              description="If a signer is compromised, recovery must not require that signer's permission. Two of three independent guardians approve replacing it, after a delay, with the vault still locked."
            />
            <ul className="mt-8 space-y-3">
              <CheckLine>Guardian approvals are bound to the exact proposal, nonce and chain</CheckLine>
              <CheckLine>Duplicate and replayed approvals are rejected</CheckLine>
              <CheckLine>Signer replacement is narrow; guardians cannot withdraw your funds</CheckLine>
              <CheckLine muted>
                Three compromised guardians are a real remaining risk. NONCE does not claim
                guaranteed protection.
              </CheckLine>
            </ul>
            <Link
              to="/how-it-works"
              className="mt-7 inline-flex items-center gap-1.5 text-xs text-mint hover:text-mint-bright"
            >
              Walk through recovery <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <Reveal>
            <GuardianVisual />
          </Reveal>
        </div>
      </Section>

      {/* Architecture */}
      <Section className="border-y border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <SectionHead
            eyebrow="Security architecture"
            title="Layered by design,"
            accent="honest by default."
            description="NONCE separates observation, authorization and asset control. The monitoring backend can raise a verified signal and request a constrained action. It cannot move your funds."
          />
          <div className="space-y-3">
            {[
              {
                icon: Fingerprint,
                title: "Your wallet",
                detail: "Holds keys. Signs authentication messages and withdrawals locally.",
                tag: "Custody",
              },
              {
                icon: Layers,
                title: "Watchdog + risk engine",
                detail: "Ingests events, correlates signals, scores risk, preserves evidence.",
                tag: "Observation",
              },
              {
                icon: Lock,
                title: "Vault contract",
                detail: "Holds assets. Enforces delays, thresholds, lockdown and recovery.",
                tag: "Enforcement",
              },
              {
                icon: Users,
                title: "Guardians",
                detail: "Independent approvals for signer replacement. No unilateral fund access.",
                tag: "Recovery",
              },
            ].map((layer, index) => (
              <Reveal key={layer.title} delay={index * 0.06}>
                <div className="flex items-center gap-4 rounded-xl border border-hairline/70 bg-black/20 px-4 py-4 transition-colors hover:border-mint/25">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-mint">
                    <layer.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ivory">{layer.title}</p>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-sage/70">
                        {layer.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-sage">{layer.detail}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Panel hover={false} className="border-mint/15 bg-mint/[0.03]">
            <p className="flex items-center gap-2 text-xs font-medium text-mint">
              <ShieldCheck className="size-4" /> What this build actually does
            </p>
            <ul className="mt-4 space-y-2.5">
              <CheckLine>Server-enforced authorization and ownership checks</CheckLine>
              <CheckLine>Wallet ownership proven by one-time signature or labelled demo signer</CheckLine>
              <CheckLine>Full incident, lockdown and recovery state machine with evidence</CheckLine>
            </ul>
          </Panel>
          <Panel hover={false} className="border-[#E9B45E]/20 bg-[#E9B45E]/[0.03]">
            <p className="flex items-center gap-2 text-xs font-medium text-[#E9B45E]">
              <KeyRound className="size-4" /> What it explicitly does not do
            </p>
            <ul className="mt-4 space-y-2.5">
              <CheckLine muted>Deploy or audit a mainnet contract</CheckLine>
              <CheckLine muted>Read live chain balances or submit real transactions</CheckLine>
              <CheckLine muted>Reverse settled transfers or guarantee recovery</CheckLine>
            </ul>
          </Panel>
        </div>
      </Section>

      {/* Onboarding */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionHead
            eyebrow="Simple onboarding"
            title="Guarded in"
            accent="four short steps."
            description="No seed phrases. No private keys sent anywhere. Non-technical labels first, with technical detail available when you want it."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { step: "01", title: "Attach your wallet", detail: "Sign a message to prove ownership. The address alone is never accepted." },
              { step: "02", title: "Create the vault", detail: "A sandbox vault record with clear separation from your ordinary wallet." },
              { step: "03", title: "Set the rules", detail: "Limits, delay, allowlist, three guardians and decoy sensors." },
              { step: "04", title: "Verify everything", detail: "Protection stays incomplete until each safeguard is actually configured." },
            ].map((item, index) => (
              <Reveal key={item.step} delay={index * 0.07}>
                <div className="h-full rounded-xl border border-hairline/70 bg-black/20 p-5">
                  <span className="font-mono text-[10px] text-mint/70">{item.step}</span>
                  <h3 className="mt-3 text-sm font-semibold text-ivory">{item.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-5 text-sage">{item.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="border-t border-hairline/40 bg-[#081713]/60">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead
            eyebrow="Questions"
            title="The answers that matter."
            description="Including the ones about what NONCE cannot do."
          />
          <FaqList items={FAQS} />
        </div>
      </Section>

      <CtaBand />
    </MarketingShell>
  );
}
