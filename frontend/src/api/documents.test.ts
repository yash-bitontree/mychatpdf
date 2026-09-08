import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  getDocument,
  getDocumentProcessingStatus,
  listDocuments,
  mapDocumentSummary,
  moveDocument,
  sendChatMessage,
  uploadDocument
} from "./documents";

describe("document API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps backend document summaries to frontend document shape", () => {
    expect(
      mapDocumentSummary({
        id: "doc-1",
        original_filename: "paper.pdf",
        status: "ready",
        file_size_bytes: 1024,
        page_count: 4,
        chunk_count: 8,
        created_at: "2026-06-13T00:00:00Z",
        processed_at: "2026-06-13T00:01:00Z",
        failure_message: null
      })
    ).toMatchObject({
      id: "doc-1",
      originalFilename: "paper.pdf",
      status: "ready",
      fileSizeBytes: 1024,
      pageCount: 4,
      chunkCount: 8
    });
  });

  it("lists documents through the authenticated API client", async () => {
    const requestedUrls: string[] = [];
    const client = new ApiClient({
      fetcher: async (input) => {
        requestedUrls.push(String(input));
        const isFirstPage = !String(input).includes("cursor=");
        return new Response(
          JSON.stringify(
            isFirstPage
              ? {
                  items: [
                    {
                      id: "doc-1",
                      original_filename: "paper.pdf",
                      status: "ready",
                      file_size_bytes: 1024,
                      created_at: "2026-06-13T00:00:00Z"
                    }
                  ],
                  next_cursor: "next-page"
                }
              : {
                  items: [
                    {
                      id: "doc-2",
                      original_filename: "notes.pdf",
                      status: "ready",
                      file_size_bytes: 2048,
                      created_at: "2026-06-14T00:00:00Z"
                    }
                  ],
                  next_cursor: null
                }
          ),
          { status: 200 }
        );
      }
    });

    await expect(listDocuments(client)).resolves.toHaveLength(2);
    expect(requestedUrls).toEqual([
      "/api/documents?limit=100",
      "/api/documents?limit=100&cursor=next-page"
    ]);
  });

  it("gets a single document through the detail endpoint", async () => {
    const client = new ApiClient({
      baseUrl: "",
      fetcher: async (input) => {
        expect(input).toBe("/api/documents/doc-1");
        return new Response(
          JSON.stringify({
            id: "doc-1",
            original_filename: "paper.pdf",
            status: "ready",
            file_size_bytes: 1024,
            created_at: "2026-06-13T00:00:00Z"
          }),
          { status: 200 }
        );
      }
    });

    await expect(getDocument(client, "doc-1")).resolves.toMatchObject({
      id: "doc-1",
      originalFilename: "paper.pdf",
      status: "ready"
    });
  });

  it("uploads PDF files as multipart form data", async () => {
    let uploadedBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        uploadedBody = init?.body;
        return new Response(JSON.stringify({ id: "doc-1", status: "uploaded", processing_job_id: "job-1" }), {
          status: 201
        });
      }
    });

    const result = await uploadDocument(client, new File(["%PDF"], "paper.pdf", { type: "application/pdf" }));

    expect(result.documentId).toBe("doc-1");
    expect(uploadedBody).toBeInstanceOf(FormData);
  });

  it("includes the folder id when uploading into a folder", async () => {
    let uploadedBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        uploadedBody = init?.body;
        return new Response(JSON.stringify({ id: "doc-1", status: "uploaded", processing_job_id: "job-1" }), {
          status: 201
        });
      }
    });

    await uploadDocument(client, new File(["%PDF"], "paper.pdf", { type: "application/pdf" }), "folder-1");

    expect((uploadedBody as FormData).get("folder_id")).toBe("folder-1");
  });

  it("moves a document into a folder through the PATCH endpoint", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/documents/doc-1");
        expect(init?.method).toBe("PATCH");
        expect(init?.body).toBe(JSON.stringify({ folder_id: "folder-1" }));
        return new Response(
          JSON.stringify({
            id: "doc-1",
            folder_id: "folder-1",
            original_filename: "paper.pdf",
            status: "ready",
            file_size_bytes: 1024,
            created_at: "2026-06-13T00:00:00Z"
          }),
          { status: 200 }
        );
      }
    });

    await expect(moveDocument(client, "doc-1", "folder-1")).resolves.toMatchObject({
      id: "doc-1",
      folderId: "folder-1"
    });
  });

  it("moves a document back to the library with a null folder id", async () => {
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        expect(init?.body).toBe(JSON.stringify({ folder_id: null }));
        return new Response(
          JSON.stringify({
            id: "doc-1",
            folder_id: null,
            original_filename: "paper.pdf",
            status: "ready",
            file_size_bytes: 1024,
            created_at: "2026-06-13T00:00:00Z"
          }),
          { status: 200 }
        );
      }
    });

    await expect(moveDocument(client, "doc-1", null)).resolves.toMatchObject({ id: "doc-1", folderId: undefined });
  });

  it("gets document processing status", async () => {
    const client = new ApiClient({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-1",
            status: "embedding",
            current_step: "embedding",
            failure_code: null,
            failure_message: null
          }),
          { status: 200 }
        )
    });

    await expect(getDocumentProcessingStatus(client, "doc-1")).resolves.toMatchObject({
      documentId: "doc-1",
      status: "embedding",
      currentStep: "embedding"
    });
  });

  it("parses streamed chat responses into an assistant message", async () => {
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ content: "What changed?" }));
        return new Response(
          [
            'event: message_start\ndata: {"message_id":"msg-1"}',
            'event: token\ndata: {"text":"Hello "}',
            'event: token\ndata: {"text":"world"}',
            'event: sources\ndata: {"items":[{"chunk_id":"chunk-1","page_start":2,"page_end":2,"excerpt":"Source text","score":0.9}]}',
            'event: message_done\ndata: {"message_id":"msg-1"}'
          ].join("\n\n"),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
    });

    await expect(sendChatMessage(client, "doc-1", "What changed?")).resolves.toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Hello world",
      sources: [
        {
          chunkId: "chunk-1",
          pageStart: 2,
          pageEnd: 2,
          excerpt: "Source text",
          score: 0.9
        }
      ]
    });
  });

  it("streams chat when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(1);
        return bytes;
      }
    });

    const client = new ApiClient({
      fetcher: async () =>
        new Response(
          [
            'event: token\ndata: {"text":"Fallback "} ',
            'event: token\ndata: {"text":"works"}'
          ].join("\n\n"),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        )
    });

    await expect(sendChatMessage(client, "doc-1", "What changed?")).resolves.toMatchObject({
      id: "01010101-0101-4101-8101-010101010101",
      role: "assistant",
      content: "Fallback works"
    });
  });
});
