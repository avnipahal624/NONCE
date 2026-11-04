import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Logo } from "@/components/nonce/Logo";
import { VaultDial } from "@/components/nonce/VaultDial";
import { CheckLine } from "@/components/nonce/MarketingBlocks";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, ArrowRight, FlaskConical, Loader2, Mail } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send the verification code. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch {
      setError("That code did not match. Check the six digits and try again.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleSandboxAccess = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sandbox access is unavailable right now.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-abyss">
      <header className="mx-auto flex h-[76px] w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-sage transition-colors hover:text-ivory"
        >
          <ArrowLeft className="size-3.5" /> Back
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-10">
        <div className="hidden lg:block">
          <p className="text-[10px] uppercase tracking-[0.24em] text-mint/80">Secure access</p>
          <h1 className="mt-4 text-balance text-[46px] font-semibold leading-[1.05] tracking-[-0.035em] text-ivory">
            Enter the vault.
            <br />
            <span className="font-display italic font-normal text-mint">Stay ahead of the breach.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-sage">
            Sign in to configure withdrawal safeguards, monitor decoy activity and manage
            guardian recovery. Your wallet keys never leave your wallet.
          </p>
          <ul className="mt-7 max-w-md space-y-3">
            <CheckLine>Server-side authorization on every vault action</CheckLine>
            <CheckLine>One-time signature challenges, never a stored private key</CheckLine>
            <CheckLine>A sandbox you can explore without real funds</CheckLine>
          </ul>
          <div className="mt-10 max-w-[320px]">
            <VaultDial compact />
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-mint/[0.04] blur-2xl" aria-hidden="true" />
          <div className="relative rounded-2xl border border-hairline/80 bg-[#0b1c16]/95 p-6 sm:p-7">
            <div className="mb-6 lg:hidden">
              <Logo tagline={false} />
            </div>

            {step === "signIn" ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sage">Account</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ivory">
                  Sign in or create an account
                </h2>
                <p className="mt-2 text-[12px] leading-6 text-sage">
                  A six-digit code is sent to your email. No password to leak, and no seed
                  phrase is ever requested.
                </p>

                <form onSubmit={handleEmailSubmit} className="mt-6 space-y-3">
                  <label htmlFor="email" className="text-[11px] font-medium text-ivory/80">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sage" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      disabled={isLoading}
                      className="h-11 border-hairline bg-black/25 pl-10 text-sm placeholder:text-sage/50"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-11 w-full rounded-lg bg-mint text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Send verification code <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-hairline/60" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-sage">or</span>
                  <span className="h-px flex-1 bg-hairline/60" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSandboxAccess}
                  disabled={isLoading}
                  className="h-11 w-full rounded-lg border-hairline bg-transparent text-[13px] text-ivory hover:border-mint/30 hover:bg-white/[0.03]"
                >
                  <FlaskConical className="size-4 text-[#E9B45E]" />
                  Continue with sandbox access
                </Button>

                {error && (
                  <p role="alert" className="mt-4 rounded-md border border-[#F17676]/25 bg-[#F17676]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#F17676]">
                    {error}
                  </p>
                )}

                <p className="mt-5 text-[10px] leading-5 text-sage/80">
                  Sandbox access creates an unverified demo account. It cannot prove wallet
                  ownership and is labelled DEMO_SIGNER in the product.
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sage">Verification</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ivory">
                  Check your email
                </h2>
                <p className="mt-2 text-[12px] leading-6 text-sage">
                  We sent a six-digit code to <span className="text-ivory">{step.email}</span>.
                </p>

                <form onSubmit={handleOtpSubmit} className="mt-6">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />
                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && otp.length === 6 && !isLoading) {
                          (event.target as HTMLElement).closest("form")?.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} className="border-hairline" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {error && (
                    <p role="alert" className="mt-4 text-center text-[11px] text-[#F17676]">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading || otp.length !== 6}
                    className="mt-6 h-11 w-full rounded-lg bg-mint text-sm font-semibold text-[#04241a] hover:bg-mint-bright"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>Verify and continue <ArrowRight className="size-4" /></>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("signIn");
                      setOtp("");
                      setError(null);
                    }}
                    disabled={isLoading}
                    className="mt-3 w-full text-[11px] text-sage hover:text-ivory"
                  >
                    Use a different email
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 flex items-start gap-2 border-t border-hairline/50 pt-4 text-[10px] leading-5 text-sage/80">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-mint" aria-hidden="true" />
              NONCE never asks for a seed phrase or private key. Sign-in proves account
              access only; wallet ownership is verified separately.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
