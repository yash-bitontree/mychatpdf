"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/motion/reveal";
import { CheckIcon } from "@/components/icons";

type Status = "idle" | "sending" | "sent" | "error";

type TurnstileRenderOptions = {
  action: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
  theme: "light";
};

const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
  (process.env.NODE_ENV === "production" ? undefined : TURNSTILE_TEST_SITE_KEY);

declare global {
  interface Window {
    turnstile?: {
      remove: (widgetId: string) => void;
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
      reset: (widgetId?: string) => void;
    };
  }
}

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isTurnstileReady, setIsTurnstileReady] = useState(() =>
    typeof window !== "undefined" && Boolean(window.turnstile)
  );
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const isTurnstileRequired = Boolean(turnstileSiteKey);
  const isTurnstileVerified = !isTurnstileRequired || Boolean(turnstileToken);
  const isSubmitDisabled = status === "sending" || !isTurnstileVerified;


  useEffect(() => {
    if (!turnstileSiteKey || !isTurnstileReady || !turnstileContainerRef.current || turnstileWidgetIdRef.current) {
      return;
    }

    const widgetId = window.turnstile?.render(turnstileContainerRef.current, {
      action: "contact",
      callback: (token: string) => {
        setTurnstileToken(token);
        setError(null);
      },
      "error-callback": () => {
        setTurnstileToken("");
      },
      "expired-callback": () => {
        setTurnstileToken("");
      },
      sitekey: turnstileSiteKey,
      theme: "light",
    });

    if (widgetId) {
      turnstileWidgetIdRef.current = widgetId;
    }

    return () => {
      if (turnstileWidgetIdRef.current) {
        window.turnstile?.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [isTurnstileReady]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isTurnstileVerified) {
      setError("Please complete the security check.");
      return;
    }

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (turnstileToken) {
      data["cf-turnstile-response"] = turnstileToken;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        resetTurnstile();
        return;
      }
      form.reset();
      setStatus("sent");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
      resetTurnstile();
    }
  }

  function resetTurnstile() {
    setTurnstileToken("");
    window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
  }

  if (status === "sent") {
    return (
      <Reveal direction="zoom" className="flex h-full min-h-[26rem] sm:min-h-[30rem]">
        <div className="flex w-full flex-col items-center justify-center text-center" role="status">
          <div className="bg-ice text-sea mx-auto flex h-14 w-14 items-center justify-center rounded-full">
            <CheckIcon className="h-7 w-7" />
          </div>
          <p className="text-ink mt-5 text-xl font-semibold">Message sent</p>
          <p className="mt-2 leading-relaxed text-slate-600">
            Thanks for reaching out. We usually reply within one business day.
          </p>
        </div>
      </Reveal>
    );
  }

  const inputClass =
    "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-4 text-ink placeholder:text-slate-400 transition-colors focus:border-sea focus:ring-4 focus:ring-ice focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Name
        </label>
        <input id="name" name="name" type="text" required className={`${inputClass} h-12`} placeholder="Your name" />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={`${inputClass} h-12`}
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-slate-700">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className={`${inputClass} py-3`}
          placeholder="How can we help?"
        />
      </div>
      {turnstileSiteKey ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setIsTurnstileReady(true)}
          />
          <div ref={turnstileContainerRef} />
        </>
      ) : null}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="bg-brand-gradient hover:shadow-glow shadow-sea/25 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
      >
        {status === "sending" ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
