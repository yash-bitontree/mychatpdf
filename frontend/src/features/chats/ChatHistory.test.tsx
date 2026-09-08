import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatHistory } from "./ChatHistory";
import { ChatSummary } from "../../types";

const mockChats: ChatSummary[] = [
  {
    id: "chat-1",
    title: "Quarterly numbers",
    documents: [{ id: "doc-1", originalFilename: "Q2-market-report.pdf" }],
    createdAt: "2026-06-10T09:30:00Z",
    updatedAt: "2026-06-12T15:15:00Z"
  },
  {
    id: "chat-2",
    title: null,
    documents: [
      { id: "doc-1", originalFilename: "Q2-market-report.pdf" },
      { id: "doc-2", originalFilename: "policy-handbook.pdf" }
    ],
    createdAt: "2026-06-11T08:00:00Z",
    updatedAt: "2026-06-11T08:05:00Z"
  }
];

describe("ChatHistory", () => {
  it("lists conversations with titles, document names, and dates", () => {
    render(<ChatHistory chats={mockChats} />);

    expect(screen.getByRole("button", { name: /open quarterly numbers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open untitled conversation/i })).toBeInTheDocument();
    expect(screen.getByText("Q2-market-report.pdf, policy-handbook.pdf")).toBeInTheDocument();
    expect(screen.getByText("Jun 12, 2026")).toBeInTheDocument();
  });

  it("shows an empty state when there are no conversations", () => {
    render(<ChatHistory chats={[]} />);

    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("opens a conversation when its row is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<ChatHistory chats={mockChats} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /open quarterly numbers/i }));

    expect(onOpen).toHaveBeenCalledWith(mockChats[0]);
  });

  it("renames a conversation inline and saves on Enter", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(<ChatHistory chats={mockChats} onRename={onRename} />);
    await user.click(screen.getByRole("button", { name: /rename quarterly numbers/i }));

    const input = screen.getByRole("textbox", { name: /conversation title/i });
    expect(input).toHaveValue("Quarterly numbers");

    await user.clear(input);
    await user.type(input, "Board summary{Enter}");

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("chat-1", "Board summary");
    expect(screen.queryByRole("textbox", { name: /conversation title/i })).not.toBeInTheDocument();
  });

  it("cancels an inline rename on Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(<ChatHistory chats={mockChats} onRename={onRename} />);
    await user.click(screen.getByRole("button", { name: /rename quarterly numbers/i }));
    await user.keyboard("{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /conversation title/i })).not.toBeInTheDocument();
  });

  it("deletes a conversation only after the confirm step", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<ChatHistory chats={mockChats} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: /delete quarterly numbers/i }));

    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm delete/i }));
    expect(onDelete).toHaveBeenCalledWith("chat-1");
  });

  it("keeps the conversation when the delete confirm step is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<ChatHistory chats={mockChats} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: /delete quarterly numbers/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /confirm delete/i })).not.toBeInTheDocument();
  });

  it("requests more conversations from the load-more button", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    render(<ChatHistory chats={mockChats} hasMore onLoadMore={onLoadMore} />);
    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
