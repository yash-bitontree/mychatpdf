import { useEffect, useState } from "react";
import { Activity, ArrowRight, FileText, MessageCircle, MessagesSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiClient, LimitExceededError } from "../../api/client";
import { getDashboard } from "../../api/billing";
import { ActivityItem, ChatSummary, DashboardData } from "../../types";
import { chatTitle } from "../chats/ChatHistory";
import { formatDate, formatFileSize } from "../documents/status";
import { LimitExceededNotice } from "../billing/LimitExceededNotice";
import { UsageMeters } from "../billing/UsageMeter";
import { UploadDropzone } from "../upload/UploadDropzone";

interface DashboardPageProps {
  api: ApiClient | null;
  onUploadFile: (file: File) => Promise<void>;
  onOpenChat: (chat: ChatSummary) => void;
}

const supportedFlow = [
  {
    title: "Preview the PDF",
    text: "Open the uploaded file inside the workspace.",
    icon: <FileText size={18} aria-hidden="true" />
  },
  {
    title: "Ask grounded questions",
    text: "Chat answers use retrieved text from this document.",
    icon: <MessageCircle size={18} aria-hidden="true" />
  },
  {
    title: "Jump to cited pages",
    text: "Inline page links take you back to the source page.",
    icon: <ArrowRight size={18} aria-hidden="true" />
  }
];

const FREE_PLAN_MAX_UPLOAD_MB = 20;
const PREMIUM_PLAN_MAX_UPLOAD_MB = 50;

const ACTIVITY_LABELS: Record<string, string> = {
  document_uploaded: "Document uploaded",
  conversation_updated: "Conversation updated",
  conversation_deleted: "Conversation deleted"
};

function activityTypeLabel(item: ActivityItem) {
  return ACTIVITY_LABELS[item.type] ?? "Activity";
}

export function DashboardPage({ api, onUploadFile, onOpenChat }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptedFile, setAcceptedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | LimitExceededError | null>(null);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    void getDashboard(api)
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Unable to load dashboard data right now.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handleAccepted(file: File) {
    setAcceptedFile(file);
    setUploadError(null);
    try {
      await onUploadFile(file);
    } catch (error) {
      setAcceptedFile(null);
      setUploadError(error instanceof LimitExceededError ? error : "Upload failed. Please try again.");
    }
  }

  const maxFileSizeMb = data?.subscription.plan.id !== "free" && data ? PREMIUM_PLAN_MAX_UPLOAD_MB : FREE_PLAN_MAX_UPLOAD_MB;

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_52%,#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="mx-auto w-full max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">Workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Chat with any <span className="text-sea">document</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Upload a PDF, DOCX, PPTX, TXT, or RTF file, ask questions, and jump back to cited sources from the answer.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.86fr)]">
            <UploadDropzone maxFileSizeMb={maxFileSizeMb} onAccepted={handleAccepted} initialProgress={72} />

            <div className="brand-soft-surface flex min-h-[280px] flex-col rounded-xl border border-teal-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Supported flow</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Upload once, chat with citations</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This workspace supports PDF, DOCX, PPTX, TXT, and RTF files with grounded chat and source-linked
                citations. PDF preview is built in.
              </p>
              <div className="mt-5 grid gap-3">
                {supportedFlow.map((item) => (
                  <div key={item.title} className="flex gap-3 rounded-lg border border-teal-100 bg-white p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sea">
                      {item.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-slate-600">{item.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {uploadError ? (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {typeof uploadError === "string" ? uploadError : <LimitExceededNotice error={uploadError} />}
            </div>
          ) : null}
          {acceptedFile && !uploadError ? (
            <div
              role="status"
              aria-label="Upload accepted"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <span className="font-semibold">{acceptedFile.name}</span> is uploaded. Opening your workspace...
            </div>
          ) : null}
        </section>

        {loadError ? (
          <p className="mx-auto w-full max-w-5xl rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Subscription</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink">{data.subscription.plan.name}</h2>
                {data.subscription.status ? (
                  <p className="mt-1 text-sm capitalize text-slate-600">
                    Status: {data.subscription.status.replace("_", " ")}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">No paid subscription.</p>
                )}
                {data.subscription.cancelAtPeriodEnd && data.subscription.currentPeriodEnd ? (
                  <p className="mt-1 text-sm text-amber-800">
                    Cancels on {formatDate(data.subscription.currentPeriodEnd)}.
                  </p>
                ) : null}
                <Link
                  to="/app/billing"
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-100 px-3 text-sm font-semibold text-ink transition hover:border-sea hover:bg-teal-50"
                >
                  Manage plan and billing
                </Link>
              </section>

              <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Usage this period</p>
                <div className="mt-4">
                  <UsageMeters usage={data.usage} />
                </div>
              </section>

              <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Documents</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink">
                  {data.documents.total} {data.documents.total === 1 ? "document" : "documents"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{formatFileSize(data.documents.storageBytes)} stored</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(data.documents.byStatus).map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                    >
                      {status}: {count}
                    </span>
                  ))}
                  {Object.entries(data.documents.byFormat).map(([format, count]) => (
                    <span
                      key={format}
                      className="inline-flex items-center rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-medium text-sea"
                    >
                      {format.toUpperCase()}: {count}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-sea">
                    <MessagesSquare size={20} aria-hidden="true" />
                  </span>
                  <h2 className="font-semibold text-ink">Recent conversations</h2>
                </div>
                {data.recentConversations.length ? (
                  <ul className="divide-y divide-slate-200">
                    {data.recentConversations.map((chat) => (
                      <li key={chat.id}>
                        <button
                          type="button"
                          onClick={() => onOpenChat(chat)}
                          className="grid w-full gap-1 px-1 py-3 text-left transition hover:bg-slate-50"
                        >
                          <span className="truncate font-medium text-ink">{chatTitle(chat)}</span>
                          <span className="truncate text-sm text-slate-500">
                            {chat.folder
                              ? `${chat.folder.name} folder`
                              : chat.documents.map((document) => document.originalFilename).join(", ") || "No documents"}
                            {" - "}
                            {formatDate(chat.updatedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">No conversations yet.</p>
                )}
              </section>

              <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-panel">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
                    <Activity size={20} aria-hidden="true" />
                  </span>
                  <h2 className="font-semibold text-ink">Recent activity</h2>
                </div>
                {data.recentActivity.length ? (
                  <ul className="divide-y divide-slate-200">
                    {data.recentActivity.map((item) => (
                      <li key={`${item.type}-${item.id}-${item.timestamp}`} className="grid gap-0.5 px-1 py-3">
                        <span className="truncate text-sm font-medium text-ink">{item.label}</span>
                        <span className="text-xs text-slate-500">
                          {activityTypeLabel(item)} - {formatDate(item.timestamp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">Nothing has happened yet.</p>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
