import { ChevronLeft, ChevronRight, FileSearch, Minus, Plus } from "lucide-react";

interface PdfViewerControlsProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  hasPdfUrl: boolean;
  isNativeMode: boolean;
  canUseNativePreview: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onToggleNativePreview: () => void;
}

const MIN_ZOOM = 40;
const MAX_ZOOM = 175;

export function PdfViewerControls({
  currentPage,
  totalPages,
  zoom,
  hasPdfUrl,
  isNativeMode,
  canUseNativePreview,
  onPageChange,
  onZoomChange,
  onToggleNativePreview
}: PdfViewerControlsProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-ink">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - 10))}
          disabled={zoom <= MIN_ZOOM}
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <span className="w-14 text-center text-sm font-medium text-slate-600">{zoom}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + 10))}
          disabled={zoom >= MAX_ZOOM}
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {hasPdfUrl && canUseNativePreview ? (
          <button
            type="button"
            aria-label={isNativeMode ? "Use smooth document viewer" : "Use native document preview"}
            onClick={onToggleNativePreview}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            <FileSearch size={16} aria-hidden="true" />
            {isNativeMode ? "Smooth viewer" : "Native"}
          </button>
        ) : null}
      </div>
    </header>
  );
}


