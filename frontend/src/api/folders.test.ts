import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";
import { createFolder, deleteFolder, listFolders, mapFolderSummary, renameFolder } from "./folders";

const backendFolder = {
  id: "folder-1",
  name: "Research",
  document_count: 3,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z"
};

describe("folder API helpers", () => {
  it("maps backend folder summaries to frontend folder shape", () => {
    expect(mapFolderSummary(backendFolder)).toEqual({
      id: "folder-1",
      name: "Research",
      documentCount: 3,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z"
    });
  });

  it("lists folders", async () => {
    const client = new ApiClient({
      fetcher: async (input) => {
        expect(input).toBe("/api/folders");
        return new Response(JSON.stringify({ items: [backendFolder] }), { status: 200 });
      }
    });

    await expect(listFolders(client)).resolves.toEqual([mapFolderSummary(backendFolder)]);
  });

  it("creates a folder with the given name", async () => {
    let requestBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/folders");
        expect(init?.method).toBe("POST");
        requestBody = init?.body;
        return new Response(JSON.stringify({ ...backendFolder, document_count: 0 }), { status: 201 });
      }
    });

    const folder = await createFolder(client, "Research");
    expect(folder).toMatchObject({ id: "folder-1", name: "Research", documentCount: 0 });
    expect(requestBody).toBe(JSON.stringify({ name: "Research" }));
  });

  it("renames a folder through the PATCH endpoint", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/folders/folder-1");
        expect(init?.method).toBe("PATCH");
        expect(init?.body).toBe(JSON.stringify({ name: "Papers" }));
        return new Response(JSON.stringify({ ...backendFolder, name: "Papers" }), { status: 200 });
      }
    });

    await expect(renameFolder(client, "folder-1", "Papers")).resolves.toMatchObject({ name: "Papers" });
  });

  it("deletes a folder", async () => {
    const client = new ApiClient({
      fetcher: async (input, init) => {
        expect(input).toBe("/api/folders/folder-1");
        expect(init?.method).toBe("DELETE");
        return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
      }
    });

    await expect(deleteFolder(client, "folder-1")).resolves.toEqual({ status: "deleted" });
  });
});
