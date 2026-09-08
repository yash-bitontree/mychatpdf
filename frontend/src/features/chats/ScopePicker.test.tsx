import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScopePicker } from "./ScopePicker";
import { renderWithRouter } from "../../test/test-utils";
import { DocumentSummary } from "../../types";

const readyDocuments: DocumentSummary[] = [
  {
    id: "doc-1",
    originalFilename: "contract-a.pdf",
    format: "pdf",
    status: "ready",
    fileSizeBytes: 120_000,
    createdAt: "2026-06-10T09:30:00Z"
  },
  {
    id: "doc-2",
    originalFilename: "kickoff-deck.pptx",
    format: "pptx",
    status: "ready",
    fileSizeBytes: 240_000,
    createdAt: "2026-06-11T08:00:00Z"
  }
];

describe("ScopePicker", () => {
  it("lists ready documents with format badges", () => {
    renderWithRouter(<ScopePicker documents={readyDocuments} />);

    expect(screen.getByRole("checkbox", { name: /contract-a\.pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /kickoff-deck\.pptx/i })).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("pptx")).toBeInTheDocument();
  });

  it("shows an empty state when no documents are ready", () => {
    renderWithRouter(<ScopePicker documents={[]} />);

    expect(screen.getByText(/no documents are ready yet/i)).toBeInTheDocument();
  });

  it("disables start until a document is selected and tracks the count", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ScopePicker documents={readyDocuments} />);

    const startButton = screen.getByRole("button", { name: /start conversation/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByText("0 documents selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /contract-a\.pdf/i }));
    expect(startButton).toBeEnabled();
    expect(screen.getByText("1 document selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /kickoff-deck\.pptx/i }));
    expect(screen.getByText("2 documents selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /contract-a\.pdf/i }));
    expect(screen.getByText("1 document selected")).toBeInTheDocument();
  });

  it("shows an upgrade dialog when a free user tries to add a second document", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ScopePicker documents={readyDocuments} maxDocumentScope={1} />);

    const first = screen.getByRole("checkbox", { name: /contract-a\.pdf/i });
    const second = screen.getByRole("checkbox", { name: /kickoff-deck\.pptx/i });

    await user.click(first);
    await user.click(second);

    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
    expect(screen.getByRole("dialog", { name: /upgrade for multi-document chat/i })).toBeInTheDocument();
    expect(screen.getByText(/multi-document conversations are available on the pro plan/i)).toBeInTheDocument();
    expect(screen.getByText("1 document selected")).toBeInTheDocument();
  });

  it("creates a conversation with the selected documents and optional title", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    renderWithRouter(<ScopePicker documents={readyDocuments} onCreate={onCreate} />);
    await user.click(screen.getByRole("checkbox", { name: /contract-a\.pdf/i }));
    await user.click(screen.getByRole("checkbox", { name: /kickoff-deck\.pptx/i }));
    await user.type(screen.getByRole("textbox", { name: /title/i }), "Contract vs deck");
    await user.click(screen.getByRole("button", { name: /start conversation/i }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(["doc-1", "doc-2"], "Contract vs deck");
  });

  it("omits the title when it is left blank", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    renderWithRouter(<ScopePicker documents={readyDocuments} onCreate={onCreate} />);
    await user.click(screen.getByRole("checkbox", { name: /contract-a\.pdf/i }));
    await user.click(screen.getByRole("button", { name: /start conversation/i }));

    expect(onCreate).toHaveBeenCalledWith(["doc-1"], undefined);
  });
});
