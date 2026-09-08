import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../api/client";
import { renderWithRouter } from "../../test/test-utils";
import { FolderView } from "./FolderView";

const folderId = "folder-1";

const backendFolders = {
  items: [
    {
      id: folderId,
      name: "Research",
      document_count: 1,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z"
    },
    {
      id: "folder-2",
      name: "Archive",
      document_count: 0,
      created_at: "2026-07-02T00:00:00Z",
      updated_at: "2026-07-02T00:00:00Z"
    }
  ]
};

const backendDocuments = {
  items: [
    {
      id: "doc-1",
      folder_id: folderId,
      original_filename: "paper.pdf",
      status: "ready",
      file_size_bytes: 1024,
      page_count: 4,
      created_at: "2026-07-01T00:00:00Z"
    }
  ],
  next_cursor: null
};

function createApiClient(requests: Array<{ url: string; method: string; body?: BodyInit | null }>) {
  return new ApiClient({
    fetcher: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body });

      if (method === "GET" && url === "/api/folders") {
        return new Response(JSON.stringify(backendFolders), { status: 200 });
      }
      if (method === "GET" && url.startsWith("/api/documents?")) {
        return new Response(JSON.stringify(backendDocuments), { status: 200 });
      }
      if (method === "POST" && url === "/api/chats") {
        return new Response(
          JSON.stringify({
            id: "chat-9",
            title: null,
            documents: [],
            folder: { id: folderId, name: "Research" },
            created_at: "2026-07-03T00:00:00Z",
            updated_at: "2026-07-03T00:00:00Z"
          }),
          { status: 201 }
        );
      }
      if (method === "PATCH" && url === `/api/folders/${folderId}`) {
        return new Response(
          JSON.stringify({
            id: folderId,
            name: "Papers",
            document_count: 1,
            created_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-03T00:00:00Z"
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ detail: `Unhandled: ${method} ${url}` }), { status: 404 });
    }
  });
}

function renderFolderView(
  requests: Array<{ url: string; method: string; body?: BodyInit | null }>,
  overrides: Partial<Parameters<typeof FolderView>[0]> = {}
) {
  return renderWithRouter(
    <FolderView
      api={createApiClient(requests)}
      folderId={folderId}
      onOpenDocument={vi.fn()}
      onOpenChat={vi.fn()}
      onDeleted={vi.fn()}
      onUploadFile={vi.fn()}
      {...overrides}
    />
  );
}

describe("FolderView", () => {
  it("renders the folder name and its documents", async () => {
    renderFolderView([]);

    expect(await screen.findByRole("heading", { name: "Research" })).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 document in this folder")).toBeInTheDocument();
  });

  it("renames the folder inline", async () => {
    const requests: Array<{ url: string; method: string; body?: BodyInit | null }> = [];
    const user = userEvent.setup();
    renderFolderView(requests);
    await screen.findByRole("heading", { name: "Research" });

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Folder name for Research");
    await user.clear(input);
    await user.type(input, "Papers{Enter}");

    expect(await screen.findByRole("heading", { name: "Papers" })).toBeInTheDocument();
    const renameRequest = requests.find((request) => request.method === "PATCH");
    expect(renameRequest?.url).toBe(`/api/folders/${folderId}`);
    expect(renameRequest?.body).toBe(JSON.stringify({ name: "Papers" }));
  });

  it("starts a folder chat and navigates to it", async () => {
    const requests: Array<{ url: string; method: string; body?: BodyInit | null }> = [];
    const onOpenChat = vi.fn();
    const user = userEvent.setup();
    renderFolderView(requests, { onOpenChat });
    await screen.findByRole("heading", { name: "Research" });

    await user.click(screen.getByRole("button", { name: /chat with folder/i }));

    await waitFor(() => expect(onOpenChat).toHaveBeenCalledWith("chat-9"));
    const createRequest = requests.find((request) => request.method === "POST");
    expect(createRequest?.body).toBe(JSON.stringify({ folder_id: folderId }));
  });


  it("shows the premium notice when folder chat is unavailable", async () => {
    renderFolderView([], { folderChatAvailable: false });

    expect(await screen.findByText(/folder chat is available on the pro plan/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chat with folder/i })).toBeDisabled();
  });
  it("shows the delete confirmation wording", async () => {
    const user = userEvent.setup();
    renderFolderView([]);
    await screen.findByRole("heading", { name: "Research" });

    await user.click(screen.getByRole("button", { name: "Delete folder" }));

    expect(
      screen.getByText("Documents move back to your library. Conversations with this folder are deleted.")
    ).toBeInTheDocument();
  });
});
