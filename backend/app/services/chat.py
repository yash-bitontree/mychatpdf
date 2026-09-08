import json
import logging
import re
from collections.abc import Iterator
from dataclasses import replace
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models import (
    Chat,
    ChatDocument,
    Document,
    DocumentChunk,
    DocumentStatus,
    Folder,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    User,
)
from app.models.mixins import utc_now
from app.services.billing import get_active_plan
from app.services.usage import check_and_increment, check_model_allowed, check_scope_size, refund_ai_message
from app.services.vector import (
    DOCUMENT_INTELLIGENCE_SOURCE_LIMIT,
    DOCUMENT_INTELLIGENCE_VERSION,
    DOCUMENT_OVERVIEW_SOURCE_LIMIT,
    RetrievedSource,
    VectorService,
    build_overview_sources,
    is_front_matter_chunk,
    multi_document_context_source_limit,
    question_needs_per_document_answer,
    question_needs_short_summary,
)

logger = logging.getLogger(__name__)

RECENT_HISTORY_MESSAGE_LIMIT = 8
RECENT_HISTORY_MAX_CHARS = 2400
FOLLOW_UP_TERMS = {
    "it",
    "its",
    "that",
    "this",
    "they",
    "them",
    "their",
    "those",
    "these",
    "previous",
    "above",
    "same",
}
# ponytail: default merge limit for direct callers/tests; the stream path reads
# the configurable settings.max_context_sources from the vector service.
MAX_CONTEXT_SOURCES = 8
EXACT_REFERENCE_SOURCE_LIMIT = 3
KEYWORD_SOURCE_LIMIT = 3
KEYWORD_STOPWORDS = {
    "about",
    "answer",
    "could",
    "document",
    "explain",
    "file",
    "from",
    "give",
    "should",
    "summarize",
    "summary",
    "tell",
    "that",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
}
SHORT_KEYWORD_TERMS = {"law"}
DOCUMENT_INSIGHT_ACTION_PHRASES = (
    "action items",
    "recommended actions",
    "what actions",
    "what should i do",
    "what should we do",
    "next steps",
    "recommendations",
)
DOCUMENT_INSIGHT_ATTENTION_PHRASES = (
    "what should i pay attention to",
    "what should we pay attention to",
    "what should i focus on",
    "what should we focus on",
    "important topics",
    "study guide",
)
DOCUMENT_INSIGHT_TAKEAWAY_PHRASES = (
    "key takeaways",
    "main points",
    "important points",
)
DOCUMENT_INSIGHT_SUMMARY_PHRASES = (
    "summarize this document",
    "summarize the document",
    "summarize this file",
    "summarize the file",
    "summary of this document",
    "summary of the file",
    "full document summary",
    "overall summary",
    "give me a summary",
    "document summary",
    "document overview",
    "overview of this document",
    "what is this document about",
    "what is this file about",
    "what does this document cover",
)


AUTO_TITLE_MAX_CHARS = 80


def create_chat(
    db: Session,
    user: User,
    documents: list[Document],
    title: str | None = None,
    model: str | None = None,
) -> Chat:
    chat = Chat(
        user_id=user.id,
        # ponytail: chats.document_id mirrors single-doc scope so the Phase 1
        # per-document routes stay a column match; M2 reads scope only.
        document_id=documents[0].id if len(documents) == 1 else None,
        title=title,
        model=model,
    )
    db.add(chat)
    db.flush()
    for position, document in enumerate(documents):
        db.add(ChatDocument(chat_id=chat.id, document_id=document.id, position=position))
    db.commit()
    db.refresh(chat)
    return chat


def folder_scope(folder: Folder) -> list[Document]:
    """A folder chat's scope is resolved live from the folder's current READY
    documents (created_at order via the relationship), so documents added
    after the chat was created join existing conversations."""
    return [
        document
        for document in folder.documents
        if document.status == DocumentStatus.READY and document.deleted_at is None
    ]


def get_or_create_chat(db: Session, user: User, document: Document) -> Chat:
    chat = db.scalar(
        select(Chat)
        .where(Chat.document_id == document.id, Chat.user_id == user.id, Chat.deleted_at.is_(None))
        .order_by(Chat.created_at)
        .limit(1)
    )
    if chat is None:
        chat = create_chat(db, user, [document], title=document.original_filename)
    return chat


def format_sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def question_needs_conversation_context(question: str) -> bool:
    words = re.findall(r"[a-z0-9']+", question.lower())
    if not words:
        return False
    return any(word in FOLLOW_UP_TERMS for word in words)


def build_contextual_question(current_question: str, prior_messages: list[Message]) -> str:
    if question_needs_document_overview(current_question):
        return current_question
    if not question_needs_conversation_context(current_question):
        return current_question

    succeeded_messages = [
        message
        for message in prior_messages
        if message.status in {MessageStatus.SUCCEEDED, MessageStatus.SUCCEEDED.value} and message.content.strip()
    ]
    if not succeeded_messages:
        return current_question

    recent_messages = succeeded_messages[-RECENT_HISTORY_MESSAGE_LIMIT:]
    history_lines = []
    for message in recent_messages:
        role = getattr(message.role, "value", message.role)
        history_lines.append(f"{role}: {message.content.strip()}")
    history = "\n".join(history_lines)
    if len(history) > RECENT_HISTORY_MAX_CHARS:
        history = history[-RECENT_HISTORY_MAX_CHARS:]

    return f"Recent conversation:\n{history}\n\nCurrent question: {current_question}"


def question_needs_document_overview(question: str) -> bool:
    return document_insight_field(question) is not None


def document_insight_field(question: str) -> str | None:
    text = question.lower()
    if "selected passage" in text:
        return None
    if any(phrase in text for phrase in DOCUMENT_INSIGHT_ACTION_PHRASES):
        return "action_items"
    if any(phrase in text for phrase in DOCUMENT_INSIGHT_ATTENTION_PHRASES):
        return "attention_points"
    if any(phrase in text for phrase in DOCUMENT_INSIGHT_TAKEAWAY_PHRASES):
        return "key_takeaways"
    if any(phrase in text for phrase in DOCUMENT_INSIGHT_SUMMARY_PHRASES):
        return "summary"
    return None


def _reference_phrases(question: str) -> tuple[str | None, list[str]]:
    text = question.lower()
    chapter_matches = re.findall(r"\bchapter\s+(\d+)\b", text)
    phrases = [
        f"{match.group(1)} {match.group(2)}"
        for match in re.finditer(
            r"\b(sample problem|checkpoint|question|problem)\s+(\d+(?:\.\d+)*)\b",
            text,
        )
    ]
    return (f"chapter {chapter_matches[-1]}" if chapter_matches else None, phrases)


def _exact_reference_sources(db: Session, document: Document, question: str) -> list[RetrievedSource]:
    chapter_phrase, phrases = _reference_phrases(question)
    if not phrases:
        return []

    sources: list[RetrievedSource] = []
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.chunk_index)
    )
    for chunk in chunks:
        text = chunk.text.lower()
        if chapter_phrase and chapter_phrase not in text:
            continue
        if not any(phrase in text for phrase in phrases):
            continue
        sources.append(
            RetrievedSource(
                chunk_id=str(chunk.id),
                page_start=chunk.page_start,
                page_end=chunk.page_end,
                excerpt=chunk.text_excerpt,
                score=None,
                context=chunk.text,
                document_id=str(document.id),
                document_filename=document.original_filename,
            )
        )
        if len(sources) == EXACT_REFERENCE_SOURCE_LIMIT:
            break
    return sources


def _keyword_sources(db: Session, document: Document, question: str) -> list[RetrievedSource]:
    terms = [
        word
        for word in re.findall(r"[a-z0-9]+", question.lower())
        if (len(word) >= 4 or word in SHORT_KEYWORD_TERMS) and word not in KEYWORD_STOPWORDS
    ]
    if not terms:
        return []

    chunks = list(
        db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .order_by(DocumentChunk.chunk_index)
        )
    )
    scored_chunks: list[tuple[int, DocumentChunk]] = []
    minimum_matches = min(2, len(terms))
    for chunk in chunks:
        if is_front_matter_chunk(chunk, len(chunks)):
            continue
        text = chunk.text.lower()
        match_count = sum(1 for term in terms if term in text)
        if match_count < minimum_matches:
            continue
        scored_chunks.append((match_count, chunk))

    scored_chunks.sort(key=lambda item: (-item[0], item[1].chunk_index))
    sources: list[RetrievedSource] = []
    for _, chunk in scored_chunks[:KEYWORD_SOURCE_LIMIT]:
        sources.append(
            RetrievedSource(
                chunk_id=str(chunk.id),
                page_start=chunk.page_start,
                page_end=chunk.page_end,
                excerpt=chunk.text_excerpt,
                score=None,
                context=chunk.text,
                document_id=str(document.id),
                document_filename=document.original_filename,
            )
        )
    return sources


def _overview_sources(db: Session, document: Document) -> list[RetrievedSource]:
    chunks = list(
        db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .order_by(DocumentChunk.chunk_index)
        )
    )
    return [
        replace(source, document_id=str(document.id), document_filename=document.original_filename)
        for source in build_overview_sources(chunks)
    ]


def _per_document_overview_sources(db: Session, documents: list[Document]) -> list[RetrievedSource]:
    sources: list[RetrievedSource] = []
    for document in documents:
        document_sources = _overview_sources(db, document)
        if document_sources:
            sources.append(document_sources[0])
    return sources


def _cached_insight_answer(document: Document, question: str) -> str | None:
    field = document_insight_field(question)
    if field is None:
        return None
    if field == "summary" and not question_needs_short_summary(question):
        return None
    payload = document.insight_payload if isinstance(document.insight_payload, dict) else {}
    if payload.get("version") != DOCUMENT_INTELLIGENCE_VERSION:
        return None
    answer = payload.get(field)
    return answer.strip() if isinstance(answer, str) and answer.strip() else None


def _question_can_use_document_insight(question: str) -> bool:
    field = document_insight_field(question)
    return field is not None and (field != "summary" or question_needs_short_summary(question))


def _ensure_document_insight(db: Session, document: Document, vector_service: VectorService) -> None:
    if (
        isinstance(document.insight_payload, dict)
        and document.insight_payload.get("version") == DOCUMENT_INTELLIGENCE_VERSION
        and document.insight_payload.get("summary")
    ):
        return
    insight_generator = getattr(vector_service, "generate_document_insight", None)
    if not callable(insight_generator):
        return

    chunks = list(
        db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .order_by(DocumentChunk.chunk_index)
        )
    )
    try:
        insight_payload = insight_generator(
            build_overview_sources(chunks, limit=DOCUMENT_INTELLIGENCE_SOURCE_LIMIT)
        )
    except Exception:
        logger.exception("Lazy document insight generation failed", extra={"document_id": str(document.id)})
        return
    if insight_payload:
        document.insight_payload = insight_payload
        document.insight_generated_at = utc_now()
        db.commit()
        db.refresh(document)


def _answer_page_references(answer: str) -> list[tuple[int, int]]:
    references: list[tuple[int, int]] = []
    for citation in re.finditer(r"\((?:p|pp)\.\s*([^)]+)\)", answer, flags=re.I):
        for page_match in re.finditer(r"\d+(?:\s*[-–—]\s*\d+)?", citation.group(1)):
            start_text, *end_text = re.split(r"\s*[-–—]\s*", page_match.group(0), maxsplit=1)
            page_start = int(start_text)
            page_end = int(end_text[0]) if end_text else page_start
            references.append((page_start, max(page_start, page_end)))
    return references


def _cached_insight_sources(document: Document, answer: str) -> list[RetrievedSource]:
    payload = document.insight_payload if isinstance(document.insight_payload, dict) else {}
    sources = payload.get("sources")
    if not isinstance(sources, list):
        return []

    retrieved_sources: list[RetrievedSource] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        try:
            UUID(str(source.get("chunk_id")))
            page_start = int(source.get("page_start", 1))
            page_end = int(source.get("page_end", page_start))
        except (TypeError, ValueError):
            continue
        retrieved_sources.append(
            RetrievedSource(
                chunk_id=str(source["chunk_id"]),
                page_start=page_start,
                page_end=page_end,
                excerpt=str(source.get("excerpt", "")),
                score=None,
            )
        )

    cited_pages = _answer_page_references(answer)
    if not cited_pages:
        return retrieved_sources[:DOCUMENT_OVERVIEW_SOURCE_LIMIT]
    cited_sources = [
        source
        for source in retrieved_sources
        if any(page_start <= source.page_end and page_end >= source.page_start for page_start, page_end in cited_pages)
    ]
    return cited_sources[:DOCUMENT_OVERVIEW_SOURCE_LIMIT]


def _hydrate_source_context(
    db: Session, documents: list[Document], sources: list[RetrievedSource]
) -> list[RetrievedSource]:
    chunk_ids = []
    for source in sources:
        try:
            chunk_ids.append(UUID(source.chunk_id))
        except ValueError:
            continue
    if not chunk_ids:
        return sources

    chunks = db.scalars(
        select(DocumentChunk).where(
            DocumentChunk.document_id.in_([document.id for document in documents]),
            DocumentChunk.id.in_(chunk_ids),
        )
    )
    text_by_chunk_id = {str(chunk.id): chunk.text for chunk in chunks}
    return [
        replace(source, context=source.context or text_by_chunk_id.get(source.chunk_id))
        for source in sources
    ]


def _merge_sources(*source_groups: list[RetrievedSource], limit: int = MAX_CONTEXT_SOURCES) -> list[RetrievedSource]:
    merged: list[RetrievedSource] = []
    seen_chunk_ids = set()
    for sources in source_groups:
        for source in sources:
            if source.chunk_id in seen_chunk_ids:
                continue
            seen_chunk_ids.add(source.chunk_id)
            merged.append(source)
            if len(merged) == limit:
                return merged
    return merged


def stream_chat_response(
    db: Session,
    user: User,
    documents: Document | list[Document],
    content: str,
    vector_service: VectorService,
    chat: Chat | None = None,
    model: str | None = None,
    settings: Settings | None = None,
) -> Iterator[str]:
    scope = documents if isinstance(documents, list) else [documents]
    if any(document.status != DocumentStatus.READY for document in scope):
        return iter([format_sse("error", {"message": "Document is not ready for chat"})])

    settings = settings or get_settings()
    if chat is None:
        chat = get_or_create_chat(db, user, scope[0])

    # Shared enforcement point for both the /api/chats stream and the legacy
    # per-document stream. This runs eagerly (before the response starts
    # streaming), so LimitExceeded surfaces as an HTTP 402 rather than a
    # mid-stream error, and it runs before the OpenAI call.
    # Re-validate against the current plan so a user who downgraded cannot
    # keep streaming with a premium model. Tiers ("fast"/"quality") are gated
    # on the resolved OpenAI model
    plan = get_active_plan(db, user)
    check_scope_size(plan, [document.id for document in scope])
    answer_model = settings.resolve_chat_model(model if model is not None else chat.model)
    if answer_model:
        check_model_allowed(plan, answer_model)
    check_and_increment(db, user, "ai_message")

    if model is not None:
        # The composer toggle sticks to the conversation; this becomes durable
        # with the message commit below.
        chat.model = model
    single_document = scope[0] if len(scope) == 1 else None
    message_document_id = single_document.id if single_document else None
    prior_messages = list(
        db.scalars(
            select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
        )
    )
    contextual_question = build_contextual_question(content, prior_messages)
    if not chat.title:
        chat.title = content[:AUTO_TITLE_MAX_CHARS]
    chat.updated_at = utc_now()
    user_message = Message(
        user_id=user.id,
        document_id=message_document_id,
        chat_id=chat.id,
        role=MessageRole.USER,
        status=MessageStatus.SUCCEEDED,
        content=content,
        created_at=utc_now(),
    )
    assistant_message = Message(
        user_id=user.id,
        document_id=message_document_id,
        chat_id=chat.id,
        role=MessageRole.ASSISTANT,
        status=MessageStatus.PENDING,
        content="",
        created_at=utc_now(),
    )
    db.add_all([user_message, assistant_message])
    db.commit()
    db.refresh(assistant_message)

    return _generate_chat_response(
        db,
        user,
        scope,
        single_document,
        chat,
        assistant_message,
        content,
        contextual_question,
        vector_service,
        answer_model,
    )


def _generate_chat_response(
    db: Session,
    user: User,
    scope: list[Document],
    single_document: Document | None,
    chat: Chat,
    assistant_message: Message,
    content: str,
    contextual_question: str,
    vector_service: VectorService,
    answer_model: str | None = None,
) -> Iterator[str]:
    answer_parts: list[str] = []
    sources: list[RetrievedSource] = []
    yield format_sse("message_start", {"message_id": str(assistant_message.id)})
    try:
        # Insight/summary shortcuts stay single-doc only; multi-doc questions go
        # through normal retrieval so answers stay attributable per document.
        needs_overview = single_document is not None and question_needs_document_overview(content)
        if needs_overview and _question_can_use_document_insight(content):
            _ensure_document_insight(db, single_document, vector_service)
        cached_answer = _cached_insight_answer(single_document, content) if needs_overview else None
        if cached_answer:
            sources = _hydrate_source_context(
                db, scope, _cached_insight_sources(single_document, cached_answer)
            )
            answer_parts.append(cached_answer)
            yield format_sse("token", {"text": cached_answer})
        else:
            exact_sources = [
                source
                for document in scope
                for source in _exact_reference_sources(db, document, contextual_question)
            ]
            keyword_sources = [
                source
                for document in scope
                for source in _keyword_sources(db, document, contextual_question)
            ]
            if needs_overview:
                overview_sources = _overview_sources(db, single_document)
                sources = _merge_sources(
                    overview_sources,
                    exact_sources,
                    keyword_sources,
                    limit=DOCUMENT_OVERVIEW_SOURCE_LIMIT,
                )
            else:
                # Test fakes may not carry settings; fall back to the constant.
                limit = getattr(
                    getattr(vector_service, "settings", None), "max_context_sources", MAX_CONTEXT_SOURCES
                )
                if single_document is not None:
                    vector_sources = vector_service.query_document(user, single_document, contextual_question)
                    sources = _merge_sources(exact_sources, keyword_sources, vector_sources, limit=limit)
                else:
                    limit = multi_document_context_source_limit(limit)
                    baseline_sources = (
                        _per_document_overview_sources(db, scope)
                        if question_needs_per_document_answer(content)
                        else []
                    )
                    vector_sources = vector_service.query_scope(user, scope, contextual_question)
                    # Cap lexical matches at half the budget so keyword hits
                    # (collected in scope order) cannot starve query_scope's
                    # fair per-document vector selection.
                    lexical = _merge_sources(exact_sources, keyword_sources, limit=limit // 2)
                    sources = _merge_sources(baseline_sources, lexical, vector_sources, limit=limit)
            sources = _hydrate_source_context(db, scope, sources)
            answer_kwargs = {"model": answer_model} if answer_model else {}
            for token in vector_service.stream_answer_tokens(contextual_question, sources, **answer_kwargs):
                answer_parts.append(token)
                yield format_sse("token", {"text": token})
    except Exception as exc:
        logger.exception(
            "Chat response generation failed",
            extra={"chat_id": str(chat.id), "message_id": str(assistant_message.id)},
        )
        # The prologue's increment became durable when the messages were
        # committed; give the credit back since no answer was produced.
        refund_ai_message(db, user)
        assistant_message.content = "".join(answer_parts)
        assistant_message.status = MessageStatus.FAILED
        assistant_message.message_metadata = {"error": str(exc)}
        db.commit()
        yield format_sse("error", {"message": "Unable to generate an answer right now."})
        return

    assistant_message.content = "".join(answer_parts)
    assistant_message.status = MessageStatus.SUCCEEDED
    default_document_id = str(scope[0].id)
    filename_by_document_id = {str(document.id): document.original_filename for document in scope}
    for rank, source in enumerate(sources, start=1):
        db.add(
            MessageSource(
                message_id=assistant_message.id,
                document_id=UUID(source.document_id or default_document_id),
                chunk_id=UUID(source.chunk_id),
                page_start=source.page_start,
                page_end=source.page_end,
                excerpt=source.excerpt,
                score=source.score,
                rank=rank,
            )
        )
    db.commit()
    yield format_sse(
        "sources",
        {
            "items": [
                {
                    "chunk_id": source.chunk_id,
                    "document_id": source.document_id or default_document_id,
                    "document_filename": source.document_filename
                    or filename_by_document_id.get(source.document_id or default_document_id),
                    "page_start": source.page_start,
                    "page_end": source.page_end,
                    "excerpt": source.excerpt,
                    "score": source.score,
                }
                for source in sources
            ]
        },
    )
    yield format_sse("message_done", {"message_id": str(assistant_message.id)})
