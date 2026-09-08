import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../api/client";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { mockWorkspaceDocument, mockMessages } from "../../mocks/documents";
import { WorkspaceDocument } from "../../types";

vi.mock("../../api/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/documents")>();
  return {
    ...actual,
    getDocumentPages: vi.fn().mockResolvedValue([
      { pageNumber: 1, text: "Executive summary paragraph." },
      { pageNumber: 2, text: "Follow-up analysis section." }
    ])
  };
});

describe("DocumentWorkspace", () => {
  it("updates the active PDF page when a citation is clicked", async () => {
    const user = userEvent.setup();

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={mockMessages} />);

    expect(await screen.findByText(/page 1 of 24/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open p\. 7 in document preview/i }));

    expect(screen.getByText(/page 7 of 24/i)).toBeInTheDocument();
  });

  it("offers a native PDF fallback when a signed PDF URL is available", async () => {
    render(
      <DocumentWorkspace
        document={{ ...mockWorkspaceDocument, signedPdfUrl: "https://files.example.com/paper.pdf" }}
        messages={[]}
      />
    );

    expect(await screen.findByRole("button", { name: /use native pdf preview/i })).toBeInTheDocument();
  });

  it("disables the composer when the document is not ready", () => {
    const processingDocument: WorkspaceDocument = {
      ...mockWorkspaceDocument,
      status: "embedding"
    };

    render(<DocumentWorkspace document={processingDocument} messages={[]} />);

    expect(screen.getByRole("textbox", { name: /ask this document/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(/preparing document for chat/i)).toBeInTheDocument();
  });

  it("shows mobile PDF and chat segment controls", async () => {
    const user = userEvent.setup();

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={mockMessages} />);

    expect(screen.getByRole("tab", { name: /pdf/i })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: /chat/i }));

    expect(screen.getByRole("tab", { name: /chat/i })).toHaveAttribute("aria-selected", "true");
  });

  it("renders extracted text sections as the preview for txt documents", async () => {
    const api = {} as ApiClient;

    render(<DocumentWorkspace api={api} document={{ ...mockWorkspaceDocument, format: "txt" }} messages={[]} />);

    await waitFor(() => {
      expect(screen.getByText("Executive summary paragraph.")).toBeInTheDocument();
    });
    expect(screen.getByText("Follow-up analysis section.")).toBeInTheDocument();
    expect(screen.queryByText(/page 1 of 24/i)).not.toBeInTheDocument();
  });

  it("uses the PDF viewer for converted docx previews", async () => {
    render(<DocumentWorkspace document={{ ...mockWorkspaceDocument, format: "docx" }} messages={[]} />);

    expect(await screen.findByText(/page 1 of 24/i)).toBeInTheDocument();
    expect(screen.queryByText(/preview is not available for this file type/i)).not.toBeInTheDocument();
  });

  it("labels citations as slides for pptx documents", async () => {
    render(<DocumentWorkspace document={{ ...mockWorkspaceDocument, format: "pptx" }} messages={mockMessages} />);

    expect(await screen.findByRole("button", { name: /open slide 7 in document preview/i })).toHaveTextContent("slide 7");
  });

  it("shows a generating state while a message is being sent", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(() => new Promise<void>(() => undefined));

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={[]} onSendMessage={onSendMessage} />);

    await user.type(screen.getByRole("textbox", { name: /ask this document/i }), "Summarize this document.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(onSendMessage).toHaveBeenCalledWith("Summarize this document.", "fast");
    expect(screen.getByRole("status", { name: /generating answer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop generating/i })).toBeInTheDocument();
  });
});
