import { ApiClient } from "./client";
import { mapChatSummary } from "./chats";
import { BillingPlan, DashboardData, PlanInterval, SubscriptionSummary, UsageSummary } from "../types";

interface BackendPlan {
  id: string;
  name: string;
  interval: PlanInterval;
  limit_ai_messages: number;
  limit_uploads: number;
  limit_storage_mb: number;
  limit_document_scope: number;
  allowed_chat_models: string[] | null;
}

interface BackendUpcomingSubscription {
  plan: { id: string; name: string; interval: PlanInterval };
  status: string;
  starts_at: string | null;
}

interface BackendSubscriptionSummary {
  plan: { id: string; name: string; interval: PlanInterval };
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  upcoming_subscription?: BackendUpcomingSubscription | null;
}

interface BackendUsageSummary {
  plan: { id: string; name: string };
  period_start: string;
  period_end: string;
  ai_messages: { used: number; limit: number };
  uploads: { used: number; limit: number };
  storage_mb: { used: number; limit: number };
}

interface BackendDashboard {
  subscription: BackendSubscriptionSummary;
  usage: BackendUsageSummary;
  documents: {
    total: number;
    by_status: Record<string, number>;
    by_format: Record<string, number>;
    storage_bytes: number;
  };
  recent_conversations: Array<Parameters<typeof mapChatSummary>[0]>;
  recent_activity: Array<{ type: string; id: string; label: string; timestamp: string }>;
}

function mapPlan(plan: BackendPlan): BillingPlan {
  return {
    id: plan.id,
    name: plan.name,
    interval: plan.interval,
    limitAiMessages: plan.limit_ai_messages,
    limitUploads: plan.limit_uploads,
    limitStorageMb: plan.limit_storage_mb,
    limitDocumentScope: plan.limit_document_scope,
    allowedChatModels: plan.allowed_chat_models
  };
}

function mapSubscriptionSummary(summary: BackendSubscriptionSummary): SubscriptionSummary {
  return {
    plan: summary.plan,
    status: summary.status,
    currentPeriodEnd: summary.current_period_end,
    cancelAtPeriodEnd: summary.cancel_at_period_end,
    upcomingSubscription: summary.upcoming_subscription
      ? {
          plan: summary.upcoming_subscription.plan,
          status: summary.upcoming_subscription.status,
          startsAt: summary.upcoming_subscription.starts_at
        }
      : null
  };
}


function mapUsageSummary(usage: BackendUsageSummary): UsageSummary {
  return {
    plan: usage.plan,
    periodStart: usage.period_start,
    periodEnd: usage.period_end,
    aiMessages: usage.ai_messages,
    uploads: usage.uploads,
    storageMb: usage.storage_mb
  };
}

export async function getPlans(client: ApiClient): Promise<BillingPlan[]> {
  const response = await client.request<{ items: BackendPlan[] }>("/api/billing/plans");
  return response.items.map(mapPlan);
}

export async function getBillingMe(client: ApiClient): Promise<SubscriptionSummary> {
  const response = await client.request<BackendSubscriptionSummary>("/api/billing/me");
  return mapSubscriptionSummary(response);
}

export async function createCheckoutSession(client: ApiClient, planId: string): Promise<string> {
  const response = await client.request<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId })
  });
  return response.url;
}

export async function schedulePlanSwitch(client: ApiClient, planId: string): Promise<string> {
  const response = await client.request<{ url: string }>("/api/billing/schedule-switch", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId })
  });
  return response.url;
}

export async function switchPlan(client: ApiClient, planId: string): Promise<string> {
  const response = await client.request<{ url: string }>("/api/billing/switch", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId })
  });
  return response.url;
}
export async function createPortalSession(client: ApiClient): Promise<string> {
  const response = await client.request<{ url: string }>("/api/billing/portal", {
    method: "POST"
  });
  return response.url;
}

export async function getUsage(client: ApiClient): Promise<UsageSummary> {
  const response = await client.request<BackendUsageSummary>("/api/usage");
  return mapUsageSummary(response);
}

export async function getDashboard(client: ApiClient): Promise<DashboardData> {
  const response = await client.request<BackendDashboard>("/api/dashboard");
  return {
    subscription: mapSubscriptionSummary(response.subscription),
    usage: mapUsageSummary(response.usage),
    documents: {
      total: response.documents.total,
      byStatus: response.documents.by_status,
      byFormat: response.documents.by_format,
      storageBytes: response.documents.storage_bytes
    },
    recentConversations: response.recent_conversations.map(mapChatSummary),
    recentActivity: response.recent_activity
  };
}
