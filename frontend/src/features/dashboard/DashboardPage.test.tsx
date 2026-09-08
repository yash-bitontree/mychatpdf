import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../api/client";
import { renderWithRouter } from "../../test/test-utils";
import { DashboardPage } from "./DashboardPage";

const dashboardPayload = {
  subscription: {
    plan: { id: "free", name: "Free", interval: null },
    status: null,
    current_period_end: null,
    cancel_at_period_end: false
  },
  usage: {
    plan: { id: "free", name: "Free" },
    period_start: "2026-07-01T00:00:00Z",
    period_end: "2026-08-01T00:00:00Z",
    ai_messages: { used: 5, limit: 25 },
    uploads: { used: 2, limit: 3 },
    storage_mb: { used: 8, limit: 50 }
  },
  documents: {
    total: 3,
    by_status: { ready: 2, failed: 1 },
    by_format: { pdf: 2, docx: 1 },
    storage_bytes: 3 * 1024 * 1024
  },
  recent_conversations: [
    {
      id: "chat-1",
      title: "Quarterly numbers",
      documents: [
        { id: "doc-1", original_filename: "paper.pdf", format: "pdf" },
        { id: "doc-2", original_filename: "notes.docx", format: "docx" }
      ],
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-02T00:00:00Z"
    }
  ],
  recent_activity: [
    { type: "document_uploaded", id: "doc-1", label: "paper.pdf", timestamp: "2026-07-01T00:00:00Z" },
    { type: "conversation_updated", id: "chat-1", label: "Quarterly numbers", timestamp: "2026-07-02T00:00:00Z" }
  ]
};

function fakeApi() {
  return new ApiClient({
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardPayload), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
}

describe("DashboardPage", () => {
  it("renders subscription, usage, and document stats from the API", async () => {
    renderWithRouter(<DashboardPage api={fakeApi()} onUploadFile={vi.fn()} onOpenChat={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage plan and billing/i })).toHaveAttribute("href", "/app/billing");
    expect(screen.getByRole("progressbar", { name: "AI messages usage" })).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByRole("heading", { name: "3 documents" })).toBeInTheDocument();
    expect(screen.getByText("3.0 MB stored")).toBeInTheDocument();
    expect(screen.getByText("ready: 2")).toBeInTheDocument();
    expect(screen.getByText("failed: 1")).toBeInTheDocument();
    expect(screen.getByText("PDF: 2")).toBeInTheDocument();
    expect(screen.getByText("DOCX: 1")).toBeInTheDocument();
  });

  it("renders recent conversations and activity, and opens a conversation", async () => {
    const user = userEvent.setup();
    const onOpenChat = vi.fn();

    renderWithRouter(<DashboardPage api={fakeApi()} onUploadFile={vi.fn()} onOpenChat={onOpenChat} />);

    const conversation = await screen.findByRole("button", { name: /quarterly numbers/i });
    expect(screen.getByText(/paper\.pdf, notes\.docx/)).toBeInTheDocument();
    expect(screen.getByText(/document uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/conversation updated/i)).toBeInTheDocument();

    await user.click(conversation);
    expect(onOpenChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1", documents: expect.arrayContaining([expect.objectContaining({ id: "doc-1" })]) })
    );
  });

  it("keeps the upload section usable and shows an upgrade prompt on limit errors", async () => {
    const user = userEvent.setup();
    const { LimitExceededError } = await import("../../api/client");
    const onUploadFile = vi.fn().mockRejectedValue(new LimitExceededError("upload", 3, 3));

    renderWithRouter(<DashboardPage api={fakeApi()} onUploadFile={onUploadFile} onOpenChat={vi.fn()} />);

    const file = new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/choose file/i), file);

    expect(onUploadFile).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have reached the upload limit in your plan for this period."
    );
    expect(screen.getByRole("link", { name: /upgrade your plan/i })).toHaveAttribute("href", "/app/billing");
    await waitFor(() => {
      expect(screen.queryByRole("progressbar", { name: /upload progress/i })).not.toBeInTheDocument();
    });
  });
});
