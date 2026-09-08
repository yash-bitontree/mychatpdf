import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { type ReactNode } from "react";

export type NoticeTone = "info" | "error";

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold leading-5 text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Notice({ tone, message }: { tone: NoticeTone; message: string }) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex gap-3 rounded-lg border p-3 text-sm leading-6 ${
        isError ? "border-red-200 bg-red-50 text-red-800" : "border-teal-100 bg-teal-50 text-teal-900"
      }`}
    >
      {isError ? (
        <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export function ButtonContent({
  loading,
  loadingLabel,
  label
}: {
  loading: boolean;
  loadingLabel: string;
  label: string;
}) {
  if (loading) {
    return (
      <>
        <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden="true" />
        <span>{loadingLabel}</span>
      </>
    );
  }

  return (
    <>
      <span>{label}</span>
      <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
    </>
  );
}

export function AuthUnavailable({ title }: { title: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-base font-semibold text-amber-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        Authentication is not configured for this environment. Add the Clerk publishable key before opening the
        workspace to users.
      </p>
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.8z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-0.9 6.7-2.5l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22z"
      />
      <path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7z" />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7C7.2 7.9 9.4 6.1 12 6.1z"
      />
    </svg>
  );
}

export const inputClassName =
  "h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base leading-6 text-ink shadow-sm outline-none transition placeholder:text-slate-500 focus:border-sea focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50";

export const primaryButtonClassName =
  "brand-gradient inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-semibold leading-6 text-white shadow-sm transition hover:shadow-[0_14px_28px_rgba(32,104,248,0.24)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-400 disabled:shadow-none";

export const secondaryButtonClassName =
  "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-semibold leading-6 text-ink shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
