import { useState, type ReactNode } from "react";
import { Rotate3D } from "lucide-react";
import { cn } from "@/lib/utils";

type PassportFlipCardProps = {
  children: ReactNode;
  back: ReactNode;
};

/**
 * A keyboard-operable 3D passport with a non-animated reduced-motion state.
 * The back face is supplied by the caller so it can show live evidence rather
 * than a decorative, hard-coded security claim.
 */
export function PassportFlipCard({ children, back }: PassportFlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="space-y-3">
      <div className="group relative [perspective:1400px]">
        <div
          className={cn(
            "grid [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none",
            flipped && "[transform:rotateY(180deg)]",
          )}
        >
          <div
            aria-hidden={flipped}
            inert={flipped}
            className="col-start-1 row-start-1 [backface-visibility:hidden]"
          >
            {children}
          </div>
          <div
            aria-hidden={!flipped}
            inert={!flipped}
            className="col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            {back}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={flipped}
        onClick={() => setFlipped((value) => !value)}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] px-3 text-[10px] font-medium text-mint transition-colors hover:border-mint/40 hover:bg-mint/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
      >
        <Rotate3D className="size-3.5" aria-hidden="true" />
        {flipped ? "Return to passport cover" : "Turn passport to see evidence"}
      </button>
    </div>
  );
}
