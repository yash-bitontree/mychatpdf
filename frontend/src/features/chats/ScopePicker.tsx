import { FormEvent, useState } from "react";
import { Loader2, MessagesSquare, X } from "lucide-react";
import { Link } from "react-router-dom";
import { DocumentSummary } from "../../types";

interface ScopePickerProps {
  documents: DocumentSummary[];
  isLoading?: boolean;
  isCreating?: boolean;
  maxDocumentScope?: number;
  onCreate?: (documentIds: string[], title?: string) => void;
}

export function ScopePicker({ documents, isLoading = false, isCreating = false, maxDocumentScope, onCreate }: ScopePickerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const overDocumentLimit = maxDocumentScope !== undefined && selectedIds.length > maxDocumentScope;
  const canCreate = selectedIds.length >= 1 && !overDocumentLimit && !isCreating;

  function toggleDocument(documentId: string) {
    setSelectedIds((current) => {
      if (current.includes(documentId)) {
        return current.filter((id) => id !== documentId);
      }
      if (maxDocumentScope !== undefined && current.length >= maxDocumentScope) {
        setIsUpgradeDialogOpen(true);
        return current;
      }
      return [...current, documentId];
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }
    const trimmedTitle = title.trim();
    onCreate?.(selectedIds, trimmedTitle || undefined);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">New conversation</p>
        <h1 className="text-3xl font-semibold text-ink">Pick documents</h1>
        <p className="mt-1 text-sm text-slate-600">Select the documents this conversation should answer from.</p>
      </div>

      {isLoading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading documents...
        </p>
      ) : documents.length === 0 ? (
        <div className="brand-soft-surface rounded-lg border border-dashed border-teal-200 p-8 text-center shadow-panel">
          <h2 className="text-xl font-semibold text-ink">No documents are ready yet</h2>
          <p className="mt-2 text-sm text-slate-600">Upload a document and wait for processing to finish, then start a conversation.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <fieldset className="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-panel">
            <legend className="sr-only">Documents to include</legend>
            <ul className="divide-y divide-slate-200">
              {documents.map((document) => {
                const isSelected = selectedIds.includes(document.id);
                return (
                  <li key={document.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-teal-50/50">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDocument(document.id)}
                        className="h-4 w-4 shrink-0 accent-sea"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{document.originalFilename}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {document.format ?? "pdf"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="scope-picker-title" className="block text-sm font-medium text-ink">
              Title (optional)
            </label>
            <input
              id="scope-picker-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={512}
              placeholder="Name this conversation..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {selectedIds.length} {selectedIds.length === 1 ? "document" : "documents"} selected
            </p>
            <button
              type="submit"
              disabled={!canCreate}
              className="brand-gradient inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
            >
              {isCreating ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <MessagesSquare size={16} aria-hidden="true" />
              )}
              Start conversation
            </button>
          </div>
        </form>
      )}

      {isUpgradeDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4"
          onClick={() => setIsUpgradeDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade for multi-document chat"
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Pro feature</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Chat across multiple documents</h2>
              </div>
              <button
                type="button"
                aria-label="Close upgrade dialog"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setIsUpgradeDialogOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Multi-document conversations are available on the Pro plan. Upgrade to compare files, summarize across
              sources, and keep one conversation grounded in multiple documents.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-ink hover:bg-slate-50"
                onClick={() => setIsUpgradeDialogOpen(false)}
              >
                Not now
              </button>
              <Link
                to="/app/billing"
                className="brand-gradient inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)]"
                onClick={() => setIsUpgradeDialogOpen(false)}
              >
                Upgrade your plan
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
