import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, MessagesSquare, Pencil, Trash2 } from "lucide-react";
import { ApiClient, LimitExceededError } from "../../api/client";
import { createChat } from "../../api/chats";
import { deleteDocument, listDocuments, moveDocument, retryDocumentProcessing } from "../../api/documents";
import { deleteFolder, listFolders, renameFolder } from "../../api/folders";
import { DocumentSummary, FolderSummary } from "../../types";
import { LimitExceededNotice } from "../billing/LimitExceededNotice";
import { DocumentLibrary } from "../documents/DocumentLibrary";
import { UploadDropzone } from "../upload/UploadDropzone";

interface FolderViewProps {
  api: ApiClient | null;
  folderId: string;
  onOpenDocument: (documentId: string) => void;
  onOpenChat: (chatId: string) => void;
  onDeleted: () => void;
  onUploadFile: (file: File) => Promise<void>;
  folderChatAvailable?: boolean;
  maxFileSizeMb?: number;
  onFoldersChanged?: () => void;
}

export function FolderView({
  api,
  folderId,
  onOpenDocument,
  onOpenChat,
  onDeleted,
  onUploadFile,
  folderChatAvailable,
  maxFileSizeMb,
  onFoldersChanged
}: FolderViewProps) {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | LimitExceededError | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const renameCommittedRef = useRef(false);

  const folder = folders.find((candidate) => candidate.id === folderId) ?? null;

  useEffect(() => {
    if (!api) {
      return;
    }

    const apiClient = api;
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setIsRenaming(false);
    setIsConfirmingDelete(false);

    void Promise.all([listFolders(apiClient), listDocuments(apiClient, folderId)])
      .then(([nextFolders, nextDocuments]) => {
        if (!cancelled) {
          setFolders(nextFolders);
          setDocuments(nextDocuments);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load this folder.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, folderId]);

  async function refreshDocuments() {
    if (!api) {
      return;
    }
    const nextDocuments = await listDocuments(api, folderId);
    setDocuments(nextDocuments);
  }

  function startRename() {
    renameCommittedRef.current = false;
    setIsConfirmingDelete(false);
    setRenameDraft(folder?.name ?? "");
    setIsRenaming(true);
  }

  function commitRename() {
    if (renameCommittedRef.current) {
      return;
    }
    renameCommittedRef.current = true;
    setIsRenaming(false);
    const name = renameDraft.trim();
    if (!api || !name || name === folder?.name) {
      return;
    }
    void renameFolder(api, folderId, name)
      .then((updated) => {
        setFolders((current) => current.map((candidate) => (candidate.id === folderId ? updated : candidate)));
        onFoldersChanged?.();
      })
      .catch(() => setError("Unable to rename this folder."));
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      renameCommittedRef.current = true;
      setIsRenaming(false);
    }
  }

  function handleDelete() {
    if (!api) {
      return;
    }
    void deleteFolder(api, folderId)
      .then(() => {
        onFoldersChanged?.();
        onDeleted();
      })
      .catch(() => {
        setIsConfirmingDelete(false);
        setError("Unable to delete this folder.");
      });
  }

  async function handleStartChat() {
    if (folderChatAvailable === false) {
      setError(new LimitExceededError("folder_chat", 0, 0));
      return;
    }
    if (!api || isStartingChat) {
      return;
    }
    setIsStartingChat(true);
    setError(null);
    try {
      const chat = await createChat(api, { folderId });
      onOpenChat(chat.id);
    } catch (caught) {
      setError(caught instanceof LimitExceededError ? caught : "Unable to start a conversation with this folder right now.");
      setIsStartingChat(false);
    }
  }

  function handleMove(documentId: string, nextFolderId: string | null) {
    if (!api) {
      return;
    }
    void moveDocument(api, documentId, nextFolderId)
      .then(() => {
        onFoldersChanged?.();
        return refreshDocuments();
      })
      .catch(() => setError("Unable to move this document."));
  }

  async function handleUpload(file: File) {
    setError(null);
    try {
      await onUploadFile(file);
    } catch (caught) {
      setError(caught instanceof LimitExceededError ? caught : "Upload failed. Please try again.");
    }
  }

  const folderName = folder?.name ?? "Folder";
  const folderChatUpgradeError = folderChatAvailable === false ? new LimitExceededError("folder_chat", 0, 0) : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Folder</p>
          {isRenaming ? (
            <input
              autoFocus
              aria-label={`Folder name for ${folderName}`}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={onRenameKeyDown}
              onBlur={commitRename}
              className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-xl font-semibold text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100"
            />
          ) : (
            <h1 className="truncate text-3xl font-semibold text-ink">{folderName}</h1>
          )}
          <p className="mt-1 text-sm text-slate-600">
            {documents.length} {documents.length === 1 ? "document" : "documents"} in this folder
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleStartChat()}
            disabled={isStartingChat || folderChatAvailable === false}
            className="brand-gradient inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isStartingChat ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <MessagesSquare size={16} aria-hidden="true" />
            )}
            Chat with folder
          </button>
          <button
            type="button"
            onClick={startRename}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-teal-100 px-3 text-sm font-medium text-ink hover:border-sea hover:bg-teal-50"
          >
            <Pencil size={16} aria-hidden="true" />
            Rename
          </button>
          <button
            type="button"
            aria-label="Delete folder"
            onClick={() => {
              setIsRenaming(false);
              setIsConfirmingDelete(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      {isConfirmingDelete ? (
        <div role="alertdialog" aria-label={`Delete ${folderName}`} className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Delete this folder?</p>
          <p className="mt-1 text-sm text-red-700">
            Documents move back to your library. Conversations with this folder are deleted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex min-h-10 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {typeof error === "string" ? error : <LimitExceededNotice error={error} />}
        </div>
      ) : null}

      {folderChatUpgradeError ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <LimitExceededNotice error={folderChatUpgradeError} />
        </div>
      ) : null}

      {isLoading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading folder...
        </p>
      ) : documents.length === 0 ? (
        <div className="brand-soft-surface mb-6 rounded-lg border border-dashed border-teal-200 p-8 text-center shadow-panel">
          <h2 className="text-xl font-semibold text-ink">No documents in this folder yet</h2>
          <p className="mt-2 text-sm text-slate-600">Upload a document below or move one in from your library.</p>
        </div>
      ) : (
        <div className="mb-6">
          <DocumentLibrary
            compact
            documents={documents}
            folders={folders}
            onOpen={onOpenDocument}
            onMove={handleMove}
            onDelete={(documentId) => {
              if (!api) {
                return;
              }
              void deleteDocument(api, documentId)
                .then(() => {
                  onFoldersChanged?.();
                  return refreshDocuments();
                })
                .catch(() => undefined);
            }}
            onRetry={(documentId) => {
              if (!api) {
                return;
              }
              void retryDocumentProcessing(api, documentId)
                .then(refreshDocuments)
                .catch(() => undefined);
            }}
          />
        </div>
      )}

      <UploadDropzone maxFileSizeMb={maxFileSizeMb} onAccepted={handleUpload} initialProgress={72} />
    </section>
  );
}
