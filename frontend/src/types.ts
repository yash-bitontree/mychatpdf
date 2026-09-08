export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "indexing"
  | "ready"
  | "failed"
  | "deleting";

export type DocumentFormat = "pdf" | "docx" | "pptx" | "txt" | "rtf";

export interface DocumentSummary {
  id: string;
  folderId?: string;
  originalFilename: string;
  format?: DocumentFormat;
  status: DocumentStatus;
  fileSizeBytes: number;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  processedAt?: string;
  lastOpenedAt?: string;
  failureMessage?: string;
}

export interface FolderSummary {
  id: string;
  name: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  sourceId: string;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
  score?: number;
  documentId?: string;
  documentFilename?: string;
}

export interface ChatDocumentRef {
  id: string;
  originalFilename: string;
  format?: DocumentFormat;
}

export type ChatModelTier = "fast" | "quality";

export interface ChatSummary {
  id: string;
  title: string | null;
  // "fast" | "quality" tier, a legacy raw model id, or null.
  model?: string | null;
  documents: ChatDocumentRef[];
  folder?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  sources?: Citation[];
}

export interface WorkspaceDocument extends DocumentSummary {
  signedPdfUrl?: string;
  pdfHttpHeaders?: Record<string, string>;
}

export type PlanInterval = "month" | "year" | null;

export interface BillingPlan {
  id: string;
  name: string;
  interval: PlanInterval;
  limitAiMessages: number;
  limitUploads: number;
  limitStorageMb: number;
  limitDocumentScope: number;
  allowedChatModels: string[] | null;
}

export interface UpcomingSubscriptionSummary {
  plan: { id: string; name: string; interval: PlanInterval };
  status: string;
  startsAt: string | null;
}

export interface SubscriptionSummary {
  plan: { id: string; name: string; interval: PlanInterval };
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  upcomingSubscription: UpcomingSubscriptionSummary | null;
}
export interface UsageQuota {
  used: number;
  limit: number;
}

export interface UsageSummary {
  plan: { id: string; name: string };
  periodStart: string;
  periodEnd: string;
  aiMessages: UsageQuota;
  uploads: UsageQuota;
  storageMb: UsageQuota;
}

export interface ActivityItem {
  type: string;
  id: string;
  label: string;
  timestamp: string;
}

export interface DashboardData {
  subscription: SubscriptionSummary;
  usage: UsageSummary;
  documents: {
    total: number;
    byStatus: Record<string, number>;
    byFormat: Record<string, number>;
    storageBytes: number;
  };
  recentConversations: ChatSummary[];
  recentActivity: ActivityItem[];
}
