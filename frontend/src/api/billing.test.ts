import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";
import { createCheckoutSession, createPortalSession, getBillingMe, getDashboard, getPlans, getUsage, switchPlan } from "./billing";

const backendPlan = {
  id: "pro_monthly",
  name: "Pro Monthly",
  interval: "month" as const,
  limit_ai_messages: 1000,
  limit_uploads: 100,
  limit_storage_mb: 2048,
  limit_document_scope: 10,
  allowed_chat_models: ["gpt-4.1-mini", "gpt-4.1"]
};

const backendSubscription = {
  plan: { id: "pro_monthly", name: "Pro Monthly", interval: "month" as const },
  status: "active",
  current_period_end: "2026-08-01T00:00:00Z",
  cancel_at_period_end: false
};

const backendUsage = {
  plan: { id: "pro_monthly", name: "Pro Monthly" },
  period_start: "2026-07-01T00:00:00Z",
  period_end: "2026-08-01T00:00:00Z",
  ai_messages: { used: 12, limit: 1000 },
  uploads: { used: 3, limit: 100 },
  storage_mb: { used: 25, limit: 2048 }
};

function jsonClient(payload: unknown, capture?: { url?: string; init?: RequestInit }) {
  return new ApiClient({
    fetcher: async (input, init) => {
      if (capture) {
        capture.url = String(input);
        capture.init = init;
      }
      return new Response(JSON.stringify(payload), { status: 200 });
    }
  });
}

describe("billing API helpers", () => {
  it("lists plans mapped to the frontend shape", async () => {
    const capture: { url?: string } = {};
    const client = jsonClient({ items: [backendPlan] }, capture);

    await expect(getPlans(client)).resolves.toEqual([
      {
        id: "pro_monthly",
        name: "Pro Monthly",
        interval: "month",
        limitAiMessages: 1000,
        limitUploads: 100,
        limitStorageMb: 2048,
        limitDocumentScope: 10,
        allowedChatModels: ["gpt-4.1-mini", "gpt-4.1"]
      }
    ]);
    expect(capture.url).toBe("/api/billing/plans");
  });

  it("gets the current subscription summary", async () => {
    const capture: { url?: string } = {};
    const client = jsonClient(backendSubscription, capture);

    await expect(getBillingMe(client)).resolves.toEqual({
      plan: { id: "pro_monthly", name: "Pro Monthly", interval: "month" },
      status: "active",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      upcomingSubscription: null
    });
    expect(capture.url).toBe("/api/billing/me");
  });

  it("creates a checkout session and returns the redirect url", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const client = jsonClient({ url: "https://checkout.stripe.test/session" }, capture);

    await expect(createCheckoutSession(client, "pro_monthly")).resolves.toBe("https://checkout.stripe.test/session");
    expect(capture.url).toBe("/api/billing/checkout");
    expect(capture.init?.method).toBe("POST");
    expect(capture.init?.body).toBe(JSON.stringify({ plan_id: "pro_monthly" }));
  });

  it("creates a targeted subscription switch session", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const client = jsonClient({ url: "https://portal.stripe.test/switch" }, capture);

    await expect(switchPlan(client, "pro_yearly")).resolves.toBe("https://portal.stripe.test/switch");
    expect(capture.url).toBe("/api/billing/switch");
    expect(capture.init?.method).toBe("POST");
    expect(capture.init?.body).toBe(JSON.stringify({ plan_id: "pro_yearly" }));
  });
  it("creates a portal session and returns the redirect url", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const client = jsonClient({ url: "https://portal.stripe.test/session" }, capture);

    await expect(createPortalSession(client)).resolves.toBe("https://portal.stripe.test/session");
    expect(capture.url).toBe("/api/billing/portal");
    expect(capture.init?.method).toBe("POST");
  });

  it("gets the usage summary", async () => {
    const capture: { url?: string } = {};
    const client = jsonClient(backendUsage, capture);

    await expect(getUsage(client)).resolves.toEqual({
      plan: { id: "pro_monthly", name: "Pro Monthly" },
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      aiMessages: { used: 12, limit: 1000 },
      uploads: { used: 3, limit: 100 },
      storageMb: { used: 25, limit: 2048 }
    });
    expect(capture.url).toBe("/api/usage");
  });

  it("gets the dashboard payload with mapped conversations", async () => {
    const capture: { url?: string } = {};
    const client = jsonClient(
      {
        subscription: backendSubscription,
        usage: backendUsage,
        documents: {
          total: 3,
          by_status: { ready: 2, failed: 1 },
          by_format: { pdf: 2, docx: 1 },
          storage_bytes: 2048
        },
        recent_conversations: [
          {
            id: "chat-1",
            title: "Quarterly numbers",
            documents: [{ id: "doc-1", original_filename: "paper.pdf", format: "pdf" }],
            created_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-02T00:00:00Z"
          }
        ],
        recent_activity: [
          { type: "document_uploaded", id: "doc-1", label: "paper.pdf", timestamp: "2026-07-01T00:00:00Z" }
        ]
      },
      capture
    );

    const dashboard = await getDashboard(client);
    expect(capture.url).toBe("/api/dashboard");
    expect(dashboard.documents).toEqual({
      total: 3,
      byStatus: { ready: 2, failed: 1 },
      byFormat: { pdf: 2, docx: 1 },
      storageBytes: 2048
    });
    expect(dashboard.recentConversations).toEqual([
      {
        id: "chat-1",
        title: "Quarterly numbers",
        documents: [{ id: "doc-1", originalFilename: "paper.pdf", format: "pdf" }],
        folder: null,
        model: null,
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z"
      }
    ]);
    expect(dashboard.recentActivity).toEqual([
      { type: "document_uploaded", id: "doc-1", label: "paper.pdf", timestamp: "2026-07-01T00:00:00Z" }
    ]);
  });
});
