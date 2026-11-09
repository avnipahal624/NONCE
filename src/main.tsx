import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting. If the dev server is
// restarting or a production chunk was replaced, reload once instead of
// leaving the preview on "Failed to fetch dynamically imported module".
type RouteLoader = Parameters<typeof lazy>[0];

function lazyRoute(name: string, load: RouteLoader) {
  return lazy(async () => {
    try {
      const route = await load();
      clearRouteRetry(name);
      return route;
    } catch (error) {
      const url = new URL(window.location.href);
      // A query parameter persists across the reload without relying on
      // storage, which can be blocked inside a sandboxed preview iframe.
      if (url.searchParams.get("routeRetry") !== name) {
        url.searchParams.set("routeRetry", name);
        window.location.replace(url.toString());
      }
      throw error;
    }
  });
}

function clearRouteRetry(name: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("routeRetry") === name) {
    url.searchParams.delete("routeRetry");
    window.history.replaceState(window.history.state, "", url);
  }
}

const Landing = lazyRoute("landing", () => import("./pages/Landing.tsx"));
const HowItWorks = lazyRoute("how-it-works", () => import("./pages/HowItWorks.tsx"));
const SecurityArchitecture = lazyRoute("security", () => import("./pages/SecurityArchitecture.tsx"));
const Features = lazyRoute("features", () => import("./pages/Features.tsx"));
const Faq = lazyRoute("faq", () => import("./pages/Faq.tsx"));
const AuthPage = lazyRoute("auth", () => import("./pages/Auth.tsx"));
const Onboarding = lazyRoute("onboarding", () => import("./pages/Onboarding.tsx"));
const Dashboard = lazyRoute("dashboard", () => import("./pages/Dashboard.tsx"));
const Vault = lazyRoute("vault", () => import("./pages/Vault.tsx"));
const Protection = lazyRoute("protection", () => import("./pages/Protection.tsx"));
const Activity = lazyRoute("activity", () => import("./pages/Activity.tsx"));
const IncidentDetail = lazyRoute("incident", () => import("./pages/IncidentDetail.tsx"));
const Recovery = lazyRoute("recovery", () => import("./pages/Recovery.tsx"));
const Settings = lazyRoute("settings", () => import("./pages/Settings.tsx"));
const Testnet = lazyRoute("testnet", () => import("./pages/Testnet.tsx"));
const NotFound = lazyRoute("not-found", () => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-abyss">
      <div className="flex items-center gap-2 text-xs text-sage">
        <span className="size-1.5 animate-pulse rounded-full bg-mint" />
        Loading NONCE…
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-abyss p-6 text-ivory">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 break-words text-xs text-sage">{this.state.message}</p>
            {this.state.stack && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-hairline/60 p-2 text-left text-[10px] leading-4 text-sage/80">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

function Protected({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/security" element={<SecurityArchitecture />} />
              <Route path="/features" element={<Features />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route
                path="/onboarding"
                element={
                  <Protected>
                    <Onboarding />
                  </Protected>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <Protected>
                    <Dashboard />
                  </Protected>
                }
              />
              <Route
                path="/vault"
                element={
                  <Protected>
                    <Vault />
                  </Protected>
                }
              />
              <Route
                path="/protection"
                element={
                  <Protected>
                    <Protection />
                  </Protected>
                }
              />
              <Route
                path="/activity"
                element={
                  <Protected>
                    <Activity />
                  </Protected>
                }
              />
              <Route
                path="/activity/:incidentId"
                element={
                  <Protected>
                    <IncidentDetail />
                  </Protected>
                }
              />
              <Route
                path="/recovery"
                element={
                  <Protected>
                    <Recovery />
                  </Protected>
                }
              />
              <Route
                path="/settings"
                element={
                  <Protected>
                    <Settings />
                  </Protected>
                }
              />
              <Route
                path="/testnet"
                element={
                  <Protected>
                    <Testnet />
                  </Protected>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
