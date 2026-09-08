import { ChatMessage, DocumentSummary, WorkspaceDocument } from "../types";

export const mockDocuments: DocumentSummary[] = [
  {
    id: "market-report",
    originalFilename: "Q2-market-report.pdf",
    status: "ready",
    fileSizeBytes: 2_840_000,
    pageCount: 24,
    chunkCount: 46,
    createdAt: "2026-06-10T09:30:00Z",
    processedAt: "2026-06-10T09:33:00Z",
    lastOpenedAt: "2026-06-12T15:15:00Z"
  },
  {
    id: "policy-handbook",
    originalFilename: "policy-handbook.pdf",
    status: "embedding",
    fileSizeBytes: 7_210_000,
    pageCount: 86,
    createdAt: "2026-06-12T08:20:00Z"
  },
  {
    id: "scanned-contract",
    originalFilename: "scanned-contract.pdf",
    status: "failed",
    fileSizeBytes: 1_920_000,
    pageCount: 12,
    createdAt: "2026-06-11T12:05:00Z",
    failureMessage: "This PDF appears to be scanned or image-based. Phase 1 supports text-based PDFs only."
  },
  {
    id: "old-brief",
    originalFilename: "old-brief.pdf",
    status: "deleting",
    fileSizeBytes: 980_000,
    pageCount: 9,
    createdAt: "2026-06-09T18:45:00Z"
  }
];

export const mockWorkspaceDocument: WorkspaceDocument = {
  ...mockDocuments[0],
  signedPdfUrl: "about:blank"
};

export const mockMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "What should I pay attention to?",
    createdAt: "2026-06-12T15:16:00Z"
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "The report emphasizes margin pressure, longer sales cycles, and renewed demand in regulated industries (p. 7). It recommends watching pipeline quality before expanding spend (pp. 12-13).",
    createdAt: "2026-06-12T15:16:04Z",
    sources: [
      {
        sourceId: "source-1",
        chunkId: "doc_market-report_chunk_12",
        pageStart: 7,
        pageEnd: 7,
        excerpt: "Pipeline quality improved in regulated industries, but sales cycles remained longer than the prior quarter.",
        score: 0.84
      },
      {
        sourceId: "source-2",
        chunkId: "doc_market-report_chunk_18",
        pageStart: 12,
        pageEnd: 13,
        excerpt: "Operating margin remains sensitive to customer acquisition costs and delayed enterprise renewals.",
        score: 0.78
      }
    ]
  }
];
