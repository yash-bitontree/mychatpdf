import { ApiClient } from "./client";
import { FolderSummary } from "../types";

interface BackendFolderSummary {
  id: string;
  name: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export function mapFolderSummary(folder: BackendFolderSummary): FolderSummary {
  return {
    id: folder.id,
    name: folder.name,
    documentCount: folder.document_count,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at
  };
}

export async function listFolders(client: ApiClient): Promise<FolderSummary[]> {
  const response = await client.request<{ items: BackendFolderSummary[] }>("/api/folders");
  return response.items.map(mapFolderSummary);
}

export async function createFolder(client: ApiClient, name: string): Promise<FolderSummary> {
  const response = await client.request<BackendFolderSummary>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  return mapFolderSummary(response);
}

export async function renameFolder(client: ApiClient, folderId: string, name: string): Promise<FolderSummary> {
  const response = await client.request<BackendFolderSummary>(`/api/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
  return mapFolderSummary(response);
}

export async function deleteFolder(client: ApiClient, folderId: string) {
  return client.request<{ status: string }>(`/api/folders/${folderId}`, {
    method: "DELETE"
  });
}
