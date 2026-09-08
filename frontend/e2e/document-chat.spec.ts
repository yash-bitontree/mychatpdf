import { expect, Page, Route, test } from "@playwright/test";

const e2eHost = process.env.E2E_HOST ?? "0.0.0.0";
const fallbackAppUrl = `http://${e2eHost === "0.0.0.0" ? "localhost" : e2eHost}:${process.env.E2E_PORT ?? "5173"}`;
const apiRoutePattern = process.env.E2E_API_ROUTE_PATTERN ?? "**/api/**";
const appOrigin = new URL(process.env.E2E_BASE_URL ?? fallbackAppUrl).origin;
const documentId = "doc-e2e-ready";

type BackendMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources: Array<{
    source_id: string;
    chunk_id: string;
    page_start: number;
    page_end: number;
    excerpt: string;
    score: number;
  }>;
};

type MockApiState = {
  uploaded: boolean;
  ready: boolean;
  uploadRequests: number;
  messages: BackendMessage[];
  chatMode: "success" | "error";
};

test("user uploads a PDF, asks a question, opens a citation, and refreshes chat history", async ({ page }) => {
  await mockApi(page);

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Chat with any document" })).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({
    name: "pipeline-notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n% e2e sample\n")
  });

  await expect(page).toHaveURL(/\/app\/documents\/doc-e2e-ready$/);
  await expect(page.getByText("Uploading file...")).toBeVisible();
  await expect(page.getByText("Ready to chat")).toBeVisible({ timeout: 6_000 });

  await page.getByRole("textbox", { name: "Ask this document" }).fill("What improved?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("What improved?")).toBeVisible();
  await expect(page.getByText("Pipeline quality improved in regulated industries").first()).toBeVisible();

  await page.getByRole("button", { name: "Open page 2 in PDF" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Ready to chat")).toBeVisible();
  await expect(page.getByText("What improved?")).toBeVisible();
  await expect(page.getByText("Pipeline quality improved in regulated industries").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open page 2 in PDF" })).toBeVisible();
});

test("rejects an unsupported upload before calling the upload API", async ({ page }) => {
  const state = await mockApi(page);

  await page.goto("/app");
  await page.locator("#pdf-upload").setInputFiles({
    name: "meeting-notes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("csv,files,are,not,supported")
  });

  await expect(page.getByRole("alert")).toContainText("Unsupported file type. Upload a PDF, DOCX, PPTX, TXT, or RTF file.");
  expect(state.uploadRequests).toBe(0);
});

test("rejects an oversized PDF before calling the upload API", async ({ page }) => {
  const state = await mockApi(page);

  await page.goto("/app");
  await page.locator("#pdf-upload").setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0)
  });

  await expect(page.getByRole("alert")).toContainText("File too large. Upload a file under 20 MB.");
  expect(state.uploadRequests).toBe(0);
});

test("shows an error when the chat stream returns an error event", async ({ page }) => {
  await mockApi(page, { initialUploaded: true, initialReady: true, chatMode: "error" });

  await page.goto(`/app/documents/${documentId}`);
  await expect(page.getByText("Ready to chat")).toBeVisible();

  await page.getByRole("textbox", { name: "Ask this document" }).fill("What improved?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("What improved?")).toBeVisible();
  await expect(page.getByText("Unable to generate an answer right now.")).toBeVisible();
});

async function mockApi(
  page: Page,
  options: {
    initialUploaded?: boolean;
    initialReady?: boolean;
    chatMode?: "success" | "error";
  } = {}
) {
  const state: MockApiState = {
    uploaded: options.initialUploaded ?? false,
    ready: options.initialReady ?? false,
    uploadRequests: 0,
    messages: [],
    chatMode: options.chatMode ?? "success"
  };

  await page.route(apiRoutePattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (!url.pathname.startsWith("/api/")) {
      await route.fallback();
      return;
    }

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    if (method === "GET" && url.pathname === "/api/chats") {
      await fulfillJson(route, { items: [], next_cursor: null });
      return;
    }

    if (method === "GET" && url.pathname === "/api/folders") {
      await fulfillJson(route, { items: [] });
      return;
    }

    if (method === "GET" && url.pathname === "/api/documents") {
      await fulfillJson(route, {
        items: state.uploaded ? [documentSummary(state.ready ? "ready" : "uploaded")] : [],
        next_cursor: null
      });
      return;
    }

    if (method === "GET" && url.pathname === `/api/documents/${documentId}`) {
      await fulfillJson(route, documentSummary(state.ready ? "ready" : "uploaded"));
      return;
    }

    if (method === "POST" && url.pathname === "/api/documents") {
      state.uploadRequests += 1;
      state.uploaded = true;
      state.ready = false;
      await fulfillJson(
        route,
        {
          id: documentId,
          status: "uploaded",
          processing_job_id: "job-e2e"
        },
        201
      );
      return;
    }

    if (method === "GET" && url.pathname === `/api/documents/${documentId}/processing-status`) {
      state.ready = true;
      await fulfillJson(route, {
        document_id: documentId,
        status: "ready",
        current_step: "ready",
        failure_code: null,
        failure_message: null
      });
      return;
    }

    if (method === "GET" && url.pathname === `/api/documents/${documentId}/file`) {
      await route.fallback();
      return;
    }

    if (method === "GET" && url.pathname === `/api/documents/${documentId}/file-url`) {
      await fulfillJson(route, {
        url: `${appOrigin}/e2e-fixture.pdf`,
        expires_at: "2026-06-15T12:00:00Z"
      });
      return;
    }

    if (method === "GET" && url.pathname === `/api/documents/${documentId}/chat`) {
      await fulfillJson(route, {
        chat: {
          id: "chat-e2e",
          document_id: documentId,
          title: "pipeline-notes.pdf"
        },
        messages: state.messages
      });
      return;
    }

    if (method === "POST" && url.pathname === `/api/documents/${documentId}/chat/stream`) {
      if (state.chatMode === "error") {
        await route.fulfill({
          status: 200,
          headers: {
            ...corsHeaders(),
            "content-type": "text/event-stream"
          },
          body: 'event: error\ndata: {"message":"Unable to generate an answer right now."}\n\n'
        });
        return;
      }

      const now = new Date().toISOString();
      state.messages = [
        {
          id: "message-user-e2e",
          role: "user",
          content: "What improved?",
          created_at: now,
          sources: []
        },
        {
          id: "message-assistant-e2e",
          role: "assistant",
          content: "Pipeline quality improved in regulated industries (p. 2).",
          created_at: now,
          sources: [
            {
              source_id: "source-e2e",
              chunk_id: "chunk-e2e",
              page_start: 2,
              page_end: 2,
              excerpt: "Pipeline quality improved in regulated industries.",
              score: 0.92
            }
          ]
        }
      ];

      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders(),
          "content-type": "text/event-stream"
        },
        body: [
          'event: message_start\ndata: {"message_id":"message-assistant-e2e"}',
          'event: token\ndata: {"text":"Pipeline quality improved in regulated industries (p. 2)."}',
          'event: sources\ndata: {"items":[{"chunk_id":"chunk-e2e","page_start":2,"page_end":2,"excerpt":"Pipeline quality improved in regulated industries.","score":0.92}]}',
          'event: message_done\ndata: {"message_id":"message-assistant-e2e"}'
        ].join("\n\n")
      });
      return;
    }

    await fulfillJson(route, { detail: `Unhandled e2e mock route: ${method} ${url.pathname}` }, 404);
  });

  return state;
}

function documentSummary(status: "uploaded" | "ready") {
  return {
    id: documentId,
    original_filename: "pipeline-notes.pdf",
    status,
    file_size_bytes: 1024,
    page_count: status === "ready" ? 3 : null,
    chunk_count: status === "ready" ? 4 : null,
    created_at: "2026-06-15T10:00:00Z",
    processed_at: status === "ready" ? "2026-06-15T10:01:00Z" : null,
    failure_message: null
  };
}

function fulfillJson(route: Route, body: object, status = 200) {
  return route.fulfill({
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": appOrigin,
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS"
  };
}

