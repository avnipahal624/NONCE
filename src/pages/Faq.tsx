import { Link } from "react-router";
import { ArrowRight, HelpCircle } from "lucide-react";
import { MarketingShell } from "@/components/nonce/MarketingShell";
import {
  CtaBand,
  FaqList,
  Panel,
  Section,
  SectionHead,
} from "@/components/nonce/MarketingBlocks";
import type { FaqItem } from "@/components/nonce/MarketingBlocks";

const GROUPS: { title: string; intro: string; items: FaqItem[] }[] = [
  {
    title: "Getting started",
    intro: "What NONCE is, and what it expects from you.",
    items: [
      {
        question: "Is NONCE a bank or an exchange?",
        answer:
          "Neither. NONCE is a self-custodial vault interface with security monitoring. It does not take custody of assets, does not hold your keys, and does not offer trading or yield. You remain responsible for your wallet.",
      },
      {
        question: "What do I need to use it?",
        answer:
          "An account and an EVM wallet you control. You can attach a real wallet and sign a message to prove ownership, or use a clearly labelled sandbox signer for the demo. The sandbox does not need a wallet extension.",
      },
      {
        question: "Why does NONCE need a signature if I already connected my wallet?",
        answer:
          "A connected address is not proof of ownership. NONCE issues a one-time, short-lived message (EIP-4361 style) containing the domain, chain id and nonce. Only a valid signature over that exact message is accepted, and it can be used once.",
      },
      {
        question: "Can I use real funds in this build?",
        answer:
          "No. Do not deposit real assets. This build simulates balances, deposits, withdrawals and lockdowns. The reference vault contract is unaudited and has not been deployed to mainnet.",
      },
    ],
  },
  {
    title: "The security model",
    intro: "How detection, delay and enforcement fit together.",
    items: [
      {
        question: "How is this different from a normal hardware wallet?",
        answer:
          "A hardware wallet protects key use. NONCE adds rules around what a valid signature can do: withdrawal limits, delays, cancelable pending withdrawals, decoy-based intrusion evidence and guardian recovery. The two are complementary, not substitutes.",
      },
      {
        question: "Will NONCE freeze my vault if someone sends me spam tokens?",
        answer:
          "No. Tokens arriving at a decoy address are recorded as low-risk noise. Only meaningful signals — such as an unexpected signed transaction or nonce change — can escalate, and escalation still requires independent verification.",
      },
      {
        question: "Does an alert prove my wallet was hacked?",
        answer:
          "No. Risk classification is evidence, not proof. Each incident shows the signal, the reasoning, the preserved evidence, the action taken and whether that action is pending or confirmed. False positives are a supported outcome.",
      },
      {
        question: "Can NONCE staff or the backend move my funds?",
        answer:
          "No. NONCE never holds keys and the backend has no withdrawal authority. Automated response is limited to a constrained freeze. A database compromise would expose records, not assets.",
      },
      {
        question: "What happens if monitoring is down when an attack happens?",
        answer:
          "The dashboard will report degraded or offline monitoring and will not pretend protection is healthy. Automated responses are withheld. Your on-chain withdrawal delay and guardian rules remain the active safeguard.",
      },
    ],
  },
  {
    title: "Recovery",
    intro: "What guardians can and cannot do.",
    items: [
      {
        question: "Can guardians take my funds?",
        answer:
          "Not in the custody model this product targets. Guardians approve replacing a vault signer after a proposal and a delay; they are not given unilateral transfer authority. Any different custody model would have to be explicit and understood up front.",
      },
      {
        question: "What if I lose access to my wallet without an attacker?",
        answer:
          "The recovery flow covers loss as well as compromise: name a replacement signer, collect two of three guardian approvals, wait out the recovery delay, then revoke the old signer. The vault stays locked until that completes.",
      },
      {
        question: "What if a guardian is compromised?",
        answer:
          "One compromised guardian cannot meet the two-of-three threshold. If two or more guardians are compromised, the remaining protection is limited. NONCE treats that as a serious residual risk rather than a solved problem.",
      },
      {
        question: "Why is there a delay before recovery executes?",
        answer:
          "A delay gives the legitimate owner time to notice a fraudulent proposal and gives guardians time to verify the request out-of-band. It is a safety window, not a formality, and recovery cannot skip it.",
      },
    ],
  },
  {
    title: "This build",
    intro: "Exact status of the demonstration.",
    items: [
      {
        question: "What is simulated?",
        answer:
          "Vault deployment, balances, deposits, withdrawals, decoy provisioning, chain events, lockdown submission and confirmation, and guardian approvals. Every one of these is labelled simulated in the interface and carries no fabricated transaction hash.",
      },
      {
        question: "What is real?",
        answer:
          "Authentication, session handling, server-side authorization, protection scoring, the incident and recovery state machines, evidence hashing, duplicate suppression, rate limits, notification records and the audit trail.",
      },
      {
        question: "Is the vault contract audited?",
        answer:
          "No. A reference Solidity implementation is included with the project for review, but it is not deployed, not audited and should not secure real value in its current form.",
      },
      {
        question: "Does NONCE provide legal-grade evidence?",
        answer:
          "No. Evidence hashes and event references help preserve integrity, but NONCE makes no claim that this record is admissible in any jurisdiction.",
      },
    ],
  },
];

export default function Faq() {
  return (
    <MarketingShell>
      <div className="border-b border-hairline/50">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">FAQ</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ivory sm:text-5xl">
            Straight answers,{" "}
            <span className="font-display italic font-normal text-mint">including the awkward ones.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-sage">
            If a capability is simulated, missing or dependent on external configuration,
            it is stated here rather than implied by a polished screen.
          </p>
        </div>
      </div>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <SectionHead eyebrow="Not sure where to start?" title="The short version." />
            <Panel hover={false} className="mt-6">
              <div className="flex items-center gap-2 text-mint">
                <HelpCircle className="size-4" />
                <p className="text-xs font-medium">Three things to remember</p>
              </div>
              <ol className="mt-4 space-y-3 text-[12px] leading-6 text-sage">
                <li>1. NONCE never holds your keys and never asks for a seed phrase.</li>
                <li>2. Security happens before settlement: delay, limit, cancel, then release.</li>
                <li>3. This is a sandbox. No real funds, no audited mainnet contract.</li>
              </ol>
              <Link
                to="/security"
                className="mt-5 inline-flex items-center gap-2 text-xs text-mint hover:text-mint-bright"
              >
                Read the security architecture <ArrowRight className="size-3.5" />
              </Link>
            </Panel>
          </div>

          <div className="space-y-10">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-baseline justify-between gap-4 border-b border-hairline/70 pb-3">
                  <h2 className="text-lg font-semibold text-ivory">{group.title}</h2>
                  <p className="hidden text-[11px] text-sage sm:block">{group.intro}</p>
                </div>
                <FaqList items={group.items} />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand
        title="The product is the clearest answer."
        description="Open the sandbox and inspect the protection checklist, monitor health and incident timeline for yourself."
      />
    </MarketingShell>
  );
}
