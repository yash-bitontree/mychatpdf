import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatView } from "./ChatView";
import { renderWithRouter } from "../../test/test-utils";
import { ChatMessage, ChatSummary } from "../../types";

const chat: ChatSummary = {
  id: "chat-1",
  title: "Contract vs deck",
  documents: [
    { id: "doc-1", originalFilename: "contract-a.pdf", format: "pdf" },
    { id: "doc-2", originalFilename: "kickoff-deck.pptx", format: "pptx" }
  ],
  createdAt: "2026-06-10T09:30:00Z",
  updatedAt: "2026-06-12T15:15:00Z"
};

const messages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "Compare the payment terms.",
    createdAt: "2026-06-12T15:14:00Z"
  },
  {
    id: "msg-2",
    role: "assistant",
    content: "Contract A nets 30 days (pp. 12-13); the deck proposes 45 (p. 3).",
    createdAt: "2026-06-12T15:15:00Z",
    sources: [
      {
        sourceId: "src-1",
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentFilename: "contract-a.pdf",
        pageStart: 12,
        pageEnd: 13,
        excerpt: "Payment is due within 30 days."
      },
      {
        sourceId: "src-2",
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentFilename: "kickoff-deck.pptx",
        pageStart: 3,
        pageEnd: 3,
        excerpt: "Proposed terms: net 45."
      }
    ]
  }
];

describe("ChatView", () => {
  it("shows the scope header with document names and formats", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    expect(screen.getByRole("heading", { name: "Contract vs deck" })).toBeInTheDocument();
    expect(screen.getByText("contract-a.pdf")).toBeInTheDocument();
    expect(screen.getByText("kickoff-deck.pptx")).toBeInTheDocument();
  });

  it("renames the conversation from the header", () => {
    const onRenameChat = vi.fn();
    renderWithRouter(<ChatView chat={chat} messages={messages} onRenameChat={onRenameChat} />);

    fireEvent.click(screen.getByRole("button", { name: /rename contract vs deck/i }));
    const titleInput = screen.getByRole("textbox", { name: /conversation name/i });
    fireEvent.change(titleInput, { target: { value: "Updated conversation" } });
    fireEvent.click(screen.getByRole("button", { name: /save conversation name/i }));

    expect(onRenameChat).toHaveBeenCalledWith("Updated conversation");
  });
  it("links compact citations to the document workspace with source labels", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    const pdfCitation = screen.getByRole("link", { name: /open source 1: contract-a\.pdf - pp\. 12-13/i });
    expect(pdfCitation).toHaveAttribute("href", "/app/documents/doc-1");
  });

  it("links converted document citations to their workspace", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    const pptxCitation = screen.getByRole("link", { name: /open source 2: kickoff-deck\.pptx - slide 3/i });
    expect(pptxCitation).toHaveAttribute("href", "/app/documents/doc-2");
  });
  it("renders markdown comparison tables as HTML tables", () => {
    renderWithRouter(
      <ChatView
        chat={chat}
        messages={[
          messages[0],
          {
            id: "msg-table",
            role: "assistant",
            content: [
              "Here is the comparison:",
              "",
              "| Category | AI.pdf | Cloud.pdf |",
              "| --- | --- | --- |",
              "| Core technologies | Machine learning (p. 1) | Cloud computing (p. 2) |"
            ].join("\n"),
            createdAt: "2026-06-12T15:16:00Z",
            sources: [
              {
                sourceId: "src-ai",
                chunkId: "chunk-ai",
                documentId: "doc-1",
                documentFilename: "contract-a.pdf",
                pageStart: 1,
                pageEnd: 1,
                excerpt: "Machine learning is discussed."
              },
              {
                sourceId: "src-cloud",
                chunkId: "chunk-cloud",
                documentId: "doc-2",
                documentFilename: "kickoff-deck.pptx",
                pageStart: 2,
                pageEnd: 2,
                excerpt: "Cloud computing is discussed."
              }
            ]
          }
        ]}
      />
    );

    const table = screen.getByRole("table", { name: /comparison table/i });
    expect(within(table).getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    expect(within(table).getByText(/Machine learning/i)).toBeInTheDocument();
    expect(screen.queryByText(/\| --- \|/)).not.toBeInTheDocument();
  });
});

