import { FileText, RefreshCw, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { DocumentSummary, FolderSummary } from "../../types";
import { documentStatusLabel, formatDate, formatFileSize, isProcessingStatus } from "./status";

interface DocumentLibraryProps {
  documents: DocumentSummary[];
  folders?: FolderSummary[];
  onOpen?: (documentId: string) => void;
  onDelete?: (documentId: string) => void;
  onRetry?: (documentId: string) => void;
  onMove?: (documentId: string, folderId: string | null) => void;
  compact?: boolean;
  isLoading?: boolean;
}

export function DocumentLibrary({ documents, folders, onOpen, onDelete, onRetry, onMove, compact = false, isLoading = false }: DocumentLibraryProps) {
  const table = (
    <div className="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-panel">
      <div className="hidden grid-cols-[minmax(220px,1.4fr)_150px_120px_130px_180px] gap-4 border-b border-teal-100 bg-teal-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 md:grid">
        <span>File</span>
        <span>Status</span>
        <span>Pages</span>
        <span>Size</span>
        <span>Actions</span>
      </div>
      <ul className="divide-y divide-slate-200">
        {documents.map((document) => (
          <li
            key={document.id}
            className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(220px,1.4fr)_150px_120px_130px_180px] md:items-center"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-sea">
                  <FileText size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{document.originalFilename}</p>
                  <p className="text-sm text-slate-500">
                    Uploaded {formatDate(document.createdAt)} - Last opened {formatDate(document.lastOpenedAt)}
                  </p>
                </div>
              </div>
            </div>

            <StatusPill document={document} />
            <p className="text-sm text-slate-600">{document.pageCount ? `${document.pageCount} pages` : "Pages pending"}</p>
            <p className="text-sm text-slate-600">{formatFileSize(document.fileSizeBytes)}</p>

            <div className="flex flex-wrap gap-2">
              {onMove && folders ? (
                <select
                  aria-label={`Move ${document.originalFilename} to folder`}
                  value={document.folderId ?? ""}
                  disabled={document.status === "deleting"}
                  onChange={(event) => onMove(document.id, event.target.value || null)}
                  className="min-h-10 rounded-md border border-teal-100 bg-white px-2 text-sm font-medium text-ink hover:border-sea disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Library</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => onOpen?.(document.id)}
                disabled={document.status === "deleting"}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-100 px-3 text-sm font-medium text-ink hover:border-sea hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Open
              </button>
              {document.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => onRetry?.(document.id)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-100 px-3 text-sm font-medium text-ink hover:border-sea hover:bg-teal-50"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDelete?.(document.id)}
                disabled={document.status === "deleting"}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  if (compact) {
    return table;
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Library</p>
          <h1 className="text-3xl font-semibold text-ink">Documents</h1>
        </div>
        <p className="text-sm text-slate-600">{isLoading ? "Loading documents..." : `${documents.length} documents in your workspace`}</p>
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading documents"
          className="flex min-h-64 items-center justify-center rounded-lg border border-teal-100 bg-white shadow-panel"
        >
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Loader2 size={16} className="animate-spin text-sea" aria-hidden="true" />
            Loading documents...
          </p>
        </div>
      ) : documents.length === 0 ? (
        <div className="brand-soft-surface rounded-lg border border-dashed border-teal-200 p-8 text-center shadow-panel">
          <h2 className="text-xl font-semibold text-ink">No PDFs yet</h2>
          <p className="mt-2 text-sm text-slate-600">Upload a text-based PDF to start asking grounded questions.</p>
        </div>
      ) : (
        table
      )}
    </section>
  );
}

function StatusPill({ document }: { document: DocumentSummary }) {
  const label = documentStatusLabel(document.status);
  const tone =
    document.status === "ready"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : document.status === "failed"
        ? "bg-red-50 text-red-700 border-red-200"
        : document.status === "deleting"
          ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
      {document.failureMessage ? <p className="mt-2 max-w-xs text-xs leading-5 text-slate-600">{document.failureMessage}</p> : null}
      {isProcessingStatus(document.status) ? <p className="mt-2 text-xs text-slate-500">Processing may take a minute for longer PDFs.</p> : null}
    </div>
  );
}
