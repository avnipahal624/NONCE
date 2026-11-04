import type { ReactNode } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Check, ChevronDown, Minus, ShieldCheck, Users } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { NonceMark } from "./Logo";

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("relative py-20 sm:py-28", className)}>
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  accent,
  description,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-mint/80">
        <span className="h-px w-6 bg-mint/50" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-semibold leading-[1.12] tracking-tight text-ivory sm:text-[42px]">
        {title}
        {accent && (
          <>
            {" "}
            <span className="font-display italic font-normal text-mint">{accent}</span>
          </>
        )}
      </h2>
      {description && (
        <p className="mt-5 text-[15px] leading-7 text-sage">{description}</p>
      )}
    </motion.div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Panel({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-hairline/70 bg-[#0b1c16]/80 p-6",
        hover && "transition-colors duration-300 hover:border-mint/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CheckLine({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          muted ? "bg-white/[0.05] text-sage" : "bg-mint/15 text-mint",
        )}
      >
        {muted ? <Minus className="size-2.5" /> : <Check className="size-2.5" />}
      </span>
      <span className={muted ? "text-sage" : "text-ivory/85"}>{children}</span>
    </li>
  );
}

export type FaqItem = { question: string; answer: string };

export function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <Accordion type="single" collapsible className={cn("w-full divide-y divide-hairline/50", className)}>
      {items.map((item, index) => (
        <AccordionItem
          key={item.question}
          value={`faq-${index}`}
          className="border-b-0"
        >
          <AccordionTrigger className="group py-5 text-left text-[15px] font-medium text-ivory hover:no-underline">
            <span className="flex items-baseline gap-4">
              <span className="font-mono text-[10px] text-mint/60">{String(index + 1).padStart(2, "0")}</span>
              {item.question}
            </span>
            <ChevronDown className="size-4 shrink-0 text-sage transition-transform group-data-[state=open]:rotate-180" />
          </AccordionTrigger>
          <AccordionContent className="pb-6 pl-8 pr-6 text-sm leading-7 text-sage">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function CtaBand({
  title = "Put a security layer between an attacker and your assets.",
  description = "Configure a sandbox vault in minutes. No real funds, no audited mainnet contract, no false promises.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Section className="pb-24 pt-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-mint/20 bg-[linear-gradient(135deg,#0d2a20_0%,#071310_55%,#0b2018_100%)] px-6 py-12 sm:px-12 sm:py-16">
          <div
            className="absolute -right-16 -top-24 size-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(87,213,165,0.3), transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-mint/25 bg-mint/10">
                <NonceMark className="size-6" />
              </div>
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-ivory sm:text-4xl">
                {title}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-sage">{description}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                to="/auth?returnTo=%2Fonboarding"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-mint px-7 text-sm font-semibold text-[#04241a] transition-colors hover:bg-mint-bright"
              >
                Protect my wallet
              </Link>
              <Link
                to="/security"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-hairline bg-white/[0.02] px-7 text-sm text-ivory transition-colors hover:border-mint/40 hover:text-mint"
              >
                Read the security model
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function GuardianVisual() {
  return (
    <div className="rounded-2xl border border-hairline/70 bg-[#081914]/90 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.2em] text-sage">Recovery threshold</p>
        <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-[10px] text-mint">
          2 of 3 required
        </span>
      </div>
      <div className="mt-5 space-y-2.5">
        {[
          { label: "Guardian — Ledger (cold)", state: "Approved", tone: "mint" },
          { label: "Guardian — Family vault", state: "Approved", tone: "mint" },
          { label: "Guardian — Advisor", state: "Awaiting key", tone: "sage" },
        ].map((guardian) => (
          <div
            key={guardian.label}
            className="flex items-center justify-between gap-4 rounded-lg border border-hairline/60 bg-black/20 px-3 py-2.5"
          >
            <span className="flex items-center gap-2.5 text-xs text-ivory/85">
              <span className="flex size-6 items-center justify-center rounded-md border border-hairline bg-surface">
                <Users className="size-3 text-sage" />
              </span>
              {guardian.label}
            </span>
            <span
              className={cn(
                "text-[10px]",
                guardian.tone === "mint" ? "text-mint" : "text-sage",
              )}
            >
              {guardian.state}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#E9B45E]/20 bg-[#E9B45E]/[0.05] px-3 py-2.5">
        <ShieldCheck className="size-4 shrink-0 text-[#E9B45E]" />
        <p className="text-[11px] leading-5 text-[#E9B45E]/90">
          Guardians approve replacing a signer. They cannot move funds on their own
          in this custody model.
        </p>
      </div>
    </div>
  );
}
