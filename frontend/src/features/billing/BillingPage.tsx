import { useEffect, useState } from "react";
import { BadgeCheck, CreditCard, Loader2, RotateCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ApiClient, ApiError } from "../../api/client";
import { createCheckoutSession, createPortalSession, getBillingMe, getPlans, getUsage, schedulePlanSwitch } from "../../api/billing";
import { BillingPlan, SubscriptionSummary, UsageSummary } from "../../types";
import { formatDate } from "../documents/status";
import { UsageMeters } from "./UsageMeter";

interface BillingPageProps {
  api: ApiClient | null;
}

function intervalLabel(interval: BillingPlan["interval"]) {
  if (interval === "month") {
    return "Billed monthly";
  }
  if (interval === "year") {
    return "Billed yearly";
  }
  return "Free forever";
}

function priceLabel(interval: BillingPlan["interval"]): { amount: string; suffix: string } | null {
  if (interval === "month") return { amount: "$19.99", suffix: "/mo" };
  if (interval === "year") return { amount: "$9.99", suffix: "/yr" };
  return null;
}

function checkoutReturnState(params: URLSearchParams): "success" | "scheduled" | "cancelled" | null {
  const value = params.get("checkout") ?? params.get("status");
  if (value === "success") {
    return "success";
  }
  if (value === "scheduled") {
    return "scheduled";
  }
  if (value === "canceled" || value === "cancelled") {
    return "cancelled";
  }
  return null;
}

export function BillingPage({ api }: BillingPageProps) {
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const returnState = checkoutReturnState(searchParams);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void Promise.all([getPlans(api), getBillingMe(api), getUsage(api)])
      .then(([nextPlans, nextSubscription, nextUsage]) => {
        if (!cancelled) {
          setPlans(nextPlans);
          setSubscription(nextSubscription);
          setUsage(nextUsage);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Unable to load billing details right now.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function redirectTo(action: () => Promise<string>, planId: string | null) {
    if (!api) {
      return;
    }

    setActionError(null);
    setPendingPlanId(planId ?? "portal");
    try {
      const url = await action();
      window.location.assign(url);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const url = await createPortalSession(api as ApiClient);
          window.location.assign(url);
          return;
        } catch {
          setActionError("Open Manage billing to complete this subscription change.");
        }
      } else if (error instanceof ApiError && error.status === 503) {
        setNotConfigured(true);
      } else if (error instanceof ApiError) {
        setActionError(error.message);
      } else {
        setActionError("Unable to open Stripe right now. Please try again.");
      }
      setPendingPlanId(null);
    }
  }

  async function scheduleSwitch(plan: BillingPlan) {
    await redirectTo(() => schedulePlanSwitch(api as ApiClient, plan.id), `schedule-${plan.id}`);
  }

  const currentPlanId = subscription?.plan.id;
  const upcomingSubscription = subscription?.upcomingSubscription ?? null;
  const hasActivePaidSubscription = Boolean(subscription?.status && subscription.plan.interval);
  const isCurrentPlanCanceling = Boolean(subscription?.cancelAtPeriodEnd);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Account</p>
        <h1 className="text-3xl font-semibold text-ink">Billing</h1>
        <p className="mt-1 text-sm text-slate-600">Manage your plan, payment details, and usage.</p>
      </div>

      {returnState === "success" ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Payment complete. Your plan updates as soon as Stripe confirms the subscription.
        </div>
      ) : null}
      {returnState === "scheduled" ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Checkout complete. Your new plan will start when your current billing period ends.
        </div>
      ) : null}
      {returnState === "cancelled" ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Checkout was cancelled. Your plan has not changed.
        </div>
      ) : null}
      {notConfigured ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Billing is not configured in this environment.
        </p>
      ) : null}
      {actionError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : null}

      {isLoading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading billing details...
        </p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Your plan</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">{subscription?.plan.name ?? "Free"}</h2>
              {subscription?.status ? (
                <p className="mt-1 text-sm capitalize text-slate-600">Status: {subscription.status.replace("_", " ")}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-600">No paid subscription.</p>
              )}
              {subscription?.currentPeriodEnd ? (
                <p className="mt-1 text-sm text-slate-600">
                  {subscription.cancelAtPeriodEnd ? "Access ends on" : "Renews on"} {formatDate(subscription.currentPeriodEnd)}
                </p>
              ) : null}
              {subscription?.cancelAtPeriodEnd ? (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Your subscription is set to cancel at the end of this billing period and will not renew.
                </p>
              ) : null}
              {upcomingSubscription ? (
                <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Next plan: {upcomingSubscription.plan.name} starts{upcomingSubscription.startsAt ? ` on ${formatDate(upcomingSubscription.startsAt)}` : " soon"}.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                {isCurrentPlanCanceling ? (
                  <button
                    type="button"
                    onClick={() => void redirectTo(() => createPortalSession(api as ApiClient), "reactivate")}
                    disabled={pendingPlanId !== null}
                    className="brand-gradient inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingPlanId === "reactivate" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={17} aria-hidden="true" />}
                    Reactivate plan
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void redirectTo(() => createPortalSession(api as ApiClient), null)}
                  disabled={pendingPlanId !== null}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-teal-100 px-4 text-sm font-semibold text-ink transition hover:border-sea hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingPlanId === "portal" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={17} aria-hidden="true" />}
                  Manage billing
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Usage this period</p>
              {usage ? (
                <>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDate(usage.periodStart)} to {formatDate(usage.periodEnd)}
                  </p>
                  <div className="mt-4">
                    <UsageMeters usage={usage} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">Usage is unavailable right now.</p>
              )}
            </section>
          </div>

          <section className="mt-6">
            <h2 className="text-xl font-semibold text-ink">Plans</h2>
            <div className="mt-3 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                const isUpcoming = plan.id === upcomingSubscription?.plan.id;

                return (
                  <article
                    key={plan.id}
                    className={`flex flex-col rounded-2xl border bg-white p-5 shadow-panel ${
                      isCurrent ? "border-sea ring-4 ring-teal-100" : "border-teal-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
                        <p className="text-sm text-slate-600">{intervalLabel(plan.interval)}</p>
                      </div>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-sea">
                          <BadgeCheck size={14} aria-hidden="true" />
                          Current plan
                        </span>
                      ) : null}
                    </div>
                    {(() => {
                      const price = priceLabel(plan.interval);
                      return price ? (
                        <div className="mt-3 flex items-baseline gap-0.5">
                          <span className="text-3xl font-bold text-ink">{price.amount}</span>
                          <span className="text-sm text-slate-500">{price.suffix}</span>
                          {plan.interval === "year" && (
                            <span className="ml-2 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              Save 50%
                            </span>
                          )}
                        </div>
                      ) : null;
                    })()}
                    <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
                      <li>{plan.limitAiMessages} AI messages per period</li>
                      <li>{plan.limitUploads} uploads per period</li>
                      <li>{plan.limitStorageMb} MB storage</li>
                      <li>Up to {plan.limitDocumentScope} documents per conversation</li>
                    </ul>
                    {plan.interval && isCurrent && isCurrentPlanCanceling ? (
                      <button
                        type="button"
                        onClick={() => void redirectTo(() => createPortalSession(api as ApiClient), "reactivate")}
                        disabled={pendingPlanId !== null}
                        className="brand-gradient mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingPlanId === "reactivate" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={17} aria-hidden="true" />}
                        Reactivate plan
                      </button>
                    ) : null}
                    {plan.interval && !isCurrent && hasActivePaidSubscription && isCurrentPlanCanceling && isUpcoming ? (
                      <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                        Starts{upcomingSubscription?.startsAt ? ` on ${formatDate(upcomingSubscription.startsAt)}` : " soon"}
                      </p>
                    ) : null}
                    {plan.interval && !isCurrent && hasActivePaidSubscription && isCurrentPlanCanceling && !isUpcoming ? (
                      <button
                        type="button"
                        onClick={() => void scheduleSwitch(plan)}
                        disabled={pendingPlanId !== null}
                        className="brand-gradient mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingPlanId === `schedule-${plan.id}` ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                        Choose this plan
                      </button>
                    ) : null}
                    {plan.interval && !isCurrent && hasActivePaidSubscription && !isCurrentPlanCanceling ? (
                      <button
                        type="button"
                        onClick={() => void redirectTo(() => createPortalSession(api as ApiClient), `portal-${plan.id}`)}
                        disabled={pendingPlanId !== null}
                        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-teal-100 px-4 text-sm font-semibold text-ink transition hover:border-sea hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingPlanId === `portal-${plan.id}` ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={17} aria-hidden="true" />}
                        Switch in billing portal
                      </button>
                    ) : null}
                    {plan.interval && !isCurrent && !hasActivePaidSubscription ? (
                      <button
                        type="button"
                        onClick={() => void redirectTo(() => createCheckoutSession(api as ApiClient, plan.id), plan.id)}
                        disabled={pendingPlanId !== null}
                        className="brand-gradient mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingPlanId === plan.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                        Choose this plan
                      </button>
                    ) : null}
                    {!plan.interval && !isCurrent ? (
                      <p className="mt-4 text-sm text-slate-500">Downgrade from the Manage billing portal.</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

