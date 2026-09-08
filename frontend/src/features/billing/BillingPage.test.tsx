import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../../api/client";
import { renderWithRouter } from "../../test/test-utils";
import { BillingPage } from "./BillingPage";

const plans = [
  {
    id: "free",
    name: "Free",
    interval: null,
    limit_ai_messages: 25,
    limit_uploads: 3,
    limit_storage_mb: 50,
    limit_document_scope: 1,
    allowed_chat_models: ["gpt-4.1-mini"]
  },
  {
    id: "pro_monthly",
    name: "Pro Monthly",
    interval: "month",
    limit_ai_messages: 1000,
    limit_uploads: 100,
    limit_storage_mb: 2048,
    limit_document_scope: 10,
    allowed_chat_models: ["gpt-4.1-mini", "gpt-4.1"]
  },
  {
    id: "pro_yearly",
    name: "Pro Yearly",
    interval: "year",
    limit_ai_messages: 1000,
    limit_uploads: 100,
    limit_storage_mb: 2048,
    limit_document_scope: 10,
    allowed_chat_models: ["gpt-4.1-mini", "gpt-4.1"]
  }
];

const freeSubscription = {
  plan: { id: "free", name: "Free", interval: null },
  status: null,
  current_period_end: null,
  cancel_at_period_end: false
};

const activeMonthlySubscription = {
  plan: { id: "pro_monthly", name: "Pro Monthly", interval: "month" },
  status: "active",
  current_period_end: "2026-08-01T12:00:00Z",
  cancel_at_period_end: false
};

const cancelingProSubscription = {
  plan: { id: "pro_monthly", name: "Pro Monthly", interval: "month" },
  status: "active",
  current_period_end: "2026-08-01T12:00:00Z",
  cancel_at_period_end: true
};

const cancelingWithUpcomingYearlySubscription = {
  ...cancelingProSubscription,
  upcoming_subscription: {
    plan: { id: "pro_yearly", name: "Pro Yearly", interval: "year" },
    status: "scheduled",
    starts_at: "2026-08-01T12:00:00Z"
  }
};

const usage = {
  plan: { id: "free", name: "Free" },
  period_start: "2026-07-01T00:00:00Z",
  period_end: "2026-08-01T00:00:00Z",
  ai_messages: { used: 12, limit: 25 },
  uploads: { used: 1, limit: 3 },
  storage_mb: { used: 10, limit: 50 }
};

function fakeApi({
  portalStatus = 200,
  switchStatus = 200,
  subscription = freeSubscription
}: { portalStatus?: number; switchStatus?: number; subscription?: object } = {}) {
  return new ApiClient({
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/billing/plans")) {
        return new Response(JSON.stringify({ items: plans }), { status: 200 });
      }
      if (url.endsWith("/api/billing/me")) {
        return new Response(JSON.stringify(subscription), { status: 200 });
      }
      if (url.endsWith("/api/usage")) {
        return new Response(JSON.stringify(usage), { status: 200 });
      }
      if (url.endsWith("/api/billing/portal")) {
        const body = portalStatus === 200 ? { url: "https://portal.stripe.test/session" } : { detail: "Billing is not configured" };
        return new Response(JSON.stringify(body), { status: portalStatus });
      }
      if (url.endsWith("/api/billing/schedule-switch")) {
        return new Response(JSON.stringify({ url: "https://checkout.stripe.test/future" }), { status: 200 });
      }
      if (url.endsWith("/api/billing/switch")) {
        if (switchStatus !== 200) {
          return new Response(
            JSON.stringify({ detail: "You already have Pro Monthly enabled. Cancel it to choose Pro Yearly." }),
            { status: switchStatus }
          );
        }
        return new Response(JSON.stringify({ url: "https://portal.stripe.test/switch" }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
}

describe("BillingPage", () => {
  it("renders the plan matrix with the current plan marked", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing"]);

    expect(await screen.findByRole("heading", { name: "Pro Monthly" })).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getAllByText("1000 AI messages per period")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /choose this plan/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
  });

  it("shows usage meters for the three quotas", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing"]);

    expect(await screen.findByRole("progressbar", { name: "AI messages usage" })).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByRole("progressbar", { name: "Uploads usage" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "Storage usage" })).toHaveAttribute("aria-valuenow", "10");
    expect(screen.getByText("10 MB / 50 MB")).toBeInTheDocument();
  });

  it("labels active paid plan changes as portal switches", async () => {
    renderWithRouter(<BillingPage api={fakeApi({ subscription: activeMonthlySubscription })} />, ["/app/billing"]);

    expect(await screen.findByText("Renews on Aug 1, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch in billing portal/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose this plan/i })).not.toBeInTheDocument();
  });

  it("opens the billing portal for active paid plan changes", async () => {
    const user = userEvent.setup();
    renderWithRouter(<BillingPage api={fakeApi({ portalStatus: 503, subscription: activeMonthlySubscription, switchStatus: 422 })} />, ["/app/billing"]);

    await user.click(await screen.findByRole("button", { name: /switch in billing portal/i }));

    expect(await screen.findByText("Billing is not configured in this environment.")).toBeInTheDocument();
    expect(screen.queryByText("You already have Pro Monthly enabled. Cancel it to choose Pro Yearly.")).not.toBeInTheDocument();
  });
  it("offers checkout for another paid plan after the current canceling plan ends", async () => {
    renderWithRouter(<BillingPage api={fakeApi({ subscription: cancelingProSubscription })} />, ["/app/billing"]);

    expect(await screen.findByRole("button", { name: /choose this plan/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch in billing portal/i })).not.toBeInTheDocument();
  });

  it("shows the upcoming paid plan after scheduled checkout", async () => {
    renderWithRouter(<BillingPage api={fakeApi({ subscription: cancelingWithUpcomingYearlySubscription })} />, ["/app/billing?checkout=scheduled"]);

    expect(await screen.findByText("Next plan: Pro Yearly starts on Aug 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText("Starts on Aug 1, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose this plan/i })).not.toBeInTheDocument();
  });

  it("shows reactivation actions when the current subscription is canceling", async () => {
    renderWithRouter(<BillingPage api={fakeApi({ subscription: cancelingProSubscription })} />, ["/app/billing"]);

    expect(await screen.findByText("Access ends on Aug 1, 2026")).toBeInTheDocument();
    expect(screen.getByText(/set to cancel at the end of this billing period/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /reactivate plan/i })).toHaveLength(2);
    expect(screen.queryByText(/renews on/i)).not.toBeInTheDocument();
  });

  it("shows a quiet note when billing is not configured", async () => {
    const user = userEvent.setup();
    renderWithRouter(<BillingPage api={fakeApi({ portalStatus: 503 })} />, ["/app/billing"]);

    await user.click(await screen.findByRole("button", { name: /manage billing/i }));

    expect(await screen.findByText("Billing is not configured in this environment.")).toBeInTheDocument();
  });

  it("shows a banner when returning from a scheduled checkout", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing?checkout=scheduled"]);

    expect(await screen.findByText(/new plan will start when your current billing period ends/i)).toBeInTheDocument();
  });

  it("shows a banner when returning from a successful checkout", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing?checkout=success"]);

    expect(await screen.findByText(/payment complete/i)).toBeInTheDocument();
  });

  it("shows a banner when checkout was cancelled", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing?checkout=canceled"]);

    expect(await screen.findByText(/checkout was cancelled/i)).toBeInTheDocument();
  });
});

