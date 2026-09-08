# Phase 2 Deployment Guide

What changed in production terms: Stripe billing, plan limits, multi-document chat, four new file formats, conversation history, a dashboard, and a separate CMS-driven marketing site. This guide covers rolling it out.

## 1. Database migrations

Three new Alembic revisions ship with Phase 2 and must run in order:

```
20260704_0003_chat_scope        chat_documents join table, nullable chat/message document_id, chats.model
20260704_0004_document_format   documents.format (backfilled to 'pdf')
20260704_0005_billing           plans (seeded), subscriptions, usage_periods, users.stripe_customer_id
```

```bash
cd backend && alembic upgrade head
```

Post-migration sanity checks:
- `SELECT COUNT(*) FROM chat_documents` equals `SELECT COUNT(*) FROM chats` (backfill).
- `SELECT COUNT(*) FROM documents WHERE format IS NULL` is 0.
- `SELECT id FROM plans` returns free, pro_monthly, pro_yearly.

## 2. New environment variables (app)

Set through the hosting platform's secret manager. All are in `.env.example`.

| Variable | Purpose | Required |
|---|---|---|
| STRIPE_SECRET_KEY | Stripe API key (sk_live_...) | For billing |
| STRIPE_WEBHOOK_SECRET | Webhook endpoint signing secret (whsec_...) | For billing |
| STRIPE_PRICE_PRO_MONTHLY | Live price id for the monthly plan | For billing |
| STRIPE_PRICE_PRO_YEARLY | Live price id for the yearly plan | For billing |
| BILLING_RETURN_URL | Where Stripe redirects after checkout/portal (defaults to first CORS origin + /app/billing) | No |
| OPENAI_ALLOWED_CHAT_MODELS | Comma-separated model allowlist | No (has default) |
| OPENAI_FAST_MODEL / OPENAI_QUALITY_MODEL | OpenAI models behind the Fast and Quality composer tiers, adjustable without a redeploy | No (defaults gpt-4.1-mini and gpt-4.1) |
| RETRIEVAL_TOP_K / MAX_CONTEXT_SOURCES | Retrieval tuning knobs | No (default 8) |
| SENTRY_DSN | Enables Sentry error reporting when set | No |

Without the Stripe variables the app runs normally: billing endpoints return 503 "Billing is not configured" and every user is on the free plan.

## 3. Stripe setup

1. In the Stripe dashboard create one product ("MyPDFChat Pro") with two recurring prices: monthly and yearly. Put the price ids in `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY`.
2. Enable the customer Billing Portal (Settings, Billing, Customer portal) and allow plan switches and cancellation. Upgrades, downgrades, proration, and cancellation all happen in the portal; the app has no custom UI for them by design.
3. Register a webhook endpoint for `https://<api-host>/api/webhooks/stripe` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Verify before go-live with the CLI: `stripe listen --forward-to localhost:8000/api/webhooks/stripe` then `stripe trigger customer.subscription.created`. Subscription state in the DB is written only by webhooks, so this path must work.
5. Alert on webhook delivery failures in the Stripe dashboard (Developers, Webhooks). Silent webhook drift is the main billing failure mode.

## 4. Marketing site

Separate Next.js app in `marketing/`, deployed independently (Vercel or equivalent), pointed at the marketing domain while the app stays on its subdomain.

Env vars (see `marketing/.env.example`): `CONTENTFUL_SPACE_ID`, `CONTENTFUL_DELIVERY_TOKEN`, `CONTENTFUL_PREVIEW_TOKEN`, `CONTENTFUL_ENVIRONMENT`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_APP_URL`, optional `CONTACT_WEBHOOK_URL`. The site builds and renders fallback content when CMS vars are absent.

One-time Contentful setup (currently pending, see `marketing/README.md`): the space access grant must be refreshed by logging into app.contentful.com and opening the space, then run `scripts/setup-contentful.mjs` and `scripts/seed-contentful.mjs` with `CONTENTFUL_CMA_TOKEN` set. Both are idempotent. After deploy, add a Contentful webhook hitting `https://<marketing-host>/api/revalidate?secret=<REVALIDATE_SECRET>` on entry publish/unpublish so content edits go live without a redeploy.

## 5. Monitoring and logging

- Structured JSON logging already ships (`backend/app/core/logging.py`), level via `LOG_LEVEL`.
- Set `SENTRY_DSN` to enable backend error reporting (no-op when unset). Frontend Sentry was deliberately skipped until a DSN exists; add `@sentry/react` at that point.
- Uptime checks: `GET /health` (liveness) and `GET /ready` (DB connectivity).

## 6. Post-deploy smoke checklist

1. Sign in, upload a PDF and a DOCX, both reach READY.
2. Start a conversation scoped to both documents, ask a comparison question, confirm citations name both files.
3. Conversations page lists, renames, resumes, and deletes.
4. Dashboard shows live usage, documents, and recent conversations.
5. Subscribe with a Stripe test card, confirm the plan flips in the app (webhook round trip), open the billing portal, cancel, confirm status.
6. Exhaust a free-plan limit (e.g. uploads) and confirm the 402 upgrade prompt.
7. Marketing site renders all pages, contact form submits, a CMS edit appears without redeploy.
