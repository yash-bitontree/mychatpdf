import { useEffect, useMemo, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Citation, WorkspaceDocument } from "../../types";
import { PAGE_RENDER_SCALE, PageShell, PdfCanvasPage } from "./PdfCanvasPage";
import {
  PdfSelectionToolbar,
  type PdfSelection,
  type PdfSelectionAction,
  type PdfSelectionCopyStatus
} from "./PdfSelectionToolbar";
import { PdfViewerControls } from "./PdfViewerControls";
import { NativePdfPreview, PdfLoadFailure, PdfOpeningNotice, PdfPreviewSkeleton } from "./PdfViewerStates";
import { createPdfDiagnostic, reportPdfDiagnostic } from "./pdfDiagnostics";
import { clampPage, createNativePdfUrl, readPdfSelection } from "./pdfSelection";
import { isProcessingStatus } from "./status";
import { usePdfPageScroll } from "./usePdfPageScroll";

// The query keeps the worker cache key independent from past server MIME
// configuration, so clients that cached a rejected module recover immediately.
pdfjs.GlobalWorkerOptions.workerSrc = `${workerSrc}?module=1`;

interface PdfViewerProps {
  document: WorkspaceDocument;
  activePage: number;
  totalPages: number;
  zoom: number;
  scrollRequestId: number;
  activeSource?: Citation;
  onPageChange: (page: number) => void;
  onTotalPagesChange?: (pageCount: number) => void;
  onVisiblePageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onSelectionAction?: (action: PdfSelectionAction, text: string, pageNumber: number) => void;
  isSelectionActionDisabled?: boolean;
}

type ViewerState = "idle" | "loading" | "loaded" | "failed";
type ViewerMode = "pdfjs" | "native";

const INITIAL_FIT_MIN_ZOOM = 40;
const INITIAL_FIT_MAX_ZOOM = 100;
const PDF_VIEWER_HORIZONTAL_CHROME_PX = 80;
const PREVIEW_READY_RETRY_MS = 2500;

export function PdfViewer({
  document,
  activePage,
  totalPages,
  zoom,
  scrollRequestId,
  activeSource,
  onPageChange,
  onTotalPagesChange,
  onVisiblePageChange,
  onZoomChange,
  onSelectionAction,
  isSelectionActionDisabled = false
}: PdfViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const [viewerMode, setViewerMode] = useState<ViewerMode>("pdfjs");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [copyStatus, setCopyStatus] = useState<PdfSelectionCopyStatus>("idle");
  const [fitZoomDocumentUrl, setFitZoomDocumentUrl] = useState<string | null>(null);

  const resolvedTotalPages = Math.max(1, pdfDocument?.numPages ?? totalPages);
  const currentPage = clampPage(activePage, resolvedTotalPages);
  const canUseNativePreview = !document.pdfHttpHeaders || Object.keys(document.pdfHttpHeaders).length === 0;
  const isPreviewPreparing = isProcessingStatus(document.status);
  const scale = useMemo(() => (zoom / 100) * PAGE_RENDER_SCALE, [zoom]);
  const { prepareForScaleChange, resetScrollKey, scrollContainerRef, setPageRef } = usePdfPageScroll({
    currentPage,
    documentUrl: document.signedPdfUrl,
    isEnabled: viewerMode === "pdfjs" && viewerState === "loaded",
    observerKey: pdfDocument,
    scale,
    scrollRequestId,
    onVisiblePageChange
  });
  const nativePreviewUrl = useMemo(
    () =>
      document.signedPdfUrl && canUseNativePreview
        ? createNativePdfUrl(document.signedPdfUrl, currentPage, zoom, scrollRequestId)
        : undefined,
    [canUseNativePreview, currentPage, document.signedPdfUrl, scrollRequestId, zoom]
  );

  useEffect(() => {
    if (!document.signedPdfUrl) {
      setPdfDocument(null);
      setViewerState("idle");
      setLoadError(null);
      setViewerMode("pdfjs");
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    const loadingTask = pdfjs.getDocument({
      url: document.signedPdfUrl,
      httpHeaders: document.pdfHttpHeaders,
      disableAutoFetch: false,
      disableStream: false,
      useSystemFonts: true
    });

    setViewerMode("pdfjs");
    setViewerState("loading");
    setLoadError(null);
    setPdfDocument(null);
    resetScrollKey();

    loadingTask.promise
      .then((loadedDocument) => {
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }

        setPdfDocument(loadedDocument);
        setViewerState("loaded");
        onTotalPagesChange?.(loadedDocument.numPages);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        const message = getErrorMessage(error);
        if (isPreviewPreparing) {
          setViewerState("loading");
          setLoadError(null);
          retryTimer = window.setTimeout(() => setReloadVersion((current) => current + 1), PREVIEW_READY_RETRY_MS);
          return;
        }

        setViewerState("failed");
        setLoadError(message);
        reportPdfDiagnostic(
          createPdfDiagnostic({
            area: "document-load",
            documentId: document.id,
            error,
            level: "error",
            message,
            stage: "get-document"
          })
        );
      });

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      void loadingTask.destroy();
      setPdfDocument(null);
    };
  }, [document.id, document.pdfHttpHeaders, document.signedPdfUrl, isPreviewPreparing, onTotalPagesChange, reloadVersion, resetScrollKey]);
  useEffect(() => {
    setFitZoomDocumentUrl(null);
  }, [document.signedPdfUrl]);

  useEffect(() => {
    if (!pdfDocument || viewerMode !== "pdfjs" || !document.signedPdfUrl || fitZoomDocumentUrl === document.signedPdfUrl) {
      return;
    }
    const loadedPdfDocument = pdfDocument;
    const signedPdfUrl = document.signedPdfUrl;
    let cancelled = false;

    async function fitInitialZoomToPane() {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }

      try {
        const firstPage = await loadedPdfDocument.getPage(1);
        if (cancelled) {
          return;
        }

        const viewport = firstPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, scrollContainer.clientWidth - PDF_VIEWER_HORIZONTAL_CHROME_PX);
        const fittedZoom = clampNumber(
          Math.floor((availableWidth / (viewport.width * PAGE_RENDER_SCALE)) * 100),
          INITIAL_FIT_MIN_ZOOM,
          INITIAL_FIT_MAX_ZOOM
        );

        setFitZoomDocumentUrl(signedPdfUrl);
        if (Math.abs(fittedZoom - zoom) > 1) {
          prepareForScaleChange();
          onZoomChange(fittedZoom);
        }
      } catch {
        setFitZoomDocumentUrl(signedPdfUrl);
      }
    }

    window.requestAnimationFrame(() => {
      void fitInitialZoomToPane();
    });

    return () => {
      cancelled = true;
    };
  }, [document.signedPdfUrl, fitZoomDocumentUrl, onZoomChange, pdfDocument, prepareForScaleChange, scrollContainerRef, viewerMode, zoom]);

  useEffect(() => {
    if (viewerMode === "native" && nativePreviewUrl) {
      setIsFrameLoading(true);
    }
  }, [nativePreviewUrl, viewerMode]);

  useEffect(() => {
    setSelection(null);
  }, [document.id]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [selection?.pageNumber, selection?.text]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const resetTimer = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(resetTimer);
  }, [copyStatus]);

  function openNativePreview() {
    setViewerMode("native");
    setIsFrameLoading(Boolean(nativePreviewUrl));
  }

  function retryPdfJs() {
    resetScrollKey();
    setViewerMode("pdfjs");
    setPdfDocument(null);
    setViewerState(document.signedPdfUrl ? "loading" : "idle");
    setLoadError(null);
    setReloadVersion((current) => current + 1);
  }

  function changeZoom(nextZoom: number) {
    if (nextZoom === zoom) {
      return;
    }

    if (viewerMode === "pdfjs") {
      prepareForScaleChange();
    }
    onZoomChange(nextZoom);
  }

  function captureSelection() {
    window.setTimeout(() => {
      const capturedSelection = readPdfSelection(scrollContainerRef.current, currentPage);
      setSelection((currentSelection) => {
        if (
          capturedSelection &&
          currentSelection?.blockKey &&
          normalizeSelectionText(capturedSelection.text) === normalizeSelectionText(currentSelection.text)
        ) {
          return { ...capturedSelection, blockKey: currentSelection.blockKey };
        }

        return capturedSelection;
      });
    }, 0);
  }

  function clearSelectionToolbar() {
    setSelection(null);
    setCopyStatus("idle");
  }

  function runSelectionAction(action: PdfSelectionAction) {
    if (!selection) {
      return;
    }

    onSelectionAction?.(action, selection.text, selection.pageNumber);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  async function copySelection() {
    if (!selection?.text) {
      return;
    }

    try {
      await writeClipboardText(selection.text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function selectTextBlock(nextSelection: PdfSelection) {
    setSelection(nextSelection);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PdfViewerControls
        currentPage={currentPage}
        totalPages={resolvedTotalPages}
        zoom={zoom}
        hasPdfUrl={Boolean(document.signedPdfUrl)}
        isNativeMode={viewerMode === "native"}
        canUseNativePreview={canUseNativePreview}
        onPageChange={onPageChange}
        onZoomChange={changeZoom}
        onToggleNativePreview={viewerMode === "native" ? retryPdfJs : openNativePreview}
      />

      {activeSource ? (
        <div className="shrink-0 border-b border-teal-100 bg-teal-50 px-4 py-2 text-xs leading-5 text-teal-900">
          Viewing cited source on page {activeSource.pageStart}
          {activeSource.pageEnd !== activeSource.pageStart ? `-${activeSource.pageEnd}` : ""}.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-slate-100">
        {viewerMode === "native" && nativePreviewUrl ? (
          <NativePdfPreview
            documentName={document.originalFilename}
            isLoading={isFrameLoading}
            previewUrl={nativePreviewUrl}
            onLoad={() => setIsFrameLoading(false)}
          />
        ) : !document.signedPdfUrl ? (
          <PdfPreviewSkeleton />
        ) : viewerState === "failed" ? (
          <PdfLoadFailure error={loadError} onRetry={retryPdfJs} onUseNative={canUseNativePreview ? openNativePreview : undefined} />
        ) : (
          <div
            ref={scrollContainerRef}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            onTouchEnd={captureSelection}
            onScroll={clearSelectionToolbar}
            className="scrollbar-soft h-full min-h-0 overflow-auto overscroll-contain bg-slate-100 px-4 py-5"
          >
            {selection ? (
              <PdfSelectionToolbar
                copyStatus={copyStatus}
                selection={selection}
                isDisabled={isSelectionActionDisabled || !onSelectionAction}
                onAction={runSelectionAction}
                onCopy={() => void copySelection()}
              />
            ) : null}
            {viewerState === "loading" ? <PdfOpeningNotice /> : null}
            <div className="mx-auto flex w-max min-w-full flex-col items-center gap-5">
              {Array.from({ length: resolvedTotalPages }, (_, index) => {
                const pageNumber = index + 1;

                return (
                  <section
                    key={pageNumber}
                    ref={(node) => setPageRef(pageNumber, node)}
                    data-page-number={pageNumber}
                    aria-label={`PDF page ${pageNumber}`}
                    className={`rounded-md border bg-white p-3 shadow-panel transition ${
                      pageNumber === currentPage ? "border-sea ring-1 ring-sea/20" : "border-slate-200"
                    }`}
                  >
                    {pdfDocument ? (
                      <PdfCanvasPage
                        activeBlockKey={selection?.blockKey}
                        documentId={document.id}
                        onBlockSelection={selectTextBlock}
                        pdfDocument={pdfDocument}
                        pageNumber={pageNumber}
                        scale={scale}
                        scrollRootRef={scrollContainerRef}
                        sourceHighlightText={isPageInSourceRange(pageNumber, activeSource) ? activeSource?.excerpt : undefined}
                      />
                    ) : (
                      <PageShell scale={scale} status="rendering" />
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.replace(/\bPDF\b/g, "preview file");
  }

  return "The document viewer could not read the preview file.";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSelectionText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isPageInSourceRange(pageNumber: number, source?: Citation) {
  return Boolean(source && pageNumber >= source.pageStart && pageNumber <= source.pageEnd);
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const didCopy = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!didCopy) {
    throw new Error("Clipboard copy failed.");
  }
}

