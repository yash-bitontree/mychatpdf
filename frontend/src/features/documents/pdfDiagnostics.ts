import { appLogger } from "../../utils/logger";

export interface PdfDiagnostic {
  level: "error" | "warn";
  area: "document-load" | "page-render" | "text-layer";
  stage: string;
  message: string;
  documentId?: string;
  pageNumber?: number;
  retryVersion?: number;
  scale?: number;
  fingerprint?: string;
  details?: Record<string, unknown>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  timestamp: string;
}

export function createPdfDiagnostic(
  diagnostic: Omit<PdfDiagnostic, "timestamp" | "error"> & {
    error?: unknown;
  }
): PdfDiagnostic {
  return {
    ...diagnostic,
    error: diagnostic.error ? normalizeError(diagnostic.error) : undefined,
    timestamp: new Date().toISOString()
  };
}

export function reportPdfDiagnostic(diagnostic: PdfDiagnostic) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mychatpdf:pdf-diagnostic", { detail: diagnostic }));
  }

  if (diagnostic.level === "error") {
    appLogger.error("PDF viewer diagnostic", diagnostic as unknown as Record<string, unknown>);
    return;
  }

  appLogger.warn("PDF viewer diagnostic", diagnostic as unknown as Record<string, unknown>);
}

export function formatPdfDiagnostic(diagnostic: PdfDiagnostic) {
  return JSON.stringify(diagnostic, null, 2);
}

function normalizeError(error: unknown): PdfDiagnostic["error"] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown PDF viewer error"
  };
}
