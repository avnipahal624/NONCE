import type { ReactNode } from "react";
import { Check, Circle, Clock3, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStepState = "complete" | "current" | "pending" | "failed";

export type TimelineStep = {
  key: string;
  title: string;
  description?: string;
  timestamp?: string;
  state: TimelineStepState;
  meta?: ReactNode;
};

const ICON = {
  complete: Check,
  current: Clock3,
  pending: Circle,
  failed: X,
} as const;

const TONE = {
  complete: "border-mint/35 bg-mint text-[#04241a]",
  current: "border-[#E9B45E]/40 bg-[#E9B45E]/15 text-[#E9B45E]",
  pending: "border-hairline bg-black/30 text-sage/60",
  failed: "border-[#EF7777]/40 bg-[#EF7777]/15 text-[#EF7777]",
} as const;

function StepIcon({ state, className }: { state: TimelineStepState; className?: string }) {
  const Icon = ICON[state];
  return (
    <span
      className={cn(
        "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
        TONE[state],
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.2} />
    </span>
  );
}

function StateLabel({ state }: { state: TimelineStepState }) {
  const label =
    state === "complete"
      ? "Complete"
      : state === "current"
        ? "Current"
        : state === "failed"
          ? "Failed"
          : "Pending";
  return <span className="sr-only">{label}: </span>;
}

export function Timeline({
  steps,
  ariaLabel = "Progress timeline",
  className,
}: {
  steps: TimelineStep[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Vertical on mobile, horizontal on larger screens. */}
      <ol className="space-y-0 sm:hidden" aria-label={ariaLabel}>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && (
                <span
                  className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-hairline/70"
                  aria-hidden="true"
                />
              )}
              <StepIcon state={step.state} />
              <div className="min-w-0 pt-0.5">
                <StateLabel state={step.state} />
                <p className="text-[11px] font-medium text-ivory">{step.title}</p>
                {step.description && (
                  <p className="mt-0.5 text-[10px] leading-4 text-sage">{step.description}</p>
                )}
                {(step.timestamp || step.meta) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-sage/80">
                    {step.timestamp && <span>{step.timestamp}</span>}
                    {step.meta}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="hidden sm:flex" aria-label={ariaLabel}>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.key} className="relative min-w-0 flex-1">
              {!last && (
                <span
                  className="absolute left-1/2 top-3.5 h-px w-full bg-hairline/70"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex flex-col items-center px-1 text-center">
                <StepIcon state={step.state} />
                <StateLabel state={step.state} />
                <p className="mt-2 text-[10px] font-medium leading-4 text-ivory">{step.title}</p>
                {step.description && (
                  <p className="mt-0.5 max-w-[150px] text-[9px] leading-4 text-sage">
                    {step.description}
                  </p>
                )}
                {step.timestamp && (
                  <p className="mt-1 text-[9px] text-sage/75">{step.timestamp}</p>
                )}
                {step.meta && <div className="mt-1">{step.meta}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
