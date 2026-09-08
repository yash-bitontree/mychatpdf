# Phase 1 Development Specification: AI Document Chat Platform

Date: 2026-06-13  
Status: Approved for Phase 1 planning  
Source proposal: `/Users/yashvibhandik/Downloads/Phase1_AI_Document_Chat_Platform_Proposal.pdf`  
Primary UX reference: `https://www.chatpdf.com/`, reviewed on 2026-06-13

## 1. Executive Summary

Phase 1 delivers an authenticated AI document chat MVP that lets users upload PDF files, process them into searchable document chunks, and ask grounded questions through a conversational interface. The product experience should feel close to ChatPDF's document-first workflow: fast upload, visible chat/document history, a side-by-side document and chat workspace, and source-backed answers that make it easy to verify where information came from.

Unlike ChatPDF's public no-sign-up-first flow, this platform requires authentication before upload or chat. Clerk is the identity provider. The frontend is a plain React single-page application. The backend is FastAPI. Uploaded PDFs are stored in Wasabi S3-compatible object storage. Document chunks are embedded with OpenAI embeddings and stored in Pinecone for semantic retrieval. AI answers and summaries are generated with OpenAI chat models using retrieved context from Pinecone.

Phase 1 is scoped to a per-user authenticated document chat workflow. Each user owns their own documents and chats. It intentionally excludes subscriptions, team collaboration, multi-document conversations, advanced admin tools, usage billing, non-PDF formats, and other future SaaS capabilities.

## 2. Goals

### 2.1 Product Goals

- Allow authenticated users to upload PDF documents.
- Process each PDF into searchable text chunks with page references.
- Let users ask natural-language questions about a single document.
- Generate answers grounded in retrieved document context.
- Show page numbers and source excerpts for verification.
- Provide quick AI summaries, key takeaways, insights, and action items.
- Provide a simple document library and chat history.
- Deliver a polished, ChatPDF-style UX that feels fast, focused, and easy to understand.
- Deploy a production-ready MVP with baseline logging, monitoring, and secure configuration.

### 2.2 Engineering Goals

- Keep frontend and backend responsibilities clear.
- Use Clerk as the single source of authentication identity.
- Verify Clerk JWTs server-side before protected API access.
- Store original PDFs in Wasabi with private access only.
- Store document metadata, chat messages, and job status in a relational database.
- Store vector embeddings and chunk metadata in Pinecone.
- Keep RAG behavior deterministic enough to test and troubleshoot.
- Support reliable retryable PDF processing.
- Provide clear API contracts for frontend integration.

### 2.3 Non-Goals

- Anonymous upload or anonymous chat.
- Multi-document chat.
- Folder/workspace management beyond a simple document list.
- Subscription, billing, limits, or payment integration.
- Team sharing, public links, or collaboration.
- Admin panel.
- DOCX, PPTX, TXT, RTF, image, video, URL, or pasted-text imports.
- OCR for scanned PDFs in Phase 1.
- Multilingual UX or guaranteed multilingual chat behavior.
- Advanced retrieval features such as hybrid search, reranking, agentic retrieval, metadata filters, or custom model selection.

## 3. Target Users

### 3.1 Primary Users

- Students reviewing course materials, lecture notes, reports, and papers.
- Researchers reviewing papers, articles, and long-form PDFs.
- Professionals reviewing contracts, manuals, reports, policies, or internal documents.

### 3.2 User Jobs

- Upload a PDF and quickly understand what it says.
- Ask questions without manually searching page by page.
- Verify answers by checking cited source pages.
- Generate a short summary, key takeaways, and action items.
- Return to a previous document and continue a conversation.

## 4. UX Principles

The UI should be inspired by ChatPDF's successful interaction model, not copied pixel-for-pixel.

### 4.1 Experience Traits

- Document-first: the product centers on uploaded files and their conversations.
- Low friction after login: the user should immediately see where to upload or resume.
- Split workspace: PDF and chat stay visible together on desktop.
- Citable answers: every substantive AI answer should include source references when possible.
- Calm visual style: clean surfaces, restrained colors, clear hierarchy, and minimal decoration.
- Fast feedback: upload, processing, answer generation, and errors all need visible states.
- Trustworthy: answers must state when the document does not contain enough evidence.

### 4.2 ChatPDF-Like Patterns To Capture

- Left rail with chats/documents and account controls.
- Primary upload entry point visible on first authenticated screen.
- Document chat workspace with document viewer and chat side by side.
- Prompt suggestions to start a conversation.
- Source citations with page references.
- Simple history so users can return to previous chats.
- Clear empty states and processing states.

### 4.3 Differences From ChatPDF

- Login is required before uploading or chatting.
- Phase 1 supports only PDFs.
- Phase 1 supports one active document per conversation.
- No folders, sharing, pricing, public anonymous trial, or multi-file chats.
- The UI should be original while using similar workflow conventions.

## 5. System Architecture

### 5.1 High-Level Components

- React SPA: authenticated app shell, upload flow, document library, PDF viewer, chat UI.
- Clerk: sign-up, login, session management, frontend auth state, JWT issuance.
- FastAPI backend: protected REST APIs, upload handling, document processing orchestration, chat/RAG generation, summaries.
- Relational database: users, documents, processing jobs, chats, messages, source references.
- Wasabi object storage: private PDF file storage.
- OpenAI embeddings API: generate vectors for document chunks.
- Pinecone: store and retrieve chunk embeddings.
- OpenAI chat API: generate grounded answers, summaries, insights, and action items.
- Background worker: asynchronous PDF extraction, chunking, embedding, and indexing.

### 5.2 Recommended Runtime Layout

```
repo/
  frontend/
    React SPA
  backend/
    FastAPI app
    background worker
  docs/
    phase-1-development-spec.md
```

The exact scaffold can be created later during implementation planning. This spec defines expected behavior and interfaces.

### 5.3 Request Flow Overview

1. User authenticates through Clerk in the React app.
2. React receives a Clerk session token.
3. React calls FastAPI with `Authorization: Bearer <clerk_jwt>`.
4. FastAPI verifies the Clerk JWT and resolves the application user.
5. User uploads a PDF through FastAPI.
6. FastAPI validates the file, creates document and job records, stores the PDF in Wasabi, and enqueues processing.
7. Worker extracts text, chunks by page-aware segments, creates OpenAI embeddings, and upserts vectors into Pinecone.
8. User opens the document chat workspace once processing succeeds.
9. User sends a question.
10. FastAPI embeds the question, retrieves relevant chunks from Pinecone, builds a grounded prompt, calls OpenAI chat, stores the response, and returns answer plus citations.

## 6. Technology Decisions

### 6.1 Frontend

- Plain React SPA.
- Vite is recommended for local development and build tooling.
- React Router for authenticated routes.
- Clerk React SDK for sign-in, sign-up, user button, token access, and protected UI state.
- PDF viewer library such as `react-pdf` or PDF.js wrapper.
- Fetch or a lightweight API client for backend calls.
- Streaming chat responses are preferred through Server-Sent Events. Non-streaming JSON is acceptable for the first implementation if schedule pressure requires it.

### 6.2 Backend

- FastAPI with Pydantic request and response models.
- Uvicorn or Gunicorn/Uvicorn for runtime.
- SQLAlchemy or SQLModel for relational persistence.
- Alembic for schema migrations.
- Background jobs through Celery, RQ, Dramatiq, or FastAPI-compatible worker process. The implementation plan should select one based on hosting constraints.
- `boto3` for Wasabi S3-compatible storage.
- Pinecone Python SDK for vector upsert, query, and delete.
- OpenAI Python SDK for embeddings and chat completions/responses.

### 6.3 Database

Use PostgreSQL unless deployment constraints require another relational database. PostgreSQL is preferred because it is stable, production-friendly, and works well for chat/message metadata.

### 6.4 Object Storage

Use Wasabi private buckets through the S3-compatible API. PDFs must not be public. The backend should generate short-lived signed URLs only when the authenticated owner needs to view or download a document.

### 6.5 Vector Storage

Use Pinecone for document chunk embeddings. Each vector should include document and user metadata so retrieval can be constrained to the current user's selected document.

### 6.6 AI Providers

- Embeddings: OpenAI embedding model selected during implementation. Recommended: current small, cost-efficient embedding model unless quality testing requires a larger one.
- Chat generation: OpenAI chat model selected during implementation. Recommended: current cost-efficient general model for MVP, with temperature low enough for grounded factual answers.

## 7. Authentication And Authorization

### 7.1 Clerk Frontend Behavior

- Unauthenticated users can see a minimal landing or sign-in screen.
- Upload, dashboard, document library, and chat workspace require Clerk auth.
- The frontend should use Clerk components or custom wrappers for:
  - Sign in
  - Sign up
  - Session loading
  - User/account menu
  - Sign out

### 7.2 FastAPI Auth Behavior

- Every protected endpoint must require a valid Clerk JWT.
- FastAPI must validate:
  - Token signature through Clerk JWKS.
  - Issuer.
  - Audience if configured.
  - Expiration.
  - Subject claim.
- The Clerk user ID becomes the stable external identity.
- On first authenticated API request, FastAPI should create or update an application user record.

### 7.3 Authorization Rules

- A user can access only documents they own.
- A user can access only chats and messages attached to their own documents.
- A user can request signed Wasabi URLs only for their own documents.
- Pinecone queries must always include document/user constraints through namespace and/or metadata filters.
- Deleting a document must remove or disable access to its PDF, chunks, chats, messages, and vectors.

## 8. UX And Screen Specifications

### 8.1 App Routes

- `/sign-in`: Clerk sign-in.
- `/sign-up`: Clerk sign-up.
- `/app`: authenticated home with upload and recent documents.
- `/app/documents`: authenticated document library.
- `/app/documents/:documentId`: document chat workspace.
- `/app/settings`: minimal account/settings screen if needed for sign-out and profile access.

### 8.2 Authenticated App Shell

Desktop layout:

- Left rail, fixed width around 260 to 320 px:
  - Product logo/name.
  - New upload button.
  - Recent chats/documents list.
  - Processing indicators for active documents.
  - Account menu at bottom.
- Main content:
  - Upload/home view, library, or document workspace.

Mobile layout:

- Collapsible rail or drawer.
- Document viewer and chat switch through tabs or stacked layout.
- Chat composer must remain easy to reach.

### 8.3 Authenticated Home

Purpose: let the user upload quickly or resume recent work.

Required elements:

- Upload drop zone with PDF-only messaging.
- Button to choose PDF.
- Recent documents list.
- Empty state for first-time users.
- Processing status cards if documents are currently being processed.

Required behavior:

- Drag-and-drop and file picker both supported.
- Reject non-PDF files before upload.
- Show upload progress if possible.
- After successful upload, show processing state and navigate to the document workspace or document status view.

### 8.4 Document Library

Purpose: show all uploaded documents for the current user.

Required fields per document:

- File name.
- Processing status.
- Upload date.
- Page count if available.
- File size.
- Last opened or last chat activity if available.

Required actions:

- Open document.
- Delete document.
- Retry processing if processing failed.

Out of scope:

- Folders.
- Bulk actions.
- Tags.
- Sharing.

### 8.5 Document Workspace

Desktop layout:

- Left app rail remains visible.
- Main workspace uses two panes:
  - PDF viewer pane.
  - Chat pane.
- The pane order can be PDF left and chat right, or chat left and PDF right. The recommended default is PDF left and chat right because source verification is a primary trust feature.
- Pane resizing is optional for Phase 1.

PDF viewer requirements:

- Render the uploaded PDF from a short-lived signed URL.
- Show current page number and total pages.
- Support page navigation.
- Support zoom in/out.
- Support citation jumps to page numbers.
- Highlighting exact citation text is preferred but optional for Phase 1.

Chat pane requirements:

- Show document title.
- Show processing status if not ready.
- Show suggested starter prompts after processing:
  - "Summarize this document."
  - "What are the key takeaways?"
  - "List action items."
  - "What should I pay attention to?"
- Show user and assistant messages in chronological order.
- Show assistant source citations below answers.
- Composer supports multiline input and send button.
- Send is disabled while document is not ready or answer generation is active.
- A loading or streaming state appears while the answer is being generated.

Citation interaction:

- Each citation displays page number and a short excerpt.
- Clicking a citation navigates the PDF viewer to the cited page.
- If exact highlighting is implemented, the relevant excerpt should be highlighted.

### 8.6 Processing States

Document status values:

- `uploaded`: PDF stored, processing not started.
- `extracting`: worker is extracting text.
- `chunking`: worker is splitting document into chunks.
- `embedding`: worker is generating OpenAI embeddings.
- `indexing`: worker is upserting to Pinecone.
- `ready`: document can be summarized and queried.
- `failed`: processing failed and user can retry.
- `deleting`: deletion in progress.

User-facing copy should be clear and brief:

- "Uploading PDF..."
- "Reading document..."
- "Preparing document for chat..."
- "Ready to chat."
- "Processing failed. Retry or delete this document."

### 8.7 Error UX

Required error states:

- Unauthenticated access: redirect to sign in.
- File too large.
- Unsupported file type.
- PDF text extraction failed.
- Scanned or image-only PDF detected.
- OpenAI embedding failure.
- Pinecone indexing failure.
- OpenAI chat failure.
- Wasabi upload or signed URL failure.
- Network timeout.
- Attempt to access another user's document.

Errors should be actionable. For example, a scanned PDF failure should say that Phase 1 supports text-based PDFs only.

## 9. Functional Requirements

### 9.1 Authentication

- Users can sign up and sign in through Clerk.
- Users remain signed in across refreshes according to Clerk session behavior.
- Protected app routes require authenticated Clerk session.
- Backend rejects requests without a valid Clerk JWT.

Acceptance criteria:

- An unauthenticated user cannot upload a PDF.
- An unauthenticated user cannot call protected APIs.
- User A cannot access User B's document metadata, PDF URL, chat messages, or vectors.

### 9.2 PDF Upload

- Authenticated users can upload one PDF at a time.
- Upload accepts drag-and-drop and file picker.
- Backend validates MIME type and extension.
- Backend enforces configured max file size.
- Backend stores original PDF in Wasabi.
- Backend creates a document record and processing job.
- Frontend shows upload and processing status.

Recommended Phase 1 limits:

- File type: `.pdf` only.
- Max file size: configurable, default 20 MB.
- Max pages: configurable, default 300 pages.

Acceptance criteria:

- Valid PDFs are accepted and stored.
- Non-PDF files are rejected.
- Oversized files are rejected with clear UI copy.
- Upload failure does not create a ready document.

### 9.3 PDF Processing

- Worker extracts text from each page.
- Worker preserves page numbers for each extracted text segment.
- Worker detects documents with no extractable text.
- Worker chunks extracted text into embedding-ready segments.
- Worker records chunk metadata:
  - chunk ID
  - document ID
  - user ID
  - page start
  - page end
  - text excerpt
  - token or character length
  - chunk index
- Worker generates OpenAI embeddings for chunks.
- Worker upserts chunk vectors into Pinecone.
- Worker marks document `ready` only after successful Pinecone indexing.

Acceptance criteria:

- A text-based PDF becomes ready after processing.
- Chunks in Pinecone can be traced back to document ID and page numbers.
- A failed processing step records a useful failure reason.
- Retrying a failed job does not create duplicate active vectors.

### 9.4 Document Library

- Users can view their uploaded documents.
- Users can open ready documents.
- Users can see processing status for non-ready documents.
- Users can delete documents.
- Users can retry failed processing jobs.

Acceptance criteria:

- Library lists only the current user's documents.
- Deleted documents disappear from the library.
- Deletion removes or makes inaccessible the Wasabi object, DB records as appropriate, and Pinecone vectors.

### 9.5 Chat

- Users can chat with a single ready document.
- Users can ask follow-up questions.
- Backend stores user messages and assistant responses.
- AI responses use retrieved document context.
- AI responses include citations when context is used.
- AI responses should decline or qualify when answer support is insufficient.

Acceptance criteria:

- User can ask a question and receive an answer.
- Answer is generated from retrieved context for the selected document only.
- Answer includes page references and snippets when relevant.
- Chat history persists after refresh.
- Questions cannot be sent for documents that are not ready.

### 9.6 Summaries And Insights

The system must support quick generation for:

- Document summary.
- Key takeaways.
- Important insights.
- Action items.

Implementation options:

- Treat each action as a predefined chat prompt stored as a normal assistant response.
- Or provide dedicated summary endpoints that generate and store structured outputs.

Recommended Phase 1 approach:

- Use predefined chat prompts for simplicity and consistency with the chat history.

Acceptance criteria:

- User can click suggested prompts to generate summary-oriented answers.
- Generated summary responses include citations when possible.
- Summary responses are saved in chat history.

### 9.7 Source Referencing

- Each assistant answer should include sources for factual claims when retrieval context is available.
- Each source should include:
  - page number
  - excerpt
  - chunk ID or source ID
  - confidence or rank if available
- Frontend displays sources below the answer.
- Clicking a source navigates the PDF viewer to the page.

Acceptance criteria:

- Citation page numbers match the original PDF page numbering used by extraction.
- Source excerpts are short enough for UI display.
- A response with no sufficient evidence should say so instead of inventing citations.

## 10. RAG Pipeline Specification

### 10.1 Text Extraction

The worker extracts text page by page using a PDF text extraction library. The implementation plan should choose a Python library such as PyMuPDF or pypdf after testing extraction quality.

For each page:

- Extract raw text.
- Normalize whitespace.
- Preserve page number.
- Store page-level text only if useful for debugging or future reprocessing.

Scanned PDFs:

- If the document has little or no extractable text, mark processing failed with reason `no_extractable_text`.
- User-facing message: "This PDF appears to be scanned or image-based. Phase 1 supports text-based PDFs only."

### 10.2 Chunking

Recommended chunking strategy:

- Chunk by page-aware text windows.
- Target 800 to 1,200 tokens per chunk.
- Overlap 100 to 200 tokens between adjacent chunks.
- Avoid splitting mid-sentence when practical.
- Keep page start and page end metadata.

Chunk ID format:

```
doc_<document_id>_chunk_<chunk_index>
```

The actual internal ID can be UUID-based, but it must be stable enough to delete or replace vectors on retry.

### 10.3 Embeddings

For each chunk:

- Send chunk text to OpenAI embeddings API.
- Store returned vector in Pinecone.
- Do not store raw OpenAI response payloads unless needed for debugging.
- Log embedding failures without logging sensitive full document text.

Embedding batching:

- Batch chunks to reduce API overhead.
- Respect OpenAI rate limits.
- Retry transient failures with exponential backoff.

### 10.4 Pinecone Indexing

Pinecone vector metadata:

```json
{
  "user_id": "internal-user-id",
  "clerk_user_id": "clerk-user-id",
  "document_id": "document-id",
  "chunk_id": "chunk-id",
  "chunk_index": 12,
  "page_start": 5,
  "page_end": 6,
  "text_excerpt": "Short source excerpt for UI display",
  "created_at": "2026-06-13T00:00:00Z"
}
```

Namespace strategy:

- Recommended: one namespace per environment, for example `prod` and `staging`, with metadata filters for user and document.
- Alternative: one namespace per user or document. This can simplify deletion but may become harder to manage at scale.

Phase 1 recommendation:

- Use environment namespace plus strict metadata filters:
  - `user_id == current_user.id`
  - `document_id == selected_document.id`

### 10.5 Retrieval

For each user question:

1. Generate an embedding for the question.
2. Query Pinecone with top K vectors for the selected document.
3. Use metadata filters for user and document.
4. Recommended top K: 6 to 10.
5. Discard low-quality matches if score is below a configurable threshold.
6. Build context from retrieved chunk text or stored chunk content.

Important storage decision:

- Pinecone metadata should include short excerpts for UI.
- Full chunk text can be stored either in Pinecone metadata if size allows or in the relational database/object store.
- Recommended: store full chunk text in the relational database because Pinecone metadata has practical size limits and is not a document store.

### 10.6 Answer Generation

The backend builds a grounded prompt with:

- System instruction for document-grounded answering.
- User question.
- Retrieved context blocks with page numbers and chunk IDs.
- Instruction to cite page numbers.
- Instruction to say when context is insufficient.

Required model behavior:

- Answer only using retrieved context unless the user asks a general non-document question, in which case the assistant should explain that document-grounded answers require document evidence.
- Do not invent facts, citations, or page numbers.
- If the answer is not found in retrieved context, say the document does not provide enough information.
- Keep answers concise by default.
- Include citations after relevant claims or as a sources section.

Recommended response shape from backend:

```json
{
  "message_id": "assistant-message-id",
  "answer": "The generated answer.",
  "sources": [
    {
      "source_id": "source-id",
      "chunk_id": "chunk-id",
      "page_start": 3,
      "page_end": 3,
      "excerpt": "Relevant excerpt...",
      "score": 0.82
    }
  ]
}
```

## 11. Data Model

### 11.1 users

Purpose: local profile for Clerk-authenticated users.

Fields:

- `id`: UUID primary key.
- `clerk_user_id`: unique string.
- `email`: string nullable if unavailable.
- `name`: string nullable.
- `created_at`: timestamp.
- `updated_at`: timestamp.

### 11.2 documents

Purpose: uploaded PDF metadata and processing status.

Fields:

- `id`: UUID primary key.
- `user_id`: foreign key to users.
- `original_filename`: string.
- `content_type`: string.
- `file_size_bytes`: integer.
- `page_count`: integer nullable.
- `status`: enum.
- `failure_code`: string nullable.
- `failure_message`: string nullable.
- `wasabi_bucket`: string.
- `wasabi_object_key`: string.
- `pinecone_namespace`: string.
- `chunk_count`: integer default 0.
- `created_at`: timestamp.
- `updated_at`: timestamp.
- `processed_at`: timestamp nullable.
- `deleted_at`: timestamp nullable.

### 11.3 document_chunks

Purpose: chunk metadata and full text for retrieval prompt construction.

Fields:

- `id`: UUID primary key.
- `document_id`: foreign key to documents.
- `user_id`: foreign key to users.
- `chunk_index`: integer.
- `page_start`: integer.
- `page_end`: integer.
- `text`: text.
- `text_excerpt`: string.
- `token_count`: integer nullable.
- `pinecone_vector_id`: string.
- `created_at`: timestamp.

### 11.4 processing_jobs

Purpose: asynchronous ingestion job tracking.

Fields:

- `id`: UUID primary key.
- `document_id`: foreign key to documents.
- `user_id`: foreign key to users.
- `status`: enum queued/running/succeeded/failed.
- `current_step`: string.
- `attempt_count`: integer.
- `error_code`: string nullable.
- `error_message`: string nullable.
- `created_at`: timestamp.
- `started_at`: timestamp nullable.
- `finished_at`: timestamp nullable.

### 11.5 chats

Purpose: one chat thread per document for Phase 1.

Fields:

- `id`: UUID primary key.
- `document_id`: foreign key to documents.
- `user_id`: foreign key to users.
- `title`: string nullable.
- `created_at`: timestamp.
- `updated_at`: timestamp.

Phase 1 can create a chat automatically when a document is created or when the first message is sent.

### 11.6 messages

Purpose: user and assistant chat history.

Fields:

- `id`: UUID primary key.
- `chat_id`: foreign key to chats.
- `document_id`: foreign key to documents.
- `user_id`: foreign key to users.
- `role`: enum user/assistant/system.
- `content`: text.
- `status`: enum pending/succeeded/failed.
- `metadata`: JSON nullable.
- `created_at`: timestamp.

### 11.7 message_sources

Purpose: citations attached to assistant messages.

Fields:

- `id`: UUID primary key.
- `message_id`: foreign key to messages.
- `document_id`: foreign key to documents.
- `chunk_id`: foreign key to document_chunks nullable if chunk deleted.
- `page_start`: integer.
- `page_end`: integer.
- `excerpt`: text.
- `score`: float nullable.
- `rank`: integer.
- `created_at`: timestamp.

## 12. Wasabi Storage Specification

### 12.1 Bucket Access

- Bucket must be private.
- Public reads are disabled.
- Access keys live only in backend environment variables.
- Frontend never receives Wasabi credentials.

### 12.2 Object Key Structure

Recommended object key:

```
users/{user_id}/documents/{document_id}/original.pdf
```

This structure makes ownership clear and deletion predictable.

### 12.3 Upload Flow

Phase 1 recommended flow:

- Frontend uploads file to FastAPI.
- FastAPI streams file to Wasabi.
- FastAPI creates document record and job.

Reasoning:

- Easier auth enforcement.
- Easier file validation.
- Simpler Phase 1 implementation.

Future optimization:

- Direct browser-to-Wasabi upload using pre-signed POST can be considered later for larger files.

### 12.4 Viewing Flow

- Frontend requests a signed read URL from FastAPI.
- FastAPI verifies document ownership.
- FastAPI generates a short-lived Wasabi signed URL.
- Frontend passes signed URL to the PDF viewer.

Signed URL expiry:

- Recommended default: 5 to 15 minutes.

### 12.5 Deletion Flow

When a document is deleted:

- Mark document status `deleting`.
- Delete Wasabi object.
- Delete Pinecone vectors for that document.
- Soft-delete or hard-delete DB records according to retention policy.
- Phase 1 recommendation: soft-delete document metadata and hard-delete chunks/message text only if privacy requirements demand it. Since no explicit retention policy is defined, soft-delete metadata and remove storage/vector content.

## 13. API Specification

All protected endpoints require:

```
Authorization: Bearer <clerk_jwt>
```

All response bodies should use JSON except file upload multipart requests and optional streaming chat responses.

### 13.1 Auth/User

#### GET `/api/me`

Returns the current application user and syncs from Clerk if needed.

Response:

```json
{
  "id": "user-id",
  "clerk_user_id": "clerk-user-id",
  "email": "user@example.com",
  "name": "User Name"
}
```

### 13.2 Documents

#### GET `/api/documents`

Returns current user's documents.

Query params:

- `status`: optional.
- `limit`: optional, default 50.
- `cursor`: optional.

Response:

```json
{
  "items": [
    {
      "id": "document-id",
      "original_filename": "paper.pdf",
      "status": "ready",
      "file_size_bytes": 123456,
      "page_count": 12,
      "chunk_count": 24,
      "created_at": "2026-06-13T00:00:00Z",
      "processed_at": "2026-06-13T00:01:00Z"
    }
  ],
  "next_cursor": null
}
```

#### POST `/api/documents`

Uploads a PDF.

Request:

- Multipart form field `file`.

Response:

```json
{
  "id": "document-id",
  "status": "uploaded",
  "processing_job_id": "job-id"
}
```

#### GET `/api/documents/{document_id}`

Returns document details.

#### DELETE `/api/documents/{document_id}`

Deletes a document and associated storage/index data.

Response:

```json
{
  "status": "deleting"
}
```

#### POST `/api/documents/{document_id}/retry`

Retries processing for a failed document.

Response:

```json
{
  "processing_job_id": "job-id",
  "status": "queued"
}
```

#### GET `/api/documents/{document_id}/file-url`

Returns a short-lived signed URL for PDF viewing.

Response:

```json
{
  "url": "https://signed-wasabi-url",
  "expires_at": "2026-06-13T00:15:00Z"
}
```

### 13.3 Processing

#### GET `/api/documents/{document_id}/processing-status`

Returns status for polling.

Response:

```json
{
  "document_id": "document-id",
  "status": "embedding",
  "current_step": "Generating embeddings",
  "failure_code": null,
  "failure_message": null
}
```

Optional improvement:

- Provide SSE endpoint `/api/documents/{document_id}/events` for real-time processing updates.

### 13.4 Chats

#### GET `/api/documents/{document_id}/chat`

Returns the chat and messages for a document.

Response:

```json
{
  "chat": {
    "id": "chat-id",
    "document_id": "document-id",
    "title": "paper.pdf"
  },
  "messages": [
    {
      "id": "message-id",
      "role": "user",
      "content": "What is this document about?",
      "created_at": "2026-06-13T00:00:00Z",
      "sources": []
    }
  ]
}
```

#### POST `/api/documents/{document_id}/chat/messages`

Creates a user message and returns assistant answer.

Request:

```json
{
  "content": "What are the key takeaways?"
}
```

Response:

```json
{
  "user_message": {
    "id": "user-message-id",
    "role": "user",
    "content": "What are the key takeaways?"
  },
  "assistant_message": {
    "id": "assistant-message-id",
    "role": "assistant",
    "content": "The key takeaways are...",
    "sources": [
      {
        "page_start": 2,
        "page_end": 2,
        "excerpt": "Relevant excerpt...",
        "score": 0.81
      }
    ]
  }
}
```

Optional streaming endpoint:

#### POST `/api/documents/{document_id}/chat/stream`

Returns Server-Sent Events:

- `message_start`
- `token`
- `sources`
- `message_done`
- `error`

### 13.5 Suggested Actions

Phase 1 can hardcode suggested prompts in the frontend. If backend control is preferred:

#### GET `/api/documents/{document_id}/suggested-prompts`

Response:

```json
{
  "items": [
    "Summarize this document.",
    "What are the key takeaways?",
    "List action items.",
    "What should I pay attention to?"
  ]
}
```

## 14. Backend Service Boundaries

### 14.1 Auth Service

Responsibilities:

- Verify Clerk JWTs.
- Sync Clerk users into local DB.
- Provide current-user dependency for routes.

### 14.2 Document Service

Responsibilities:

- Validate upload.
- Create document records.
- Store PDFs in Wasabi.
- Generate signed URLs.
- Delete document assets.
- Enforce ownership.

### 14.3 Processing Service

Responsibilities:

- Run extraction/chunking/embedding/indexing jobs.
- Update document and job status.
- Handle retries idempotently.
- Record failure reasons.

### 14.4 Vector Service

Responsibilities:

- Generate embedding inputs.
- Upsert vectors to Pinecone.
- Query Pinecone with strict filters.
- Delete vectors for a document.

### 14.5 Chat Service

Responsibilities:

- Persist messages.
- Retrieve context.
- Build prompts.
- Call OpenAI chat model.
- Parse/store citations.
- Return answer responses to frontend.

## 15. Prompting Requirements

### 15.1 Grounded Answer System Instruction

The implementation should use a system instruction equivalent to:

```
You are an AI assistant that answers questions using only the provided document context.
If the context does not contain enough information, say that the document does not provide enough information.
Do not invent facts, page numbers, citations, or source excerpts.
When answering factual questions, cite the relevant page numbers from the provided context.
Keep answers clear and concise unless the user asks for detail.
```

### 15.2 Context Block Format

Recommended context format:

```
[Source 1]
Chunk ID: <chunk_id>
Pages: <page_start>-<page_end>
Text:
<chunk text>
```

### 15.3 Summary Prompt

```
Summarize this document in clear sections. Include the main purpose, key points, important details, and any conclusions. Use citations when possible.
```

### 15.4 Key Takeaways Prompt

```
List the key takeaways from this document. Keep them concise and cite the supporting pages when possible.
```

### 15.5 Action Items Prompt

```
Identify action items, decisions, deadlines, owners, or next steps mentioned in this document. If none are present, say the document does not contain explicit action items.
```

## 16. Security And Privacy

### 16.1 Required Controls

- Clerk authentication for all app functionality.
- Backend JWT verification for all protected APIs.
- Per-user ownership checks on every document/chat operation.
- Private Wasabi bucket.
- Short-lived signed URLs only.
- No Wasabi credentials in frontend.
- Pinecone metadata filters must constrain retrieval to the authenticated user's selected document.
- Environment variables for all secrets.
- No secrets committed to git.
- Avoid logging full document text, full prompts, or raw user documents.
- Use HTTPS in production.
- Configure CORS to allow only approved frontend origins.

### 16.2 Sensitive Data Handling

Potentially sensitive data:

- Uploaded PDFs.
- Extracted text.
- User questions.
- AI answers.
- Source excerpts.

Logging rules:

- Log IDs, statuses, timings, and error codes.
- Do not log full PDFs, full chunks, or complete chat prompts in production.
- Redact API keys and signed URLs.

## 17. Observability

### 17.1 Backend Logs

Log these events:

- Upload started/succeeded/failed.
- Processing job started/completed/failed.
- Wasabi upload/delete/signed URL failures.
- Pinecone upsert/query/delete failures.
- OpenAI embedding/chat failures.
- Auth verification failures.
- Unauthorized access attempts.

### 17.2 Metrics

Recommended metrics:

- Upload count.
- Processing success/failure count.
- Average processing duration.
- Average chat latency.
- OpenAI API error count.
- Pinecone query latency.
- Wasabi operation failures.

### 17.3 Health Checks

Backend should expose:

- `GET /health`: process alive.
- `GET /ready`: checks database and critical dependencies if feasible.

## 18. Deployment Specification

### 18.1 Environments

At minimum:

- Local development.
- Production.

Recommended:

- Staging if client review happens before production release.

### 18.2 Environment Variables

Frontend:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL`

Backend:

- `CLERK_ISSUER`
- `CLERK_JWKS_URL`
- `CLERK_AUDIENCE`
- `DATABASE_URL`
- `WASABI_ACCESS_KEY_ID`
- `WASABI_SECRET_ACCESS_KEY`
- `WASABI_BUCKET`
- `WASABI_REGION`
- `WASABI_ENDPOINT_URL`
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_CHAT_MODEL`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`
- `PINECONE_NAMESPACE`
- `FRONTEND_ORIGIN`
- `MAX_UPLOAD_MB`
- `MAX_PDF_PAGES`

### 18.3 Deployment Requirements

- React SPA deployed to a static frontend host.
- FastAPI deployed as an API service.
- Background worker deployed as a separate process or service.
- Database migrations run during deployment.
- CORS configured for the deployed frontend origin.
- Production secrets configured outside source control.

## 19. Testing Requirements

### 19.1 Frontend Tests

Test:

- Auth route protection.
- Upload component validation.
- Document library rendering.
- Processing state rendering.
- Chat message rendering.
- Citation click navigates PDF viewer to page.
- Error states.

### 19.2 Backend Unit Tests

Test:

- Clerk JWT verification dependency with mocked JWKS.
- Ownership checks.
- File validation.
- Wasabi key generation.
- Chunking behavior.
- Prompt construction.
- RAG response shaping.
- Document deletion orchestration.

### 19.3 Backend Integration Tests

Test with mocked external services:

- Upload creates document and job.
- Processing job extracts, chunks, embeds, and indexes.
- Chat request queries Pinecone and stores messages.
- Retry failed processing.
- Delete document removes external assets.

### 19.4 End-to-End Tests

Test:

- User signs in.
- User uploads a text-based PDF.
- Processing completes.
- User asks a question.
- User sees answer with citation.
- User clicks citation and PDF navigates to the source page.
- User refreshes and chat history persists.

## 20. Acceptance Criteria

Phase 1 is accepted when:

- Users can sign up, sign in, and sign out through Clerk.
- Unauthenticated users cannot access upload, library, chat, or APIs.
- Authenticated users can upload valid PDFs.
- Uploaded PDFs are stored privately in Wasabi.
- Text-based PDFs are processed into chunks.
- Chunks are embedded with OpenAI embeddings.
- Vectors are stored in Pinecone with document and user metadata.
- Users can see document processing status.
- Users can open a ready document in a side-by-side PDF and chat workspace.
- Users can ask questions about a ready document.
- AI answers are grounded in retrieved document context.
- AI answers include source page references and excerpts when evidence exists.
- Users can generate summary, key takeaway, insight, and action-item style responses.
- Users can return to previous documents and chat history.
- Users can delete documents.
- Deleted documents are no longer accessible and their vectors are removed from Pinecone.
- Basic logs and health checks exist for production support.
- The deployed app runs in production with configured Clerk, Wasabi, OpenAI, Pinecone, and database credentials.

## 21. Explicit Exclusions For Phase 1

The following are not part of Phase 1:

- Anonymous usage.
- Multi-document conversations.
- Folders or workspaces.
- Subscription and payment integration.
- Usage tracking and quota management.
- Team collaboration.
- Sharing links.
- URL imports.
- Non-PDF document imports.
- OCR for scanned PDFs.
- Multilingual UI guarantees.
- Multilingual chat guarantees.
- Saved favorites.
- Analytics dashboards.
- Admin panel.
- Role-based access control.
- Advanced AI model selection.
- Hybrid search.
- Reranking models.
- Domain-specific retrieval optimization.

## 22. Implementation Milestones

### Milestone 1: Project Scaffold And Auth

- Create React SPA.
- Create FastAPI backend.
- Configure Clerk frontend.
- Implement FastAPI Clerk JWT verification.
- Add protected `/api/me`.
- Add basic authenticated app shell.

### Milestone 2: Upload And Storage

- Implement PDF upload UI.
- Implement backend upload endpoint.
- Store PDFs in Wasabi.
- Create document records.
- Show document library and processing status.

### Milestone 3: Processing Pipeline

- Add worker process.
- Extract PDF text.
- Chunk by page-aware windows.
- Generate OpenAI embeddings.
- Store chunks in database.
- Upsert vectors to Pinecone.
- Mark documents ready or failed.

### Milestone 4: Document Workspace

- Add PDF viewer with signed Wasabi URL.
- Add chat workspace layout.
- Add suggested prompts.
- Add processing and error states.

### Milestone 5: RAG Chat

- Implement chat endpoints.
- Embed questions.
- Query Pinecone with user/document filters.
- Build grounded prompts.
- Generate OpenAI answers.
- Store messages and sources.
- Display citations and page navigation.

### Milestone 6: Deletion, Retry, And Hardening

- Add document deletion across DB, Wasabi, and Pinecone.
- Add retry failed processing.
- Add logging and health checks.
- Add tests for critical flows.
- Deploy production MVP.

## 23. Open Implementation Choices

These are not ambiguous requirements; they are choices for the implementation plan:

- Exact React PDF viewer library.
- Exact background job library.
- Exact PostgreSQL hosting provider.
- Exact OpenAI embedding and chat models available at implementation time.
- Whether chat responses stream in Phase 1 or return as full JSON.
- Whether source text highlighting is included in Phase 1 or citation page jumps only.

Recommended defaults:

- Use a PDF.js-based React viewer.
- Use a simple worker queue that matches the selected deployment environment.
- Start with non-streaming chat if delivery speed is critical; add SSE streaming if time allows.
- Implement citation page jumps in Phase 1; treat exact text highlights as a stretch goal.

## 24. Risks And Mitigations

### 24.1 PDF Extraction Quality

Risk: complex layouts, tables, scanned PDFs, or corrupted files may extract poorly.

Mitigation:

- Clearly support text-based PDFs only.
- Detect no-text documents and fail gracefully.
- Preserve source page numbers for verification.

### 24.2 Retrieval Quality

Risk: relevant context may not be retrieved for complex questions.

Mitigation:

- Use sensible chunk sizes and overlap.
- Retrieve top 6 to 10 chunks.
- Instruct model to say when evidence is insufficient.
- Keep advanced retrieval improvements for later phases.

### 24.3 Cost And Rate Limits

Risk: OpenAI embeddings/chat usage can incur cost and hit rate limits.

Mitigation:

- Batch embeddings.
- Retry transient errors.
- Configure upload size/page limits.
- Log usage-relevant counts for future quota features.

### 24.4 Security Boundary Errors

Risk: accidental cross-user document or vector access.

Mitigation:

- Centralize auth dependency.
- Centralize ownership checks.
- Always apply Pinecone user and document filters.
- Test cross-user denial cases.

### 24.5 Storage Cleanup

Risk: deleted or failed documents leave orphaned Wasabi objects or Pinecone vectors.

Mitigation:

- Make deletion idempotent.
- Store stable Wasabi keys and Pinecone vector IDs.
- Add cleanup logs and retry behavior.

## 25. Future Roadmap

Potential Phase 2 capabilities:

- Multi-document chats.
- Folders/workspaces.
- Subscription billing.
- Usage quotas.
- Team collaboration.
- Public sharing.
- OCR for scanned PDFs.
- More document formats.
- Saved summaries.
- Advanced search filters.
- Hybrid search and reranking.
- Admin dashboard.
- Analytics and reporting.
- Multilingual UI and language-specific retrieval improvements.
