# Phase 2 Implementation Plan (Master)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the Phase 1 MVP into a commercially deployable SaaS: Stripe subscriptions, plan-based usage limits, multi-document RAG, DOCX/PPTX/TXT/RTF support, conversation history, an enhanced dashboard, and a CMS-driven marketing site.

**Architecture:** Extend the existing FastAPI + SQLAlchemy + Alembic backend (Postgres, Redis/RQ worker, Wasabi storage, Pinecone vectors, OpenAI) and React/Vite/Clerk frontend. Multi-document chat is built by making the existing single-document chat a special case of scope-based retrieval (Pinecone metadata filter on `document_id`). Billing state lives in the app DB and is kept in sync exclusively by Stripe webhooks. The marketing site is a separate Next.js app reading content from a headless CMS.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, Postgres, Redis + RQ, Pinecone, OpenAI, Wasabi (S3), Clerk, React 18 + Vite + Tailwind + react-router, Stripe (`stripe` Python SDK), `python-docx`, `python-pptx`, `striprtf`, Next.js (marketing), Contentful (CMS, swappable).

---

## Scope note (read first)

Phase 2 spans multiple independent subsystems. This master plan locks in the architecture, data model, sequencing, and per-milestone task lists. **Each milestone below should be executed as its own detailed plan** (write the bite-sized TDD plan for a milestone right before starting it, from the task lists here). Every milestone produces working, testable software on its own.

**Milestone order and dependencies:**

| # | Milestone | Covers | Depends on |
|---|-----------|--------|-----------|
| M1 | Conversation history & chat scope refactor | FR-8 (+ schema foundation for FR-3) | none |
| M2 | Multi-document RAG + AI settings | FR-3, FR-4 | M1 |
| M3 | Additional document formats | FR-5 | none (parallel with M2 possible) |
| M4 | Stripe billing → usage limits → dashboard | FR-1, FR-2, FR-9 | M1 (dashboard reads conversations) |
| M5 | Marketing site + CMS | FR-6, FR-7 | none (fully parallel track) |
| M6 | Production deployment update | §12 | M1–M5 |

**Existing decisions honored:** single-document chat (Phase 1) must remain working throughout; retrieval, storage, billing, CMS stay behind service abstractions (`app/services/*`) so providers can swap (§11 of the handover doc).

**Out of scope (do not build):** everything in §9 of the handover doc, no teams, SSO, admin analytics, public APIs, OCR, CRM integrations.

---

## Current state (verified against the repo)

- **Backend** `backend/app/`: routes in `api/routes.py` (documents CRUD, per-document chat at `/api/documents/{id}/chat` + `/chat/stream` SSE), models in `models/` (`User`, `Document`, `DocumentChunk`, `Chat`, `Message`, `MessageSource`, `ProcessingJob`), services in `services/` (`chat.py`, `vector.py` with `VectorService.query_document`, `processing.py` with `PdfTextExtractor` + `chunk_pages` + `process_document`, `storage.py`), RQ worker in `worker/__init__.py`, settings in `core/config.py`.
- **Chat is 1:1 with a document today:** `Chat.document_id` is NOT NULL, `get_or_create_chat(db, user, document)` returns the single chat per (user, document). `Message.document_id` NOT NULL. `MessageSource` already stores `document_id`, `page_start/end`, `excerpt`, `score`, `rank`, multi-source citations need scope, not a new citation model.
- **Vectors:** Pinecone, one namespace per env (`pinecone_namespace`), vector metadata written by `VectorService._metadata_for_chunk` (already includes document/user identifiers). `query_document` filters to a single document.
- **Frontend** `frontend/src/`: routes in `App.tsx` (`/app` home, `/app/library`, `/app/documents/:id` workspace), API client in `api/client.ts` + `api/documents.ts`, Clerk auth in `features/auth/`, PDF viewer in `features/documents/`.
- **Migrations:** Alembic, latest `20260630_0002_document_insights.py`.
- **Tests:** pytest under `backend/tests/` (SQLite + fakes via `conftest.py`), Vitest + Playwright on the frontend. All new work follows these harnesses.

---

## Target data model (new/changed tables)

Additions to the existing schema. All new tables use the existing `UUIDPrimaryKeyMixin` + `TimestampMixin` from `app/models/mixins.py`.

```
users                 + stripe_customer_id (String(255), nullable, unique)

plans                 id (slug PK, e.g. "free", "pro_monthly", "pro_yearly"),
                      name, interval ("month"|"year"|null for free),
                      stripe_price_id (nullable for free),
                      limit_ai_messages int, limit_uploads int,
                      limit_storage_mb int, limit_document_scope int,
                      allowed_chat_models JSON, is_active bool

subscriptions         id, user_id FK, plan_id FK, stripe_subscription_id (unique),
                      status ("active"|"trialing"|"past_due"|"canceled"|"incomplete"),
                      current_period_start, current_period_end,
                      cancel_at_period_end bool

usage_periods         id, user_id FK, period_start, period_end,
                      ai_messages_used int default 0, uploads_used int default 0
                      UNIQUE(user_id, period_start)
                      (storage is computed live: SUM(documents.file_size_bytes)
                       WHERE deleted_at IS NULL, no counter to drift)

chat_documents        chat_id FK (CASCADE), document_id FK (CASCADE),
                      position int, PK(chat_id, document_id)

chats                 document_id -> nullable (legacy column, backfilled into
                      chat_documents; new code reads scope from the join table)

messages              document_id -> nullable (a multi-doc message has no single doc)

documents             + format (String(16): "pdf"|"docx"|"pptx"|"txt"|"rtf",
                        server-derived, default "pdf" on backfill)
```

`MessageSource`, `DocumentChunk`, `ProcessingJob` are unchanged. Collections (§6 optional) are **skipped**: a chat scoped to N documents covers every Phase 2 use case; `chat_documents` becomes the collection mechanism if it's ever needed (YAGNI).

---

# M1: Conversation history & chat scope refactor (FR-8)

**Outcome:** conversations are first-class: list, resume with full context, rename, delete. A chat's scope is a set of documents (size 1 for now, the UI stays single-doc until M2). Old per-document chat routes keep working as wrappers.

### Task 1.1: Migration 0003: chat scope + conversation fields

**Files:**
- Create: `backend/alembic/versions/20260703_0003_chat_scope.py`
- Modify: `backend/app/models/chat.py`, `backend/app/models/document.py` (relationship), `backend/app/models/__init__.py`

Migration steps (single revision):
1. Create `chat_documents` (chat_id, document_id, position, PK(chat_id, document_id), FKs with CASCADE).
2. Backfill: `INSERT INTO chat_documents (chat_id, document_id, position) SELECT id, document_id, 0 FROM chats`.
3. Alter `chats.document_id` and `messages.document_id` to nullable.

Model changes: `Chat.documents: Mapped[list[Document]] = relationship(secondary="chat_documents", order_by="ChatDocument.position")`, `Chat.document_id` becomes `Mapped[UUID | None]`, same for `Message.document_id`. New `ChatDocument` model.

Tests (`backend/tests/test_chat_scope.py`): creating a chat with 1 doc populates the join table; deleting a document cascades its join rows; deleting a chat cascades messages + join rows.

### Task 1.2: Chat CRUD service + routes

**Files:**
- Create: `backend/app/api/chat_routes.py` (new router, included from `app/main.py`, keeps `routes.py` from growing further)
- Modify: `backend/app/services/chat.py` (scope-aware `get_or_create_chat` → `create_chat(db, user, documents)`, keep old signature delegating for Phase 1 routes)
- Test: `backend/tests/test_conversations.py`

Endpoints:
```
GET    /api/chats                     list (cursor-paginated like documents:
                                      reuse the encode/decode cursor helpers;
                                      move them to app/api/pagination.py)
POST   /api/chats                     {document_ids: [uuid], title?} -> 201
                                      422 if any doc not READY or not owned
GET    /api/chats/{chat_id}           chat + messages + sources (resume payload)
PATCH  /api/chats/{chat_id}           {title} rename, 512-char cap
DELETE /api/chats/{chat_id}           hard delete (cascades)
POST   /api/chats/{chat_id}/messages/stream   SSE, same event protocol as the
                                      existing /chat/stream endpoint
```
Ownership dependency mirrors `get_owned_document` in `app/api/deps.py` (add `get_owned_chat`).

Auto-title: first user message truncated to 80 chars when `title` is null (already the pattern in Phase 1? verify in `services/chat.py`; if absent, set it in `stream_chat_response` after the first user message persists).

Tests: create/list/rename/delete happy paths; 404 on other user's chat; resume returns messages in order with sources; stream endpoint persists user+assistant messages against the chat.

### Task 1.3: Keep Phase 1 routes as wrappers

**Files:**
- Modify: `backend/app/api/routes.py:361-380` (`/api/documents/{id}/chat` and `/chat/stream`)

Both delegate: find-or-create the chat whose scope is exactly `[document]` (query `chat_documents` for single-membership chats), then reuse the M1.2 service functions. Existing tests in `backend/tests/test_chat.py` must pass unchanged, they are the regression net for "single-doc remains a special case".

### Task 1.4: Frontend conversation history UI

**Files:**
- Create: `frontend/src/features/chats/ChatHistory.tsx`, `frontend/src/api/chats.ts`
- Modify: `frontend/src/App.tsx` (route `/app/chats`, nav link), `frontend/src/features/documents/DocumentWorkspace.tsx` (chat panel loads/creates via chat id so a workspace visit resumes the existing conversation)
- Test: `frontend/src/api/chats.test.ts`, extend `frontend/e2e/document-chat.spec.ts`

UI: list with title, scoped document names, updated_at; click → resume; inline rename; delete with confirm. Reuse the list/card styles from `DocumentLibrary.tsx`.

**M1 DoD check (FR-8):** conversations persist per user, resume with full context, rename/delete work, Phase 1 chat unchanged.

---

# M2: Multi-document RAG + advanced AI (FR-3, FR-4)

**Outcome:** a conversation scoped to N documents; retrieval pulls across all of them; answers attribute claims to document + page; model/settings configurable.

### Task 2.1: Scope-aware retrieval in VectorService

**Files:**
- Modify: `backend/app/services/vector.py:313` (`query_document` → add `query_scope(self, user, documents: list[Document], question, top_k_per_query=8)`)
- Test: `backend/tests/test_vector.py`

Core change, Pinecone filter goes from one id to a set:

```python
def query_scope(self, user: User, documents: list[Document], question: str) -> list[RetrievedSource]:
    doc_ids = [str(d.id) for d in documents]
    flt = {"user_id": str(user.id), "document_id": {"$in": doc_ids}}
    # single query across the scope; Pinecone handles $in natively
    ...existing embed + query + RetrievedSource assembly, keeping doc id per match...
```

`query_document` becomes `return self.query_scope(user, [document], question)`. Verify existing vector metadata already contains `document_id`/`user_id` (see `_metadata_for_chunk`, `vector.py:452`); if any key differs, adapt the filter to the actual key names, do not re-index.

Fairness rule: after retrieval, if >1 document in scope, guarantee at least 1 chunk from each document that has any match above threshold before filling remaining slots by score (prevents one verbose doc drowning out the other in comparisons). Keep `MAX_CONTEXT_SOURCES` as the total cap.

Tests: fake Pinecone asserting the `$in` filter; fairness rule with skewed scores; single-doc path produces identical output to Phase 1 (snapshot existing test expectations).

### Task 2.2: Multi-source prompt assembly + citations

**Files:**
- Modify: `backend/app/services/vector.py` (`format_source_context`, `stream_answer_tokens` system prompt), `backend/app/services/chat.py` (`stream_chat_response` accepts a document list; `_hydrate_source_context`, `_keyword_sources`, `_exact_reference_sources` take the scope list and union results)
- Test: `backend/tests/test_chat.py` (new multi-doc cases)

Context blocks get a source label: `[S3 · "contract-a.pdf" p.12-13]`. System prompt addition: "When the context contains multiple documents, attribute each claim to its document by name. For comparisons, state per-document findings before the comparison." `MessageSource` rows already carry `document_id`; the API response for sources adds `document_filename` (join in the serializer, no schema change).

The insight/summary shortcuts in `chat.py` (`_cached_insight_answer`, `_overview_sources`, etc.) stay **single-doc only**: guard with `if len(scope) == 1`. Multi-doc overview questions go through normal retrieval. (`ponytail:` cross-doc insight synthesis deferred until a real user asks for it.)

Tests: two-doc chat returns sources from both documents with correct filenames; comparison question includes both docs in context; single-doc regression suite untouched.

### Task 2.3: Frontend multi-doc conversations

**Files:**
- Create: `frontend/src/features/chats/ScopePicker.tsx` (multi-select over READY documents), `frontend/src/features/chats/MultiDocChat.tsx` (chat view without the PDF viewer pane; citations grouped by document, click-through opens the doc workspace at the cited page)
- Modify: `frontend/src/App.tsx` (route `/app/chats/new`, `/app/chats/:chatId`), `frontend/src/api/chats.ts`, citation components in `features/documents/` to render document name + page
- Test: extend Playwright spec with a two-document conversation

### Task 2.4: Advanced AI settings (FR-4)

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/services/vector.py`, `backend/app/api/chat_routes.py`
- Test: `backend/tests/test_config.py`, `backend/tests/test_chat.py`

Scope this deliberately small, most of FR-4 is already true (model, temperature, embedding dimensions, batch size, retries are env-configurable in `config.py`):
1. Per-chat model override: `POST /api/chats` and the stream endpoint accept optional `model`; validated against `settings.openai_allowed_chat_models` (new setting, default `["gpt-4.1-mini", "gpt-4.1", "o4-mini"]`). Persist choice on the chat (`chats.model` nullable column, fold into migration 0003 or a tiny 0004).
2. New settings: `retrieval_top_k`, `openai_max_context_tokens` replace in-code constants (`MAX_CONTEXT_SOURCES` reads from settings).
3. "Improved retrieval / larger documents / context management" is **measured, not rebuilt**: rerun the existing QA harness (`manual-testing/manual-api-regression.cjs`, baseline comparison report generator) on representative docs after M2 and record the report in `docs/`. Only tune if results regress.

**M2 DoD check (FR-3/FR-4):** N-doc conversations, cross-scope retrieval, per-document+page citations, configurable model/settings, measurable QA report.

---

# M3: Additional document formats: DOCX, PPTX, TXT, RTF (FR-5)

**Outcome:** all four formats flow through the exact same pipeline (extract → `chunk_pages` → embed → index → chat) with clear processing errors.

**Design:** keep the `ExtractedPage` interface (`processing.py:33`) as the universal unit so chunking, embedding, citations, and limits stay untouched. Each format maps to "pages":

| Format | Page unit | Library |
|--------|-----------|---------|
| PDF | real page | existing extractor |
| PPTX | slide | `python-pptx` |
| DOCX | explicit page breaks if present, else split every ~800 words | `python-docx` |
| TXT | split every ~800 words | stdlib |
| RTF | strip to text, then as TXT | `striprtf` |

Citations render "p.N" for PDF, "slide N" for PPTX, "section N" for the rest (frontend label keyed off `document.format`).

### Task 3.1: Extractor registry

**Files:**
- Create: `backend/app/services/extractors.py`
- Modify: `backend/app/services/processing.py` (`process_document` takes extractor from registry), `backend/app/worker/__init__.py` (`_process_document_with_defaults` picks extractor by `document.format`)
- Modify: `backend/pyproject.toml` (add `python-docx`, `python-pptx`, `striprtf`)
- Test: `backend/tests/test_extractors.py` with tiny fixture files under `backend/tests/fixtures/`

```python
# extractors.py: one function per format, all -> list[ExtractedPage]
EXTRACTORS: dict[str, Callable[[bytes], list[ExtractedPage]]] = {
    "pdf": ...,  # wraps existing PdfTextExtractor logic
    "docx": extract_docx,
    "pptx": extract_pptx,
    "txt": extract_txt,
    "rtf": extract_rtf,
}
```
Empty-text and corrupt-file cases raise the existing `NoExtractableTextError` / a new `UnsupportedFileError` so `_fail_no_text`-style failure handling (status FAILED + `failure_code`/`failure_message`) works for every format.

### Task 3.2: Upload validation + format column

**Files:**
- Create: migration `backend/alembic/versions/20260703_0004_document_format.py` (`documents.format`, backfill `'pdf'`)
- Modify: `backend/app/api/routes.py:160` (upload route: accept the four new content types + extension fallback, set `format`, reject others with the existing 415 pattern), `backend/app/models/document.py`
- Test: `backend/tests/test_documents.py` (accept/reject matrix), `backend/tests/test_e2e_pipeline.py` (one non-PDF format end-to-end)

Content-type map (browsers are inconsistent, trust extension when content type is generic `application/octet-stream`):
`.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.pptx` → `...presentationml.presentation`, `.txt` → `text/plain`, `.rtf` → `application/rtf`/`text/rtf`.

### Task 3.3: Frontend format support

**Files:**
- Modify: `frontend/src/features/upload/UploadDropzone.tsx` + `UploadHome.tsx` (accept list, copy), `frontend/src/features/documents/DocumentWorkspace.tsx` (non-PDF: swap PDF viewer pane for an extracted-text/preview placeholder, chat pane unchanged), citation labels ("slide"/"section"), `frontend/src/types.ts` (`format` field)
- Test: Vitest for the accept list + label mapping

**M3 DoD check (FR-5):** each format uploads, processes end-to-end, is chat-queryable with citations; corrupt files surface a clear FAILED status.

---

# M4: Stripe billing, usage limits, dashboard (FR-1, FR-2, FR-9)

**Outcome:** subscribe/upgrade/downgrade/cancel via Stripe Checkout + Billing Portal; webhooks are the single source of truth for subscription state; limits enforced server-side; dashboard shows it all.

**Plan structure (client finalizes numbers; these are the build defaults):**
- `free`: 25 msgs/period, 3 uploads, 50 MB, scope ≤ 2 docs, base model only
- `pro_monthly` / `pro_yearly`: 1000 msgs, 100 uploads, 2 GB, scope ≤ 10 docs, all models

### Task 4.1: Billing schema + plan seed

**Files:**
- Create: migration `backend/alembic/versions/20260703_0005_billing.py` (plans, subscriptions, usage_periods, `users.stripe_customer_id`, schema per the data-model section above; seed the three plan rows in the migration with `stripe_price_id` NULL, filled by env at runtime)
- Create: `backend/app/models/billing.py` (`Plan`, `Subscription`, `UsagePeriod`)
- Modify: `backend/app/models/__init__.py`, `backend/app/core/config.py` (`stripe_secret_key`, `stripe_webhook_secret`, `stripe_price_pro_monthly`, `stripe_price_pro_yearly`), `backend/pyproject.toml` (add `stripe`)
- Test: `backend/tests/test_billing_models.py`

### Task 4.2: Billing service + routes

**Files:**
- Create: `backend/app/services/billing.py`, `backend/app/api/billing_routes.py`
- Test: `backend/tests/test_billing.py` (Stripe SDK faked, same fake-service pattern as `conftest.py` uses for Pinecone/OpenAI)

```
GET  /api/billing/plans      public plan matrix (name, interval, limits)
GET  /api/billing/me         current plan + subscription status + period end
POST /api/billing/checkout   {plan_id} -> Stripe Checkout Session URL
                             (creates stripe customer on first use, stores id)
POST /api/billing/portal     -> Billing Portal session URL (upgrades,
                             downgrades, cancels, payment methods, invoices
                             all happen in the portal, build no custom UI
                             for proration; Stripe handles it)
POST /api/webhooks/stripe    signature-verified (stripe.Webhook.construct_event),
                             raw-body route, no auth dependency
```

Webhook handler, upsert `subscriptions` keyed on `stripe_subscription_id`, resolve plan by price id:
- `checkout.session.completed` → link customer/subscription to user (client_reference_id = user id)
- `customer.subscription.created|updated` → status, plan, period start/end, cancel_at_period_end
- `customer.subscription.deleted` → status "canceled"
- `invoice.payment_failed` → status from event (Stripe sets past_due); no custom dunning
Handler is idempotent (upsert semantics) and returns 200 on already-processed events.

`get_active_plan(db, user) -> Plan`: newest subscription with status in ("active", "trialing", "past_due"-grace) else free plan. This is the single function all gating uses.

### Task 4.3: Usage tracking + server-side enforcement

**Files:**
- Create: `backend/app/services/usage.py`
- Modify: `backend/app/api/routes.py` (upload route), `backend/app/api/chat_routes.py` + `routes.py` chat stream (message limit), `backend/app/api/deps.py`
- Test: `backend/tests/test_usage.py`

```python
# usage.py
def current_period(db, user) -> UsagePeriod:
    # bounds = subscription current period if active, else calendar month (UTC)
    # get-or-create row; ON CONFLICT DO NOTHING then re-select (race-safe)

def check_and_increment(db, user, kind: Literal["ai_message", "upload"]) -> None:
    # atomic UPDATE ... SET x = x + 1 WHERE x < limit; 0 rows -> raise LimitExceeded

def check_storage(db, user, incoming_bytes: int) -> None:
    # SUM(file_size_bytes) of non-deleted docs + incoming vs plan limit

def check_scope_size(plan, document_ids) -> None      # multi-doc gate
def check_model_allowed(plan, model) -> None          # premium model gate
```
`LimitExceeded` maps to HTTP 402 with `{"code": "limit_exceeded", "kind": ..., "limit": ..., "used": ...}` via an exception handler in `main.py`. Enforcement points: upload (uploads + storage), chat stream (ai_message, increment when the user message persists, before the OpenAI call), chat create (scope size, model). Limits reset naturally because the period row is keyed by period start, no cron needed.

`GET /api/usage` → `{plan, period_start, period_end, ai_messages: {used, limit}, uploads: {used, limit}, storage_mb: {used, limit}}`.

Tests: limit hit returns 402 and does not call OpenAI (assert on the fake); period rollover creates a fresh row; storage sum ignores deleted docs; free-plan user blocked from premium model and >2-doc scope.

### Task 4.4: Billing + usage frontend

**Files:**
- Create: `frontend/src/features/billing/BillingPage.tsx` (plan cards, current plan, "Manage billing" → portal redirect, success/cancel return states), `frontend/src/api/billing.ts`
- Modify: `frontend/src/App.tsx` (route `/app/billing`), `frontend/src/api/client.ts` (402 → typed `LimitExceededError`), upload + chat components (limit error → inline upgrade prompt linking to `/app/billing`)
- Test: Vitest for 402 handling; Playwright happy path stubbed at the API layer

### Task 4.5: Enhanced dashboard (FR-9)

**Files:**
- Create: `backend/app/api/dashboard_routes.py` (`GET /api/dashboard`, one endpoint, one round trip: subscription summary, usage (reuse usage service), document stats (count by status/format, total storage), 5 most recent conversations, 10 recent activity items derived from documents.created_at + chats.updated_at, no separate activity table), `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/api/dashboard.ts`
- Modify: `frontend/src/App.tsx` (`/app` home becomes the dashboard; current upload home moves to the top of it)
- Test: `backend/tests/test_dashboard.py`, Vitest render test

**M4 DoD check (FR-1/2/9):** subscribe/switch/cancel via portal, webhook-synced state, server-enforced limits reflected in UI, per-cycle reset, live dashboard.

---

# M5: Marketing website + headless CMS (FR-6, FR-7), parallel track

**Outcome:** responsive, SEO-friendly marketing site, all content CMS-managed, edits live without redeploy.

**Decisions (recommended, confirm with client before starting M5):**
- **CMS: Contentful.** Zero hosting/ops (client would otherwise have to host Strapi), free tier fits this content volume, mature delivery API + webhooks. Wrap all access in one `lib/cms.ts` module so Strapi can swap in later (§11).
- **Framework: Next.js (App Router) in a new top-level `marketing/` directory.** Server-rendered for SEO (the Vite SPA is wrong for this), React/Tailwind so the team reuses existing skills, ISR + Contentful webhook revalidation gives "edit → live, no redeploy".
- Marketing site links "Sign in / Get started" to the app's Clerk URLs; no shared session needed.

### Task 5.1: Content model (in Contentful)

Content types: `page` (slug, title, SEO fields, ordered rich sections), `landingSection` (hero/features/CTA variants), `service`, `blogPost` (slug, body, author, cover, SEO), `faqItem` (question, answer, order), `legalPage` (privacy/terms/refund as long-form rich text), `siteSettings` (company info, contact info, nav items, footer columns, default SEO). Documented as a checklist in `marketing/README.md` so the client can audit coverage against FR-7.

### Task 5.2: Site scaffold + CMS client

**Files:** `marketing/`, Next.js + Tailwind scaffold, `src/lib/cms.ts` (typed fetchers, `revalidateTag`-based caching), `src/app/api/revalidate/route.ts` (Contentful webhook → revalidate), env `CMS_SPACE_ID`, `CMS_DELIVERY_TOKEN`, `REVALIDATE_SECRET`.

### Task 5.3: Pages

Landing, Services, About, Blog (list + `[slug]`), Contact (form → API route → email via provider client already chosen for the project, plus store submission in Contentful or a simple table, pick email-only first), FAQ, Privacy, Terms, Refund. All content from CMS; component per section type.

### Task 5.4: SEO + quality gate

`generateMetadata` from CMS SEO fields, semantic headings, `sitemap.ts` + `robots.ts`, OG images, Lighthouse ≥ 90 on performance/SEO/accessibility for landing + blog post (checked via `npx lighthouse` in CI or manually, results saved to `docs/`).

**M5 DoD check (FR-6/7):** all pages responsive + CMS-driven, contact form delivers, CMS edit visible without redeploy, on-page SEO checks pass.

---

# M6: Production deployment update

**Outcome:** everything above running in production with monitoring & logging.

- [ ] Env/secrets: add Stripe keys + webhook secret, CMS tokens, new settings (allowed models, retrieval knobs) to the hosting platform's secret manager; update `.env.example` (no secrets).
- [ ] Stripe: create products/prices in live mode, register webhook endpoint (`/api/webhooks/stripe`), verify with `stripe listen`/test events before go-live.
- [ ] Run Alembic migrations 0003–0005 in order; backfill verified (`chat_documents` count == chats count, all documents have `format`).
- [ ] Deploy `marketing/` (Vercel or client's host) + configure Contentful revalidation webhook; point the marketing domain, app stays on its subdomain.
- [ ] Monitoring & logging: structured logging already exists (`app/core/logging.py`); add Sentry (backend + frontend, DSN via env) and uptime checks on `/health` + `/ready`. Alert on webhook handler failures specifically (silent webhook drift is the classic Stripe outage).
- [ ] Smoke suite: run `manual-testing/manual-api-regression.cjs` + Playwright against staging; one manual pass of the §12 overall DoD checklist, recorded in `docs/`.

---

## Overall DoD traceability (§12)

| §12 requirement | Covered by |
|---|---|
| All §4 modules meet per-module DoD | M1–M5 DoD checks |
| Limits enforced server-side + in UI | Task 4.3, 4.4 |
| Stripe state synced via webhooks | Task 4.2 |
| Multi-doc chat with attributed multi-source citations | Tasks 2.1–2.3 |
| All new formats end-to-end | Tasks 3.1–3.3 |
| Marketing site responsive, CMS-driven, SEO checks | Tasks 5.1–5.4 |
| Updated production deployment w/ monitoring | M6 |
| Complete source handover | git repo, all milestones merged |

## Deliberate simplifications (flag to client if unwanted)

- No custom upgrade/downgrade UI, Stripe Billing Portal does proration, plan switches, cancellation, invoices (FR-1 explicitly includes portal integration).
- No `collections` tables, chat scope over N documents covers all stated use cases.
- Storage usage computed from `documents` sum, not a counter (can't drift).
- Recent activity derived from existing timestamps, no event/audit table (§9 excludes audit logging anyway).
- DOCX/TXT/RTF "pages" are word-count sections; real DOCX pagination requires a renderer and isn't needed for citations to be useful.
- FR-4 "improved retrieval" is measure-first via the existing QA harness, tune only on regression.
