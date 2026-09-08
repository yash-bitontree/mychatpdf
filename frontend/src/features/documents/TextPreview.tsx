import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { ApiClient } from "../../api/client";
import { DocumentPage, getDocumentPages } from "../../api/documents";
import { Citation, DocumentFormat, WorkspaceDocument } from "../../types";
import { citationPageLabel } from "./status";

interface TextPreviewProps {
  api: ApiClient | null;
  document: WorkspaceDocument;
  activePage: number;
  scrollRequestId: number;
  activeSource?: Citation;
  onTotalPagesChange?: (pageCount: number) => void;
}

function sectionHeading(format: DocumentFormat, pageNumber: number) {
  const label = citationPageLabel(format, pageNumber, pageNumber);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function TextPreview({
  api,
  document,
  activePage,
  scrollRequestId,
  activeSource,
  onTotalPagesChange
}: TextPreviewProps) {
  const [pages, setPages] = useState<DocumentPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const format = document.format ?? "docx";
  const isReady = document.status === "ready";

  useEffect(() => {
    if (!api || !isReady) {
      return;
    }

    let cancelled = false;
    setError(null);
    void getDocumentPages(api, document.id)
      .then((nextPages) => {
        if (cancelled) {
          return;
        }
        setPages(nextPages);
        if (nextPages.length > 0) {
          onTotalPagesChange?.(nextPages.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Preview is not available right now.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, document.id, isReady, onTotalPagesChange]);

  const targetPage = useMemo(() => {
    if (activeSource) {
      return activeSource.pageStart;
    }
    return activePage;
  }, [activePage, activeSource]);

  useEffect(() => {
    if (!pages || pages.length === 0) {
      return;
    }
    const card = cardRefs.current.get(targetPage);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pages, scrollRequestId, targetPage]);

  if (!isReady) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-slate-100 p-6 text-sm text-slate-600">
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <Loader2 size={16} className="animate-spin text-sea" aria-hidden="true" />
          Preparing preview...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-slate-100 p-6">
        <p role="alert" className="max-w-sm rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (pages === null) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-slate-100 text-sm text-slate-600">
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <Loader2 size={16} className="animate-spin text-sea" aria-hidden="true" />
          Loading preview...
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-sea">
            <FileText size={22} aria-hidden="true" />
          </span>
          <p className="mt-3 truncate text-sm font-semibold text-ink" title={document.originalFilename}>
            {document.originalFilename}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">No extracted text was found in this document.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-soft h-full min-h-0 overflow-y-auto bg-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {pages.map((page) => {
          const isActive = page.pageNumber === targetPage;
          return (
            <article
              key={page.pageNumber}
              ref={(node) => {
                if (node) {
                  cardRefs.current.set(page.pageNumber, node);
                } else {
                  cardRefs.current.delete(page.pageNumber);
                }
              }}
              aria-label={sectionHeading(format, page.pageNumber)}
              className={`rounded-lg border bg-white shadow-sm transition ${
                isActive ? "border-sea ring-2 ring-teal-100" : "border-slate-200"
              }`}
            >
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sea">
                  {sectionHeading(format, page.pageNumber)}
                </p>
                <p className="text-xs text-slate-500">
                  {page.pageNumber} of {pages.length}
                </p>
              </header>
              <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-ink">
                {page.text || <span className="italic text-slate-400">No text on this section.</span>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
