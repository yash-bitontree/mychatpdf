import { DocumentFormat, DocumentStatus } from "../../types";

export function citationPageLabel(format: DocumentFormat | undefined, pageStart: number, pageEnd: number = pageStart) {
  if (format === "pptx") {
    return pageStart === pageEnd ? `slide ${pageStart}` : `slides ${pageStart}-${pageEnd}`;
  }

  if (format === "docx" || format === "txt" || format === "rtf") {
    return pageStart === pageEnd ? `section ${pageStart}` : `sections ${pageStart}-${pageEnd}`;
  }

  return pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}-${pageEnd}`;
}

export function documentStatusLabel(status: DocumentStatus) {
  switch (status) {
    case "uploaded":
      return "Uploading file...";
    case "extracting":
      return "Reading document...";
    case "chunking":
    case "embedding":
    case "indexing":
      return "Preparing document for chat...";
    case "ready":
      return "Ready to chat";
    case "failed":
      return "Processing failed. Retry or delete this document.";
    case "deleting":
      return "Deleting document...";
  }
}

export function isProcessingStatus(status: DocumentStatus) {
  return status === "uploaded" || status === "extracting" || status === "chunking" || status === "embedding" || status === "indexing";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value?: string) {
  if (!value) {
    return "Not opened yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
