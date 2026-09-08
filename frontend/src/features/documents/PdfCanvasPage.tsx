import { type MouseEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfSelection } from "./PdfSelectionToolbar";
import { createPdfDiagnostic, formatPdfDiagnostic, reportPdfDiagnostic, type PdfDiagnostic } from "./pdfDiagnostics";
import {
  buildPdfTextBlocks,
  createPdfBlockKey,
  selectPdfTextBlock,
  type PdfTextBlock
} from "./pdfSelection";

type PageStatus = "idle" | "rendering" | "rendered" | "failed";
type RenderStage = "get-page" | "prepare-page" | "prepare-canvas" | "canvas-render" | "text-layer";

export const PAGE_RENDER_SCALE = 1.35;

const MAX_OUTPUT_SCALE = 2;
const APPROX_PAGE_WIDTH = 612;
const APPROX_PAGE_HEIGHT = 792;
const PAGE_OBSERVER_ROOT_MARGIN = "900px 0px";
const SOURCE_HIGHLIGHT_MIN_SCORE = 0.22;
const SOURCE_HIGHLIGHT_BEST_SCORE_RATIO = 0.65;
const SOURCE_HIGHLIGHT_MAX_BLOCKS = 6;
const SOURCE_HIGHLIGHT_MIN_SHARED_TOKENS = 2;
const SOURCE_TOKEN_MIN_LENGTH = 3;
const SOURCE_TOKEN_STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "that",
  "the",
  "this",
  "with"
]);

export function PdfCanvasPage({
  activeBlockKey,
  documentId,
  onBlockSelection,
  pdfDocument,
  pageNumber,
  scale,
  scrollRootRef,
  sourceHighlightText
}: {
  activeBlockKey?: string;
  documentId: string;
  onBlockSelection: (selection: PdfSelection) => void;
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  scrollRootRef: RefObject<HTMLElement>;
  sourceHighlightText?: string;
}) {
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);
  const [status, setStatus] = useState<PageStatus>("idle");
  const [pageSize, setPageSize] = useState({ width: APPROX_PAGE_WIDTH * scale, height: APPROX_PAGE_HEIGHT * scale });
  const [renderIssue, setRenderIssue] = useState<PdfDiagnostic | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [textBlocks, setTextBlocks] = useState<PdfTextBlock[]>([]);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const sourceHighlightBlockIds = useMemo(
    () => findSourceHighlightBlockIds(textBlocks, sourceHighlightText),
    [sourceHighlightText, textBlocks]
  );

  useEffect(() => {
    setPageSize({
      width: Math.round(APPROX_PAGE_WIDTH * scale),
      height: Math.round(APPROX_PAGE_HEIGHT * scale)
    });
  }, [scale]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const scrollRoot = scrollRootRef.current;

    if (shouldRender || !wrapper || !scrollRoot || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: PAGE_OBSERVER_ROOT_MARGIN }
    );

    observer.observe(wrapper);

    return () => observer.disconnect();
  }, [scrollRootRef, shouldRender]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    let stage: RenderStage = "get-page";

    async function renderPage() {
      setStatus("rendering");
      setRenderIssue(null);
      setTextBlocks([]);
      setHoveredBlockId(null);

      try {
        stage = "get-page";
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        stage = "prepare-page";
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
        const canvasLayer = canvasLayerRef.current;
        const textLayerContainer = textLayerRef.current;

        if (!canvasLayer || !textLayerContainer) {
          const issue = buildPageDiagnostic({
            documentId,
            pdfDocument,
            pageNumber,
            retryVersion,
            scale,
            stage: "prepare-canvas",
            message: "PDF page render target was not available.",
            details: {
              hasCanvasLayer: Boolean(canvasLayer),
              hasTextLayer: Boolean(textLayerContainer)
            }
          });
          setRenderIssue(issue);
          reportPdfDiagnostic(issue);
          setStatus("failed");
          return;
        }

        stage = "prepare-canvas";
        const width = Math.floor(viewport.width);
        const height = Math.floor(viewport.height);
        setPageSize({ width, height });

        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-label", `Rendered PDF page ${pageNumber}`);
        canvas.className = "block bg-white";
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvasLayer.replaceChildren(canvas);
        canvasLayer.style.width = `${width}px`;
        canvasLayer.style.height = `${height}px`;

        textLayerContainer.replaceChildren();
        textLayerContainer.style.width = `${width}px`;
        textLayerContainer.style.height = `${height}px`;
        textLayerContainer.style.setProperty("--total-scale-factor", `${scale}`);

        stage = "canvas-render";
        renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        });

        void page
          .getTextContent()
          .then((textContent) => {
            if (cancelled) {
              return undefined;
            }

            textLayer = new TextLayer({
              textContentSource: textContent,
              container: textLayerContainer,
              viewport
            });
            return textLayer.render();
          })
          .then(() => {
            if (!cancelled) {
              setTextBlocks(buildPdfTextBlocks(textLayerContainer));
            }
          })
          .catch((error: unknown) => {
            reportPdfDiagnostic(
              buildPageDiagnostic({
                documentId,
                pdfDocument,
                pageNumber,
                retryVersion,
                scale,
                stage: "text-layer",
                level: "warn",
                message: "PDF text layer failed, but canvas rendering can continue.",
                error
              })
            );
            return undefined;
          });

        await renderTask.promise;

        if (!cancelled) {
          setStatus("rendered");
        }
      } catch (error) {
        if (cancelled || isRenderingCancelled(error)) {
          return;
        }

        const issue = buildPageDiagnostic({
          documentId,
          pdfDocument,
          pageNumber,
          retryVersion,
          scale,
          stage,
          message: "PDF page canvas render failed.",
          error
        });
        setRenderIssue(issue);
        reportPdfDiagnostic(issue);
        setStatus("failed");
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pageNumber, pdfDocument, retryVersion, scale, shouldRender]);

  function getBlockIdAtPoint(clientX: number, clientY: number) {
    const textLayer = textLayerRef.current;
    if (!textLayer) {
      return null;
    }

    const layerRect = textLayer.getBoundingClientRect();
    const x = clientX - layerRect.left;
    const y = clientY - layerRect.top;
    const matchingBlocks = textBlocks.filter(
      (block) => x >= block.left && x <= block.left + block.width && y >= block.top && y <= block.top + block.height
    );

    if (matchingBlocks.length === 0) {
      return null;
    }

    matchingBlocks.sort((left, right) => left.width * left.height - right.width * right.height);
    return matchingBlocks[0].id;
  }

  function getBlockIdFromEvent(event: MouseEvent<HTMLDivElement>) {
    const targetBlock =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-pdf-block-id]")?.dataset.pdfBlockId ?? null : null;

    return targetBlock ?? getBlockIdAtPoint(event.clientX, event.clientY);
  }

  function onTextLayerPointerDown(event: MouseEvent<HTMLDivElement>) {
    pointerStartRef.current = getBlockIdFromEvent(event) ? { x: event.clientX, y: event.clientY } : null;
  }

  function onTextLayerMouseMove(event: MouseEvent<HTMLDivElement>) {
    setHoveredBlockId(getBlockIdFromEvent(event));
  }

  function onTextLayerClick(event: MouseEvent<HTMLDivElement>) {
    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;

    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) {
      return;
    }

    const blockId = getBlockIdFromEvent(event);
    if (!blockId) {
      return;
    }

    const selectedBlock = selectPdfTextBlock(textLayerRef.current, blockId, pageNumber, createPdfBlockKey(documentId, pageNumber, blockId));
    if (selectedBlock) {
      event.stopPropagation();
      onBlockSelection(selectedBlock);
    }
  }

  return (
    <div ref={wrapperRef} className="relative overflow-hidden rounded bg-white" style={{ width: pageSize.width, height: pageSize.height }}>
      <div ref={canvasLayerRef} />
      <div className="pdf-text-block-overlays" aria-hidden="true">
        {textBlocks.map((block) => {
          const isActive = activeBlockKey === createPdfBlockKey(documentId, pageNumber, block.id);
          const isHovered = hoveredBlockId === block.id;
          const isSourceHighlight = sourceHighlightBlockIds.has(block.id);

          if (!isActive && !isHovered && !isSourceHighlight) {
            return null;
          }

          return (
            <div
              key={block.id}
              className="pdf-text-block-overlay"
              data-state={isActive ? "active" : isHovered ? "hover" : "source"}
              style={{
                height: block.height,
                left: block.left,
                top: block.top,
                width: block.width
              }}
            />
          );
        })}
      </div>
      <div
        ref={textLayerRef}
        className="pdf-text-layer"
        data-pdf-text-layer="true"
        onClick={onTextLayerClick}
        onMouseDown={onTextLayerPointerDown}
        onMouseLeave={() => setHoveredBlockId(null)}
        onMouseMove={onTextLayerMouseMove}
      />
      {status !== "rendered" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white">
          {status === "failed" ? (
            <div
              role="alert"
              className="pointer-events-auto mx-6 max-w-sm rounded-md border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900"
            >
              <p className="font-semibold">This page could not be rendered.</p>
              {renderIssue ? (
                <details className="mt-2 text-left text-xs">
                  <summary className="cursor-pointer font-semibold">Debug details</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/80 p-2 text-[11px] leading-4 text-amber-950">
                    {formatPdfDiagnostic(renderIssue)}
                  </pre>
                </details>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setRenderIssue(null);
                  setShouldRender(true);
                  setRetryVersion((current) => current + 1);
                }}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-medium text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Retry page
              </button>
            </div>
          ) : (
            <PageShell scale={scale} status={status === "idle" ? "idle" : "rendering"} />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PageShell({ scale }: { scale: number; status?: Exclude<PageStatus, "rendered" | "failed"> }) {
  const width = Math.round(APPROX_PAGE_WIDTH * scale);
  const height = Math.round(APPROX_PAGE_HEIGHT * scale);

  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full flex-col justify-start gap-4 bg-white p-8"
      style={{ width, height }}
    >
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-11/12 animate-pulse rounded bg-slate-100" />
      <div className="h-4 w-10/12 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-28 animate-pulse rounded bg-slate-100" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-16 animate-pulse rounded bg-slate-100" />
        <div className="h-16 animate-pulse rounded bg-slate-100" />
        <div className="h-16 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function isRenderingCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function buildPageDiagnostic({
  details,
  documentId,
  error,
  level = "error",
  message,
  pageNumber,
  pdfDocument,
  retryVersion,
  scale,
  stage
}: {
  details?: Record<string, unknown>;
  documentId: string;
  error?: unknown;
  level?: PdfDiagnostic["level"];
  message: string;
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  retryVersion: number;
  scale: number;
  stage: RenderStage;
}) {
  return createPdfDiagnostic({
    area: stage === "text-layer" ? "text-layer" : "page-render",
    details,
    documentId,
    error,
    fingerprint: pdfDocument.fingerprints?.[0] ?? undefined,
    level,
    message,
    pageNumber,
    retryVersion,
    scale,
    stage
  });
}

function findSourceHighlightBlockIds(blocks: PdfTextBlock[], sourceText?: string) {
  if (!sourceText || blocks.length === 0) {
    return new Set<string>();
  }

  const normalizedSource = normalizeForSourceMatch(sourceText);
  const sourceTokens = tokenizeForSourceMatch(sourceText);
  if (!normalizedSource || sourceTokens.size === 0) {
    return new Set<string>();
  }

  const scoredBlocks = blocks
    .map((block) => ({
      id: block.id,
      score: scoreSourceBlock(block.text, normalizedSource, sourceTokens)
    }))
    .filter((block) => block.score >= SOURCE_HIGHLIGHT_MIN_SCORE)
    .sort((left, right) => right.score - left.score);

  const bestScore = scoredBlocks[0]?.score ?? 0;
  if (bestScore <= 0) {
    return new Set<string>();
  }

  const scoreCutoff = Math.max(SOURCE_HIGHLIGHT_MIN_SCORE, bestScore * SOURCE_HIGHLIGHT_BEST_SCORE_RATIO);
  return new Set(
    scoredBlocks
      .filter((block) => block.score >= scoreCutoff)
      .slice(0, SOURCE_HIGHLIGHT_MAX_BLOCKS)
      .map((block) => block.id)
  );
}

function scoreSourceBlock(blockText: string, normalizedSource: string, sourceTokens: Set<string>) {
  const normalizedBlock = normalizeForSourceMatch(blockText);
  if (!normalizedBlock) {
    return 0;
  }

  if (normalizedSource.includes(normalizedBlock) || normalizedBlock.includes(normalizedSource)) {
    return 1;
  }

  const blockTokens = tokenizeForSourceMatch(blockText);
  if (blockTokens.size === 0) {
    return 0;
  }

  let sharedTokens = 0;
  blockTokens.forEach((token) => {
    if (sourceTokens.has(token)) {
      sharedTokens += 1;
    }
  });

  if (sharedTokens < SOURCE_HIGHLIGHT_MIN_SHARED_TOKENS) {
    return 0;
  }

  return sharedTokens / Math.min(blockTokens.size, sourceTokens.size);
}

function tokenizeForSourceMatch(text: string) {
  return new Set(
    normalizeForSourceMatch(text)
      .split(" ")
      .filter((token) => token.length >= SOURCE_TOKEN_MIN_LENGTH && !SOURCE_TOKEN_STOP_WORDS.has(token))
  );
}

function normalizeForSourceMatch(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
