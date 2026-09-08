import { ApiClient } from "./client";
import { ChatMessage, Citation, DocumentFormat, DocumentStatus, DocumentSummary } from "../types";

interface BackendDocumentSummary {
  id: string;
  folder_id?: string | null;
  original_filename: string;
  format?: DocumentFormat | null;
  status: DocumentStatus;
  file_size_bytes: number;
  page_count?: number | null;
  chunk_count?: number | null;
  created_at: string;
  processed_at?: string | null;
  failure_message?: string | null;
}

interface BackendDocumentsResponse {
  items: BackendDocumentSummary[];
  next_cursor: string | null;
}

interface BackendProcessingStatus {
  document_id: string;
  status: DocumentStatus;
  current_step: string | null;
  failure_code: string | null;
  failure_message: string | null;
}

interface BackendUploadResponse {
  id: string;
  status: DocumentStatus;
  processing_job_id: string;
}

interface BackendChatResponse {
  chat: {
    id: string;
    document_id: string;
    title: string | null;
    model?: string | null;
  };
  messages: Array<{
    id: string;
    role: ChatMessage["role"];
    content: string;
    created_at: string;
    sources: Array<{
      source_id: string;
      chunk_id: string;
      page_start: number;
      page_end: number;
      excerpt: string;
      score?: number | null;
    }>;
  }>;
}

interface ParsedServerSentEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface SendChatMessageHandlers {
  signal?: AbortSignal;
  onStart?: (messageId: string) => void;
  onToken?: (token: string) => void;
  onSources?: (sources: Citation[]) => void;
}

export function mapDocumentSummary(document: BackendDocumentSummary): DocumentSummary {
  return {
    id: document.id,
    folderId: document.folder_id ?? undefined,
    originalFilename: document.original_filename,
    format: document.format ?? "pdf",
    status: document.status,
    fileSizeBytes: document.file_size_bytes,
    pageCount: document.page_count ?? undefined,
    chunkCount: document.chunk_count ?? undefined,
    createdAt: document.created_at,
    processedAt: document.processed_at ?? undefined,
    failureMessage: document.failure_message ?? undefined
  };
}

function mapCitation(source: BackendChatResponse["messages"][number]["sources"][number]): Citation {
  return {
    sourceId: source.source_id,
    chunkId: source.chunk_id,
    pageStart: source.page_start,
    pageEnd: source.page_end,
    excerpt: source.excerpt,
    score: source.score ?? undefined
  };
}

function mapStreamCitation(source: {
  chunk_id: string;
  document_id?: string | null;
  document_filename?: string | null;
  page_start: number;
  page_end: number;
  excerpt: string;
  score?: number | null;
}, index: number): Citation {
  return {
    sourceId: `${source.chunk_id}-${index}`,
    chunkId: source.chunk_id,
    documentId: source.document_id ?? undefined,
    documentFilename: source.document_filename ?? undefined,
    pageStart: source.page_start,
    pageEnd: source.page_end,
    excerpt: source.excerpt,
    score: source.score ?? undefined
  };
}

function parseServerSentEventBlock(block: string): ParsedServerSentEvent | null {
  const dataLines: string[] = [];
  let event = "message";

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      event = value || "message";
    }
    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (!block.trim()) {
    return null;
  }

  const rawData = dataLines.join("\n").trim();
  return {
    event,
    data: rawData ? JSON.parse(rawData) as Record<string, unknown> : {}
  };
}

function parseServerSentEvents(raw: string): ParsedServerSentEvent[] {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\n+/)
    .map(parseServerSentEventBlock)
    .filter((event): event is ParsedServerSentEvent => event !== null);
}

async function readServerSentEvents(
  response: Response,
  onEvent: (event: ParsedServerSentEvent) => void
): Promise<void> {
  if (!response.body) {
    parseServerSentEvents(await response.text()).forEach(onEvent);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function drainBuffer(final = false) {
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let separatorIndex = buffer.indexOf("\n\n");

    while (separatorIndex !== -1) {
      const event = parseServerSentEventBlock(buffer.slice(0, separatorIndex));
      if (event) {
        onEvent(event);
      }
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (final && buffer.trim()) {
      const event = parseServerSentEventBlock(buffer);
      if (event) {
        onEvent(event);
      }
      buffer = "";
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      drainBuffer();
    }
    buffer += decoder.decode();
    drainBuffer(true);
  } finally {
    reader.releaseLock();
  }
}

function mapStreamSources(sourceItems: unknown): Citation[] {
  if (!Array.isArray(sourceItems)) {
    return [];
  }

  return sourceItems.map((source, index) =>
    mapStreamCitation(
      source as {
        chunk_id: string;
        document_id?: string | null;
        document_filename?: string | null;
        page_start: number;
        page_end: number;
        excerpt: string;
        score?: number | null;
      },
      index
    )
  );
}

function createClientMessageId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join("")
    ].join("-");
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listDocuments(client: ApiClient, folderId?: string | "root"): Promise<DocumentSummary[]> {
  const documents: BackendDocumentSummary[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: "100" });
    if (folderId) {
      params.set("folder_id", folderId);
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await client.request<BackendDocumentsResponse>(`/api/documents?${params.toString()}`);
    documents.push(...response.items);
    cursor = response.next_cursor;
  } while (cursor);

  return documents.map(mapDocumentSummary);
}

export async function getDocument(client: ApiClient, documentId: string): Promise<DocumentSummary> {
  const response = await client.request<BackendDocumentSummary>(`/api/documents/${documentId}`);
  return mapDocumentSummary(response);
}

export async function uploadDocument(client: ApiClient, file: File, folderId?: string) {
  const formData = new FormData();
  formData.set("file", file);
  if (folderId) {
    formData.set("folder_id", folderId);
  }
  const response = await client.request<BackendUploadResponse>("/api/documents", {
    method: "POST",
    body: formData
  });
  return {
    documentId: response.id,
    status: response.status,
    processingJobId: response.processing_job_id
  };
}

export async function moveDocument(
  client: ApiClient,
  documentId: string,
  folderId: string | null
): Promise<DocumentSummary> {
  const response = await client.request<BackendDocumentSummary>(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ folder_id: folderId })
  });
  return mapDocumentSummary(response);
}

export async function getDocumentFileUrl(client: ApiClient, documentId: string) {
  return client.request<{ url: string; expires_at: string }>(`/api/documents/${documentId}/file-url`);
}

export async function getDocumentFileObjectUrl(client: ApiClient, documentId: string) {
  const blob = await client.requestBlob(`/api/documents/${documentId}/file`);
  return URL.createObjectURL(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

interface BackendDocumentPagesResponse {
  document_id: string;
  format: DocumentFormat | null;
  pages: Array<{ page_number: number; text: string }>;
}

export async function getDocumentPages(client: ApiClient, documentId: string): Promise<DocumentPage[]> {
  const response = await client.request<BackendDocumentPagesResponse>(`/api/documents/${documentId}/pages`);
  return response.pages.map((page) => ({ pageNumber: page.page_number, text: page.text }));
}

export async function getDocumentProcessingStatus(client: ApiClient, documentId: string) {
  const response = await client.request<BackendProcessingStatus>(`/api/documents/${documentId}/processing-status`);
  return {
    documentId: response.document_id,
    status: response.status,
    currentStep: response.current_step ?? undefined,
    failureCode: response.failure_code ?? undefined,
    failureMessage: response.failure_message ?? undefined
  };
}

export interface DocumentChat {
  model: string | null;
  messages: ChatMessage[];
}

export async function getDocumentChat(client: ApiClient, documentId: string): Promise<DocumentChat> {
  const response = await client.request<BackendChatResponse>(`/api/documents/${documentId}/chat`);
  return {
    model: response.chat.model ?? null,
    messages: response.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
      sources: message.sources.map(mapCitation)
    }))
  };
}

export async function streamAssistantMessage(
  client: ApiClient,
  path: string,
  content: string,
  handlers: SendChatMessageHandlers = {},
  model?: string
): Promise<ChatMessage> {
  const response = await client.requestStream(path, {
    method: "POST",
    body: JSON.stringify(model ? { content, model } : { content }),
    signal: handlers.signal
  });

  let messageId: string = createClientMessageId();
  let contentText = "";
  let sources: Citation[] = [];
  let streamError: string | undefined;

  await readServerSentEvents(response, (event) => {
    if (event.event === "message_start") {
      messageId = String(event.data.message_id ?? messageId);
      handlers.onStart?.(messageId);
      return;
    }

    if (event.event === "token") {
      const token = String(event.data.text ?? "");
      contentText += token;
      handlers.onToken?.(token);
      return;
    }

    if (event.event === "sources") {
      sources = mapStreamSources(event.data.items);
      handlers.onSources?.(sources);
      return;
    }

    if (event.event === "error") {
      streamError = String(event.data.message ?? "Unable to generate an answer right now.");
    }
  });

  if (streamError) {
    throw new Error(streamError);
  }

  return {
    id: messageId,
    role: "assistant",
    content: contentText,
    createdAt: new Date().toISOString(),
    sources
  };
}

export async function sendChatMessage(
  client: ApiClient,
  documentId: string,
  content: string,
  handlers: SendChatMessageHandlers = {},
  model?: string
): Promise<ChatMessage> {
  return streamAssistantMessage(client, `/api/documents/${documentId}/chat/stream`, content, handlers, model);
}

export async function deleteDocument(client: ApiClient, documentId: string) {
  return client.request<{ status: DocumentStatus }>(`/api/documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function retryDocumentProcessing(client: ApiClient, documentId: string) {
  return client.request<{ processing_job_id: string; status: string }>(`/api/documents/${documentId}/retry`, {
    method: "POST"
  });
}
