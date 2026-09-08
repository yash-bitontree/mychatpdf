import { FileSearch, Loader2, RefreshCw } from "lucide-react";

export function PdfOpeningNotice() {
  return (
    <div
      role="status"
      aria-label="Opening document preview"
      className="sticky top-0 z-10 mx-auto mb-4 flex max-w-sm items-center gap-3 rounded-md border border-slate-200 bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-panel backdrop-blur"
    >
      <Loader2 size={16} className="shrink-0 animate-spin text-sea" aria-hidden="true" />
      Opening preview...
    </div>
  );
}

export function NativePdfPreview({
  documentName,
  isLoading,
  previewUrl,
  onLoad
}: {
  documentName: string;
  isLoading: boolean;
  previewUrl: string;
  onLoad: () => void;
}) {
  return (
    <div className="relative h-full min-h-0 bg-white">
      {isLoading ? (
        <div
          role="status"
          aria-label="Opening native document preview"
          className="absolute inset-x-4 top-4 z-10 mx-auto flex max-w-sm items-center gap-3 rounded-md border border-slate-200 bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-panel backdrop-blur"
        >
          <Loader2 size={16} className="shrink-0 animate-spin text-sea" aria-hidden="true" />
          Opening native preview...
        </div>
      ) : null}
      <iframe title={`Document preview for ${documentName}`} src={previewUrl} onLoad={onLoad} className="h-full min-h-[520px] w-full border-0 bg-white" />
    </div>
  );
}

export function PdfPreviewSkeleton() {
  return (
    <div role="status" aria-label="Opening document preview" className="grid h-full min-h-[520px] place-items-center p-5">
      <div className="w-full max-w-3xl rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-64 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function PdfLoadFailure({
  error,
  onRetry,
  onUseNative
}: {
  error: string | null;
  onRetry: () => void;
  onUseNative?: () => void;
}) {
  return (
    <div className="grid h-full min-h-[520px] place-items-center p-5">
      <div role="alert" className="w-full max-w-md rounded-md border border-amber-200 bg-white p-5 text-sm leading-6 text-slate-700 shadow-panel">
        <p className="text-base font-semibold text-ink">We could not open this document in the smooth viewer.</p>
        <p className="mt-2 text-slate-600">
          Retry once if the file was still being prepared, or use the browser-native preview for this document.
        </p>
        {error ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="brand-gradient inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)]"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Retry smooth viewer
          </button>
          {onUseNative ? (
            <button
              type="button"
              onClick={onUseNative}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              <FileSearch size={15} aria-hidden="true" />
              Native preview
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

