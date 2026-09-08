import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentLibrary } from "../documents/DocumentLibrary";
import { mockDocuments } from "../../mocks/documents";

describe("DocumentLibrary", () => {
  it("labels ready, failed, processing, and deleting documents", () => {
    render(<DocumentLibrary documents={mockDocuments} />);

    expect(screen.getByText("Ready to chat")).toBeInTheDocument();
    expect(screen.getByText(/processing failed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/preparing document for chat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/deleting document/i)).toBeInTheDocument();
  });
});
