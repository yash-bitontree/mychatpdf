import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";
import { createChat, deleteChat, getChat, listChats, mapChatSummary, renameChat, streamChatMessage } from "./chats";

const backendChat = {
  id: "chat-1",
  title: "Quarterly numbers",
  documents: [{ id: "doc-1", original_filename: "paper.pdf", format: "pdf" as const }],
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z"
};

describe("chat API helpers", () => {
  it("maps backend chat summaries to frontend chat shape", () => {
    expect(mapChatSummary(backendChat)).toEqual({
      id: "chat-1",
      title: "Quarterly numbers",
      model: null,
      documents: [{ id: "doc-1", originalFilename: "paper.pdf", format: "pdf" }],
      folder: null,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z"
    });
  });

  it("keeps the stored model tier on chat summaries", () => {
    expect(mapChatSummary({ ...backendChat, model: "quality" }).model).toBe("quality");
  });

  it("maps folder chats with their folder reference", () => {
    expect(mapChatSummary({ ...backendChat, folder: { id: "folder-1", name: "Research" } }).folder).toEqual({
      id: "folder-1",
      name: "Research"
    });
  });

  it("lists chats one page at a time with cursor pagination", async () => {
    const requestedUrls: string[] = [];
    const client = new ApiClient({
      fetcher: async (input) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify({ items: [backendChat], next_cursor: "next-page" }), { status: 200 });
      }
    });

    const firstPage = await listChats(client);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBe("next-page");

    await listChats(client, firstPage.nextCursor ?? undefined);
    expect(requestedUrls).toEqual(["/api/chats?limit=50", "/api/chats?limit=50&cursor=next-page"]);
  });

  it("creates a chat scoped to the given documents", async () => {
    let requestBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/chats");
        expect(init?.method).toBe("POST");
        requestBody = init?.body;
        return new Response(JSON.stringify(backendChat), { status: 201 });
      }
    });

    const chat = await createChat(client, ["doc-1"], "Quarterly numbers");
    expect(chat.id).toBe("chat-1");
    expect(requestBody).toBe(JSON.stringify({ document_ids: ["doc-1"], title: "Quarterly numbers" }));
  });

  it("creates a chat scoped to a folder", async () => {
    let requestBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        requestBody = init?.body;
        return new Response(JSON.stringify({ ...backendChat, folder: { id: "folder-1", name: "Research" } }), {
          status: 201
        });
      }
    });

    const chat = await createChat(client, { folderId: "folder-1" });
    expect(chat.folder).toEqual({ id: "folder-1", name: "Research" });
    expect(requestBody).toBe(JSON.stringify({ folder_id: "folder-1" }));
  });

  it("omits the title when creating an untitled chat", async () => {
    let requestBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        requestBody = init?.body;
        return new Response(JSON.stringify(backendChat), { status: 201 });
      }
    });

    await createChat(client, ["doc-1"]);
    expect(requestBody).toBe(JSON.stringify({ document_ids: ["doc-1"] }));
  });

  it("gets a chat resume payload with messages and sources", async () => {
    const client = new ApiClient({
      fetcher: async (input) => {
        expect(input).toBe("/api/chats/chat-1");
        return new Response(
          JSON.stringify({
            chat: backendChat,
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: "Margins tightened.",
                created_at: "2026-07-01T00:01:00Z",
                sources: [
                  {
                    source_id: "source-1",
                    chunk_id: "chunk-1",
                    document_filename: "paper.pdf",
                    page_start: 2,
                    page_end: 3,
                    excerpt: "Source text",
                    score: 0.9
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        );
      }
    });

    const detail = await getChat(client, "chat-1");
    expect(detail.chat.title).toBe("Quarterly numbers");
    expect(detail.messages).toEqual([
      {
        id: "msg-1",
        role: "assistant",
        content: "Margins tightened.",
        createdAt: "2026-07-01T00:01:00Z",
        sources: [
          {
            sourceId: "source-1",
            chunkId: "chunk-1",
            documentFilename: "paper.pdf",
            pageStart: 2,
            pageEnd: 3,
            excerpt: "Source text",
            score: 0.9
          }
        ]
      }
    ]);
  });

  it("renames a chat through the PATCH endpoint", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/chats/chat-1");
        expect(init?.method).toBe("PATCH");
        expect(init?.body).toBe(JSON.stringify({ title: "New title" }));
        return new Response(JSON.stringify({ ...backendChat, title: "New title" }), { status: 200 });
      }
    });

    await expect(renameChat(client, "chat-1", "New title")).resolves.toMatchObject({ title: "New title" });
  });

  it("deletes a chat", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/chats/chat-1");
        expect(init?.method).toBe("DELETE");
        return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
      }
    });

    await expect(deleteChat(client, "chat-1")).resolves.toEqual({ status: "deleted" });
  });

  it("streams a chat message into an assistant message", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/chats/chat-1/messages/stream");
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ content: "Compare the reports." }));
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

    await expect(streamChatMessage(client, "chat-1", "Compare the reports.")).resolves.toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Hello world",
      sources: [{ chunkId: "chunk-1", pageStart: 2, pageEnd: 2, excerpt: "Source text", score: 0.9 }]
    });
  });

  it("sends the selected model tier with the stream request", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/chats/chat-1/messages/stream");
        expect(init?.body).toBe(JSON.stringify({ content: "Compare the reports.", model: "quality" }));
        return new Response('event: token\ndata: {"text":"ok"}', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        });
      }
    });

    await expect(streamChatMessage(client, "chat-1", "Compare the reports.", {}, "quality")).resolves.toMatchObject({
      content: "ok"
    });
  });
});
