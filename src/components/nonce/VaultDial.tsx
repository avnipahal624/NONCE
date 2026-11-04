import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NonceMark } from "./Logo";

/**
 * The vault visual. It deliberately communicates separation: protected assets
 * sit inside the sealed core, decoy sensors orbit outside it.
 */
export function VaultDial({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className={cn("relative aspect-square w-full select-none", className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 nonce-glow" />
      <motion.div
        className="absolute inset-0"
        initial={reduced ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        style={{ perspective: 1100 }}
      >
        <div
          className="absolute inset-[4%] rounded-full vault-door"
          style={{ transform: "rotateX(7deg) rotateY(-9deg)", transformStyle: "preserve-3d" }}
        >
          <svg viewBox="0 0 400 400" className="absolute inset-0 size-full">
            <defs>
              <radialGradient id="dial-core" cx="50%" cy="42%" r="52%">
                <stop offset="0%" stopColor="#1d4436" />
                <stop offset="58%" stopColor="#0b2019" />
                <stop offset="100%" stopColor="#061410" />
              </radialGradient>
              <linearGradient id="dial-metal" x1="40" y1="30" x2="360" y2="370" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#4f8b73" />
                <stop offset="28%" stopColor="#123229" />
                <stop offset="52%" stopColor="#5fae90" />
                <stop offset="74%" stopColor="#0e2a21" />
                <stop offset="100%" stopColor="#326952" />
              </linearGradient>
              <linearGradient id="dial-spoke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#79E8BD" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#0e2a21" stopOpacity="0.2" />
              </linearGradient>
              <radialGradient id="dial-hub" cx="38%" cy="32%" r="70%">
                <stop offset="0%" stopColor="#2f6b54" />
                <stop offset="65%" stopColor="#123027" />
                <stop offset="100%" stopColor="#071a14" />
              </radialGradient>
            </defs>

            <circle cx="200" cy="200" r="186" fill="url(#dial-core)" stroke="url(#dial-metal)" strokeWidth="14" />

            <g className={reduced ? undefined : "animate-orbit-slow"} style={{ transformOrigin: "200px 200px" }}>
              {Array.from({ length: 36 }).map((_, index) => (
                <line
                  key={index}
                  x1="200"
                  y1="18"
                  x2="200"
                  y2={index % 3 === 0 ? 34 : 27}
                  stroke="#79E8BD"
                  strokeOpacity={index % 3 === 0 ? 0.4 : 0.18}
                  strokeWidth="1.4"
                  transform={`rotate(${index * 10} 200 200)`}
                />
              ))}
            </g>

            <circle cx="200" cy="200" r="158" fill="none" stroke="#28483B" strokeWidth="1.2" />
            <circle cx="200" cy="200" r="150" fill="none" stroke="#57D5A5" strokeOpacity="0.16" strokeWidth="1" strokeDasharray="2 9" />
            <circle cx="200" cy="200" r="118" fill="#081a14" stroke="url(#dial-metal)" strokeWidth="6" />
            <circle
              cx="200"
              cy="200"
              r="100"
              fill="url(#dial-hub)"
              stroke="#3d7a63"
              strokeOpacity="0.7"
              strokeWidth="1.2"
            />

            <g className={reduced ? undefined : "animate-orbit-reverse"} style={{ transformOrigin: "200px 200px" }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <g key={index} transform={`rotate(${index * 60} 200 200)`}>
                  <rect x="196" y="78" width="8" height="46" rx="3" fill="url(#dial-spoke)" />
                  <circle cx="200" cy="78" r="5.5" fill="#0b2019" stroke="#57D5A5" strokeOpacity="0.5" />
                </g>
              ))}
            </g>

            <circle cx="200" cy="200" r="72" fill="#0a1e17" stroke="#57D5A5" strokeOpacity="0.25" />
            <circle cx="200" cy="200" r="56" fill="url(#dial-hub)" stroke="#79E8BD" strokeOpacity="0.28" />

            <path
              d="M200 152v48m0 0 24-15m-24 15-24-15"
              fill="none"
              stroke="#79E8BD"
              strokeOpacity="0.35"
              strokeWidth="1.6"
              strokeLinecap="round"
            />

            {!compact && (
              <g fontSize="8.5" fill="#94ACA0" letterSpacing="2.4" fontFamily="Inter, sans-serif">
                <text x="200" y="372" textAnchor="middle">
                  SEALED · 2-OF-3
                </text>
              </g>
            )}
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-[26%] items-center justify-center rounded-2xl border border-mint/25 bg-[#06160f]/80 backdrop-blur-sm">
              <NonceMark className="size-[62%]" />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="animate-scan h-16 w-full bg-gradient-to-b from-transparent via-mint/10 to-transparent" />
          </div>
        </div>

        {/* Decoy sensors outside the seal */}
        {[
          { top: "2%", left: "50%", tone: "bg-mint", delay: 0 },
          { top: "62%", left: "4%", tone: "bg-[#E9B45E]", delay: 1.2 },
          { top: "74%", left: "82%", tone: "bg-[#79A9E8]", delay: 2.4 },
        ].map((node, index) => (
          <div
            key={index}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: node.top, left: node.left }}
          >
            <span className="relative flex size-2.5">
              <span
                className={cn("absolute inline-flex size-full rounded-full opacity-60", node.tone, reduced ? "" : "animate-pulse-ring")}
                style={{ animationDelay: `${node.delay}s` }}
              />
              <span className={cn("relative inline-flex size-2.5 rounded-full ring-2 ring-[#071310]", node.tone)} />
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
