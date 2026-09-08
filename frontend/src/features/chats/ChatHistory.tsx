import { KeyboardEvent, useRef, useState } from "react";
import { Loader2, MessagesSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { ChatSummary } from "../../types";
import { formatDate } from "../documents/status";

interface ChatHistoryProps {
  chats: ChatSummary[];
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onOpen?: (chat: ChatSummary) => void;
  onRename?: (chatId: string, title: string) => void;
  onDelete?: (chatId: string) => void;
  onLoadMore?: () => void;
  onNew?: () => void;
}

export function chatTitle(chat: ChatSummary) {
  return chat.title?.trim() ? chat.title : "Untitled conversation";
}

export function ChatHistory({ chats, hasMore = false, isLoading = false, isLoadingMore = false, onOpen, onRename, onDelete, onLoadMore, onNew }: ChatHistoryProps) {
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const renameCommittedRef = useRef(false);

  function startRename(chat: ChatSummary) {
    renameCommittedRef.current = false;
    setConfirmingDeleteId(null);
    setRenamingChatId(chat.id);
    setRenameDraft(chat.title ?? "");
  }

  function commitRename(chatId: string) {
    if (renameCommittedRef.current) {
      return;
    }
    renameCommittedRef.current = true;
    setRenamingChatId(null);
    const title = renameDraft.trim();
    if (title) {
      onRename?.(chatId, title);
    }
  }

  function cancelRename() {
    renameCommittedRef.current = true;
    setRenamingChatId(null);
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>, chatId: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(chatId);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">History</p>
          <h1 className="text-3xl font-semibold text-ink">Conversations</h1>
          <p className="mt-1 text-sm text-slate-600">Pick up any conversation where you left off.</p>
        </div>
        {onNew ? (
          <button
            type="button"
            onClick={onNew}
            className="brand-gradient inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)]"
          >
            <Plus size={17} aria-hidden="true" />
            New conversation
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading conversations"
          className="flex min-h-64 items-center justify-center rounded-lg border border-teal-100 bg-white shadow-panel"
        >
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Loader2 size={16} className="animate-spin text-sea" aria-hidden="true" />
            Loading conversations...
          </p>
        </div>
      ) : chats.length === 0 ? (
        <div className="brand-soft-surface rounded-lg border border-dashed border-teal-200 p-8 text-center shadow-panel">
          <h2 className="text-xl font-semibold text-ink">No conversations yet</h2>
          <p className="mt-2 text-sm text-slate-600">Start a conversation across one or more documents, or open a document and ask questions.</p>
          {onNew ? (
            <button
              type="button"
              onClick={onNew}
              className="brand-gradient mt-4 inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)]"
            >
              <Plus size={17} aria-hidden="true" />
              New conversation
            </button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-panel">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_140px_190px] gap-4 border-b border-teal-100 bg-teal-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 md:grid">
            <span>Conversation</span>
            <span>Documents</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          <ul className="divide-y divide-slate-200">
            {chats.map((chat) => {
              const title = chatTitle(chat);
              const isRenaming = renamingChatId === chat.id;
              const isConfirmingDelete = confirmingDeleteId === chat.id;

              return (
                <li
                  key={chat.id}
                  className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_140px_190px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-sea">
                        <MessagesSquare size={20} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <input
                            autoFocus
                            aria-label={`Conversation title for ${title}`}
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => onRenameKeyDown(event, chat.id)}
                            onBlur={() => commitRename(chat.id)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpen?.(chat)}
                            aria-label={`Open ${title}`}
                            className="block w-full truncate text-left font-medium text-ink hover:text-sea"
                          >
                            {title}
                          </button>
                        )}
                        <p className="text-sm text-slate-500">Started {formatDate(chat.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  <p className="truncate text-sm text-slate-600">
                    {chat.documents.length
                      ? chat.documents.map((document) => document.originalFilename).join(", ")
                      : "No documents"}
                  </p>
                  <p className="text-sm text-slate-600">{formatDate(chat.updatedAt)}</p>

                  <div className="flex flex-wrap gap-2">
                    {isConfirmingDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingDeleteId(null);
                            onDelete?.(chat.id);
                          }}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-ink hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Rename ${title}`}
                          onClick={() => startRename(chat)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-100 px-3 text-sm font-medium text-ink hover:border-sea hover:bg-teal-50"
                        >
                          <Pencil size={16} aria-hidden="true" />
                          Rename
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${title}`}
                          onClick={() => {
                            cancelRename();
                            setConfirmingDeleteId(chat.id);
                          }}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="border-t border-slate-200 p-4 text-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-100 px-4 text-sm font-medium text-ink hover:border-sea hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
