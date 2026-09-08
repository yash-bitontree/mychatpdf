import { describe, expect, it } from "vitest";
import { ApiClient, ApiError, LimitExceededError } from "./client";

describe("ApiClient", () => {
  it("attaches Clerk bearer tokens to protected requests", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const client = new ApiClient({
      baseUrl: "https://api.example.test",
      getToken: async () => "clerk-token",
      fetcher
    });

    await client.request("/documents");

    expect((requestInit?.headers as Headers).get("Authorization")).toBe("Bearer clerk-token");
  });

  it("throws a typed LimitExceededError on 402 limit_exceeded responses", async () => {
    const client = new ApiClient({
      fetcher: async () =>
        new Response(JSON.stringify({ code: "limit_exceeded", kind: "ai_message", limit: 25, used: 25 }), {
          status: 402
        })
    });

    const error = await client
      .request("/api/chats/chat-1/messages/stream", { method: "POST" })
      .catch((caught) => caught as LimitExceededError);

    expect(error).toBeInstanceOf(LimitExceededError);
    expect((error as LimitExceededError).kind).toBe("ai_message");
    expect((error as LimitExceededError).limit).toBe(25);
    expect((error as LimitExceededError).used).toBe(25);
    expect((error as LimitExceededError).status).toBe(402);
  });

  it("throws a plain ApiError for other failures", async () => {
    const client = new ApiClient({
      fetcher: async () => new Response("nope", { status: 500, statusText: "Server Error" })
    });

    const error = await client.request("/api/documents").catch((caught) => caught as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(LimitExceededError);
    expect((error as ApiError).status).toBe(500);
  });
});
