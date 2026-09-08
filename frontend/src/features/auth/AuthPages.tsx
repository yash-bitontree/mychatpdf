import { useAuth } from "@clerk/clerk-react";
import { CheckCircle2, FileSearch, LockKeyhole, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ClerkAuthFlow } from "./AuthFlow";
import { AuthUnavailable } from "./AuthFormPrimitives";
import { DEFAULT_REDIRECT_PATH, authCopy, type AuthMode } from "./authConfig";
import { BrandLockup, BrandName } from "../brand/Brand";

interface AuthPageProps {
  mode: AuthMode;
}

interface RouteState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
}

export function AuthPage({ mode }: AuthPageProps) {
  const hasClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const redirectPath = useMemo(() => getSafeRedirectPath(location.state), [location.state]);
  const copy = authCopy[mode];

  if (hasClerkKey && isLoaded && isSignedIn) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <main className="auth-page min-h-screen bg-[linear-gradient(135deg,#f8fbfc_0%,#eef4ff_46%,#f4efff_100%)] px-4 py-5 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:gap-16">
        <section className="min-w-0 py-4">
          <Link
            to="/app"
            className="inline-flex rounded-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-200"
          >
            <BrandLockup markClassName="h-20 w-auto max-w-[340px] object-contain sm:h-24 sm:max-w-[380px]" />
          </Link>

          <div className="mt-10 max-w-3xl sm:mt-14">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sea">PDF intelligence, grounded</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              Upload, ask, and verify answers against the original PDF.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              A focused workspace for secure uploads, source-backed answers, and page-level evidence that stays close
              to the document.
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
            <AuthSignal icon={<FileSearch size={18} aria-hidden="true" />} title="Preview" body="Read beside chat." />
            <AuthSignal icon={<MessageSquareText size={18} aria-hidden="true" />} title="Ask" body="Stream answers." />
            <AuthSignal icon={<CheckCircle2 size={18} aria-hidden="true" />} title="Verify" body="Open cited pages." />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-md border border-teal-100 bg-white/85 px-3 py-2 shadow-sm">
              <LockKeyhole size={16} className="text-sea" aria-hidden="true" />
              Private document workspace
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-teal-100 bg-white/85 px-3 py-2 shadow-sm">
              <ShieldCheck size={16} className="text-sea" aria-hidden="true" />
              Authenticated access
            </span>
          </div>
        </section>

        <section className="min-w-0 py-4">
          <div className="w-full rounded-lg border border-teal-100 bg-white p-5 shadow-[0_28px_70px_rgba(32,104,248,0.16)] sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">{copy.eyebrow}</p>
                <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-ink">
                  <AuthTitle mode={mode} />
                </h2>
              </div>
              <span className="brand-gradient grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white shadow-sm">
                <Sparkles size={22} aria-hidden="true" />
              </span>
            </div>

            <div className="pt-5">
              {hasClerkKey ? (
                <ClerkAuthFlow mode={mode} copy={copy} redirectPath={redirectPath} />
              ) : (
                <AuthUnavailable title={<AuthTitle mode={mode} />} />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthSignal({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-white/85 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sea">
        {icon}
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{body}</p>
    </div>
  );
}

function AuthTitle({ mode }: { mode: AuthMode }) {
  if (mode === "sign-in") {
    return (
      <>
        Sign in to <BrandName />
      </>
    );
  }

  return (
    <>
      Create your <BrandName /> account
    </>
  );
}

function getSafeRedirectPath(state: unknown) {
  const routeState = state as RouteState | null;
  const from = routeState?.from;

  if (!from?.pathname || !from.pathname.startsWith(DEFAULT_REDIRECT_PATH)) {
    return DEFAULT_REDIRECT_PATH;
  }

  return `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
}
