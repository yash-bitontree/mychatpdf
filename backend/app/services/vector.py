from dataclasses import dataclass
import json
import re
import time
from typing import Iterable, Iterator

from app.core.config import Settings
from app.models import Document, DocumentChunk, User


@dataclass(frozen=True)
class RetrievedSource:
    chunk_id: str
    page_start: int
    page_end: int
    excerpt: str
    score: float | None
    context: str | None = None
    document_id: str | None = None
    document_filename: str | None = None


ANSWER_SYSTEM_PROMPT = (
    "You are MyPDFChat's document-grounded assistant. "
    "Use the provided document context as the source of truth for what the document says. "
    "If the context contains a question, task, case, exercise, scenario, or problem statement but not its explicit answer, "
    "solve or reason from the document details using relevant general knowledge and clearly say the answer is derived, "
    "not copied from an explicit answer or solution. "
    "If the context contains an explicit answer, worked solution, conclusion, decision, recommendation, or result, "
    "say it is from the document and explain it directly. "
    "If the context does not contain enough information to identify the requested item or passage, say: "
    "'The document does not provide enough information to answer that.' "
    "Cite every document-derived factual claim with page citations in the form (p. 3) "
    "or (pp. 3-4), using only page numbers shown in the context blocks. "
    "Do not cite derived reasoning unless it depends on a fact or value from the document. "
    "Do not invent facts, citations, page numbers, filenames, or source labels. "
    "Use clean Markdown-style formatting with short paragraphs and bullets when helpful. "
    "When the user asks for a table, return a valid Markdown table with a header row, separator row, and concise cells. "
    "Use LaTeX for equations when it improves readability. "
    "For whole-document summaries, synthesize the document's purpose, scope, main sections, key points, "
    "and conclusions or action items when present; do not over-focus on one isolated section, appendix, "
    "formula, example, or exercise unless it is central to the document. "
    "Unless the user explicitly asks for a detailed, comprehensive, or exhaustive summary, answer plain "
    "whole-document summary requests with exactly 5 short bullets, no intro or closing paragraph, and about 150 words. "
    "For attention, focus, or study-guide questions, answer as a practical checklist of the most important concepts, "
    "risks, requirements, decisions, or actions the document emphasizes. "
    "Keep answers concise and directly useful; use bullets for summaries, comparisons, "
    "lists, requirements, risks, or action items. "
    "Do not add a separate Sources or References section; citations must stay inline. "
    "Preserve important technical terms and numbers exactly when they appear in context. "
    "If context blocks conflict, explain the conflict and cite both pages."
)
MULTI_DOCUMENT_ATTRIBUTION_PROMPT = (
    "When the context contains multiple documents, organize the answer by document whenever the user asks about "
    "each file, each document, all files, all documents, every file, every document, or per-document findings. "
    "Use one short section per document with the document filename as the section label, then add any cross-document "
    "comparison only after the per-document findings. "
    "Attribute each claim to its document by name. "
    "For comparisons, state per-document findings before the comparison."
)
PER_DOCUMENT_DETAIL_PROMPT = (
    "The user is asking for a per-document answer. Do not collapse the answer into generic source-by-source notes. "
    "Give every matched document its own concise section, synthesize the relevant teaching, lesson, finding, or point "
    "from that document, and include enough detail to distinguish it from the other documents."
)
SUMMARY_MAX_COMPLETION_TOKENS = 600
DOCUMENT_OVERVIEW_SOURCE_LIMIT = 12
DOCUMENT_INTELLIGENCE_SOURCE_LIMIT = 80
DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT = 1000
DOCUMENT_OVERVIEW_CONTEXT_TAIL_CHARS = 400
MULTI_DOCUMENT_RETRIEVAL_TOP_K_MIN = 16
MULTI_DOCUMENT_CONTEXT_SOURCE_LIMIT_MIN = 12
DOCUMENT_INTELLIGENCE_VERSION = 2
DOCUMENT_INTELLIGENCE_MAX_COMPLETION_TOKENS = 1400
DOCUMENT_INTELLIGENCE_FIELDS = ("summary", "key_takeaways", "action_items", "attention_points")
EXPLICIT_ACTION_MARKERS = (
    "action item",
    "assigned to",
    "deadline",
    "due date",
    "follow up",
    "next step",
    "owner:",
    "recommend",
    "required",
    "responsible",
    "shall",
    "task",
    "todo",
)
DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT = (
    "Generate reusable document intelligence from the provided source blocks only. "
    "Return valid JSON with exactly these string keys: summary, key_takeaways, action_items, attention_points. "
    "Each value must be a concise Markdown bullet list. "
    "Do not include page citations, source labels, printed page numbers, or standalone reference markers in any value. "
    "summary must contain exactly 5 short bullets that read like a coherent document overview, not a table of contents. "
    "For textbooks, course chapters, manuals, or training material, summarize the curriculum focus, main concepts, "
    "calculation methods, visualizations, applications, and problem-solving strategy. "
    "Ignore cover pages, formula sheets, tables of contents, appendices, indexes, problem lists, and printed page headers "
    "unless they are central to the document. "
    "key_takeaways must contain exactly 5 bullets with the most important ideas, findings, principles, or conclusions. "
    "action_items must list only explicit assigned actions, recommendations, deadlines, tasks, or next steps from the document. "
    "Do not convert topics, exercises, formulas, study advice, or reader activities into action items. "
    "if none are present, return exactly one bullet saying no explicit action items were found in the provided context. "
    "attention_points must contain exactly 5 bullets with concepts, risks, assumptions, formulas, requirements, "
    "definitions, exceptions, examples, or recurring themes a reader should focus on. "
    "Do not invent facts, page numbers, filenames, or source labels."
)
OVERVIEW_SECTION_TERMS = (
    "abstract",
    "executive summary",
    "overview",
    "introduction",
    "background",
    "scope",
    "learning objectives",
    "key ideas",
    "key points",
    "key findings",
    "findings",
    "recommendations",
    "review & summary",
    "summary",
    "conclusion",
    "next steps",
)
FRONT_MATTER_TERMS = (
    "contents",
    "preface",
    "acknowledgment",
    "acknowledgement",
    "supplementary materials",
)


def question_needs_short_summary(question: str) -> bool:
    text = question.lower()
    if not ("summar" in text and ("document" in text or "file" in text)):
        return False
    return not any(term in text for term in ("comprehensive", "detail", "exhaustive", "in depth", "in-depth", "thorough"))


def question_needs_per_document_answer(question: str) -> bool:
    text = question.lower()
    return any(
        phrase in text
        for phrase in (
            "each file",
            "each document",
            "all files",
            "all documents",
            "all the files",
            "all the documents",
            "all pdfs",
            "all the pdfs",
            "each pdf",
            "every file",
            "every document",
            "every pdf",
            "per file",
            "per document",
            "from each file",
            "from each document",
            "in each file",
            "in each document",
            "for each file",
            "for each document",
        )
    )


def multi_document_context_source_limit(configured_limit: int) -> int:
    return max(configured_limit, MULTI_DOCUMENT_CONTEXT_SOURCE_LIMIT_MIN)


def is_front_matter_chunk(chunk: DocumentChunk, total_chunks: int) -> bool:
    if chunk.chunk_index > max(2, total_chunks // 5):
        return False
    text = chunk.text.lower()
    compact_text = re.sub(r"[^a-z]+", "", text)
    if any(term in text for term in FRONT_MATTER_TERMS) or "contents" in compact_text:
        return True
    section_refs = re.findall(r"\b\d{1,3}\.\d+(?:\.\d+)?\b", text)
    page_refs = re.findall(r"\b\d{3,4}\b", text)
    return len(section_refs) >= 3 and len(page_refs) >= 8


def overview_context(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT:
        return cleaned

    tail_chars = min(DOCUMENT_OVERVIEW_CONTEXT_TAIL_CHARS, DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT // 2)
    head_chars = DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT - tail_chars
    return f"{cleaned[:head_chars].rstrip()} ... {cleaned[-tail_chars:].lstrip()}"


def build_overview_sources(
    chunks: Iterable[DocumentChunk],
    *,
    limit: int = DOCUMENT_OVERVIEW_SOURCE_LIMIT,
) -> list[RetrievedSource]:
    ordered_chunks = sorted(chunks, key=lambda chunk: chunk.chunk_index)
    if not ordered_chunks:
        return []

    content_chunks = [
        chunk for chunk in ordered_chunks if not is_front_matter_chunk(chunk, len(ordered_chunks))
    ] or ordered_chunks
    selected: list[DocumentChunk] = []
    selected_ids = set()

    def add_chunk(chunk: DocumentChunk) -> None:
        if chunk.id not in selected_ids and len(selected) < limit:
            selected.append(chunk)
            selected_ids.add(chunk.id)

    sample_count = min(limit, len(content_chunks))
    if sample_count == 1:
        add_chunk(content_chunks[0])
    else:
        for position in range(sample_count):
            index = round(position * (len(content_chunks) - 1) / (sample_count - 1))
            add_chunk(content_chunks[index])

    for chunk in content_chunks:
        text = chunk.text.lower()
        if any(term in text for term in OVERVIEW_SECTION_TERMS):
            add_chunk(chunk)

    return [
        RetrievedSource(
            chunk_id=str(chunk.id),
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            excerpt=chunk.text_excerpt,
            score=None,
            context=overview_context(chunk.text),
        )
        for chunk in selected[:limit]
    ]


def _markdown_bullets(value: object) -> str:
    if isinstance(value, str):
        return _strip_inline_citations(value.strip())
    if isinstance(value, list):
        return "\n".join(
            f"- {_strip_inline_citations(str(item).strip().lstrip('-* ').strip())}"
            for item in value
            if str(item).strip()
        )
    return ""


def _source_payload(source: RetrievedSource) -> dict[str, object]:
    return {
        "chunk_id": source.chunk_id,
        "page_start": source.page_start,
        "page_end": source.page_end,
        "excerpt": source.excerpt,
    }


def _strip_inline_citations(text: str) -> str:
    return re.sub(r"\s*\((?:p|pp)\.\s*[^)]*\)", "", text, flags=re.I).strip()


def _has_explicit_action_markers(sources: list[RetrievedSource]) -> bool:
    text = "\n".join(source.context or source.excerpt for source in sources).lower()
    return any(marker in text for marker in EXPLICIT_ACTION_MARKERS)


def _fair_scope_selection(sources: list[RetrievedSource], limit: int) -> list[RetrievedSource]:
    # Guarantee at least one source per matched document before filling the
    # remaining slots by score, so one verbose document cannot drown out the rest.
    ranked = sorted(sources, key=lambda source: source.score or 0.0, reverse=True)
    selected: list[RetrievedSource] = []
    selected_chunk_ids: set[str] = set()
    covered_documents: set[str | None] = set()
    for source in ranked:
        if len(selected) == limit:
            break
        if source.document_id in covered_documents:
            continue
        covered_documents.add(source.document_id)
        selected.append(source)
        selected_chunk_ids.add(source.chunk_id)
    for source in ranked:
        if len(selected) == limit:
            break
        if source.chunk_id not in selected_chunk_ids:
            selected.append(source)
            selected_chunk_ids.add(source.chunk_id)
    selected.sort(key=lambda source: source.score or 0.0, reverse=True)
    return selected


def _parse_json_object(text: str) -> dict[str, object]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        payload = json.loads(match.group(0)) if match else {}
    return payload if isinstance(payload, dict) else {}


class VectorService:
    def __init__(self, settings: Settings, sleeper=time.sleep):
        self.settings = settings
        self.sleeper = sleeper

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self.settings.openai_api_key:
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.openai_api_key)
            vectors: list[list[float]] = []
            batch_size = self.settings.openai_embedding_batch_size
            for start in range(0, len(texts), batch_size):
                batch = texts[start : start + batch_size]
                request: dict[str, object] = {
                    "model": self.settings.openai_embedding_model,
                    "input": batch,
                }
                if self.settings.openai_embedding_dimensions:
                    request["dimensions"] = self.settings.openai_embedding_dimensions
                response = self._retry_openai_request(lambda: client.embeddings.create(**request))
                vectors.extend(item.embedding for item in response.data)
            return vectors

        return [[0.0] for _ in texts]

    @staticmethod
    def _is_retryable_openai_error(exc: Exception) -> bool:
        # Retry transient/unknown failures, but never retry permanent client
        # errors (auth, bad request, not found, etc.) which can never recover.
        # Rate limits (429) remain retryable.
        if type(exc).__name__ in {
            "AuthenticationError",
            "PermissionDeniedError",
            "BadRequestError",
            "NotFoundError",
            "ConflictError",
            "UnprocessableEntityError",
        }:
            return False
        status_code = getattr(exc, "status_code", None)
        if isinstance(status_code, int) and 400 <= status_code < 500 and status_code != 429:
            return False
        return True

    def _retry_openai_request(self, operation):
        delay = self.settings.openai_retry_initial_seconds
        max_attempts = self.settings.openai_request_max_retries
        for attempt in range(1, max_attempts + 1):
            try:
                return operation()
            except Exception as exc:
                if attempt >= max_attempts or not self._is_retryable_openai_error(exc):
                    raise
                if delay:
                    self.sleeper(delay)
                    delay *= 2

    def upsert_document_chunks(
        self,
        user: User,
        document: Document,
        chunks: Iterable[DocumentChunk],
        vectors: list[list[float]],
    ) -> None:
        records = [
            {
                "id": chunk.pinecone_vector_id,
                "values": vector,
                "metadata": self._metadata_for_chunk(user, document, chunk),
            }
            for chunk, vector in zip(chunks, vectors, strict=False)
        ]
        if not records or not self.settings.pinecone_api_key:
            return

        from pinecone import Pinecone

        index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
        index.upsert(vectors=records, namespace=self.settings.pinecone_namespace)

    def query_document(self, user: User, document: Document, question: str) -> list[RetrievedSource]:
        return self.query_scope(user, [document], question)

    def query_scope(self, user: User, documents: list[Document], question: str) -> list[RetrievedSource]:
        filename_by_document_id = {str(document.id): document.original_filename for document in documents}
        source_limit = self.settings.max_context_sources
        top_k = self.settings.retrieval_top_k
        if len(documents) > 1:
            source_limit = multi_document_context_source_limit(source_limit)
            top_k = max(top_k, MULTI_DOCUMENT_RETRIEVAL_TOP_K_MIN, source_limit)
        if self.settings.openai_api_key and self.settings.pinecone_api_key:
            from pinecone import Pinecone

            question_vector = self.embed_texts([question])[0]
            index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
            response = index.query(
                vector=question_vector,
                namespace=self.settings.pinecone_namespace,
                top_k=top_k,
                include_metadata=True,
                filter={"user_id": str(user.id), "document_id": {"$in": list(filename_by_document_id)}},
            )
            sources = [
                RetrievedSource(
                    chunk_id=str(match.metadata.get("chunk_id")),
                    page_start=int(match.metadata.get("page_start", 1)),
                    page_end=int(match.metadata.get("page_end", match.metadata.get("page_start", 1))),
                    excerpt=str(match.metadata.get("text_excerpt", "")),
                    score=float(match.score) if match.score is not None else None,
                    document_id=str(match.metadata.get("document_id")),
                    document_filename=filename_by_document_id.get(str(match.metadata.get("document_id"))),
                )
                for match in response.matches
                if match.metadata
            ]
        else:
            sources = [
                RetrievedSource(
                    chunk_id=str(chunk.id),
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    excerpt=chunk.text_excerpt,
                    score=None,
                    document_id=str(document.id),
                    document_filename=document.original_filename,
                )
                for document in documents
                for chunk in document.chunks[:3]
            ]

        if len(documents) > 1:
            return _fair_scope_selection(sources, source_limit)
        return sources

    def delete_document_vectors(self, user: User, document: Document) -> None:
        if not self.settings.pinecone_api_key:
            return
        vector_ids = [chunk.pinecone_vector_id for chunk in document.chunks if chunk.pinecone_vector_id]
        if not vector_ids:
            return

        from pinecone import Pinecone

        index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
        index.delete(ids=vector_ids, namespace=self.settings.pinecone_namespace)

    def generate_document_insight(self, sources: list[RetrievedSource]) -> dict[str, object] | None:
        if not self.settings.openai_api_key or not sources:
            return None

        from openai import OpenAI

        context = "\n\n".join(format_source_context(index, source) for index, source in enumerate(sources, start=1))
        client = OpenAI(api_key=self.settings.openai_api_key)
        request: dict[str, object] = {
            "model": self.settings.openai_chat_model,
            "messages": [
                {"role": "system", "content": DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Document source blocks:\n{context}"},
            ],
            "response_format": {"type": "json_object"},
            "max_completion_tokens": DOCUMENT_INTELLIGENCE_MAX_COMPLETION_TOKENS,
        }
        if self.settings.openai_chat_temperature is not None:
            request["temperature"] = self.settings.openai_chat_temperature

        response = self._retry_openai_request(lambda: client.chat.completions.create(**request))
        content = response.choices[0].message.content or "{}"
        raw_payload = _parse_json_object(content)
        payload = {
            field: _markdown_bullets(raw_payload.get(field))
            for field in DOCUMENT_INTELLIGENCE_FIELDS
        }
        if not _has_explicit_action_markers(sources):
            payload["action_items"] = "- No explicit action items were found in the provided context."
        if not any(payload.values()):
            return None
        payload["version"] = DOCUMENT_INTELLIGENCE_VERSION
        payload["sources"] = [_source_payload(source) for source in sources]
        return payload

    def stream_answer_tokens(
        self, question: str, sources: list[RetrievedSource], model: str | None = None
    ) -> Iterator[str]:
        if not self.settings.openai_api_key:
            if sources:
                yield (
                    "Based on the retrieved document context, "
                    f"{sources[0].excerpt} ({format_page_citation(sources[0])})"
                )
            else:
                yield "The document does not provide enough information to answer that question."
            return

        from openai import OpenAI

        multi_document = len({source.document_id for source in sources if source.document_id}) > 1
        context = "\n\n".join(
            format_source_context(index, source, multi_document=multi_document)
            for index, source in enumerate(sources, start=1)
        )
        system_prompt = ANSWER_SYSTEM_PROMPT
        if multi_document:
            system_prompt = f"{ANSWER_SYSTEM_PROMPT} {MULTI_DOCUMENT_ATTRIBUTION_PROMPT}"
        if multi_document and question_needs_per_document_answer(question):
            system_prompt = f"{system_prompt} {PER_DOCUMENT_DETAIL_PROMPT}"
        client = OpenAI(api_key=self.settings.openai_api_key)
        request: dict[str, object] = {
            "model": model or self.settings.openai_chat_model,
            "stream": True,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": (
                        "Question:\n"
                        f"{question}\n\n"
                        "Document context blocks:\n"
                        f"{context or 'No context retrieved.'}\n\n"
                        "Answer requirements:\n"
                        "- Answer from the context blocks above when they contain the answer.\n"
                        "- If the context contains an explicit answer, solution, conclusion, decision, recommendation, or result, say it is from the document, not derived.\n"
                        "- If the context contains only the question, task, case, exercise, scenario, or problem statement, reason from it and label the answer as derived.\n"
                        "- Format the answer with short paragraphs or bullet lists when it improves readability.\n"
                        "- When the user asks for a table, return a valid Markdown table with a header row, separator row, and concise cells.\n"
                        "- For whole-document summaries, cover the major themes across the document instead of one narrow section.\n"
                        "- For plain whole-document summary requests, return exactly 5 short bullets, no intro or closing paragraph, about 150 words total unless the user asks for detail.\n"
                        "- If the user asks about each file, each document, all files, all documents, every file, every document, or per-document findings, do not apply the short-summary limit; use one concise section per document.\n"
                        "- For attention or focus questions, answer as a practical checklist of what matters most in the document.\n"
                        "- Put page citations on the same sentence or bullet as the claim they support.\n"
                        "- Use LaTeX for equations when it improves readability.\n"
                        "- Do not add a final Sources section.\n"
                        "- If the context is missing the requested item or passage, say the document does not provide enough information."
                    ),
                },
            ],
        }
        if self.settings.openai_chat_temperature is not None:
            request["temperature"] = self.settings.openai_chat_temperature
        if question_needs_short_summary(question) and not question_needs_per_document_answer(question):
            request["max_completion_tokens"] = SUMMARY_MAX_COMPLETION_TOKENS
        stream = client.chat.completions.create(**request)
        for event in stream:
            token = event.choices[0].delta.content
            if token:
                yield token

    def _metadata_for_chunk(
        self,
        user: User,
        document: Document,
        chunk: DocumentChunk,
    ) -> dict[str, object]:
        return {
            "user_id": str(user.id),
            "clerk_user_id": user.clerk_user_id,
            "document_id": str(document.id),
            "chunk_id": str(chunk.id),
            "chunk_index": chunk.chunk_index,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "text_excerpt": chunk.text_excerpt,
        }


def get_vector_service(settings: Settings) -> VectorService:
    return VectorService(settings)


def format_page_citation(source: RetrievedSource) -> str:
    if source.page_start == source.page_end:
        return f"p. {source.page_start}"
    return f"pp. {source.page_start}-{source.page_end}"


def format_source_context(index: int, source: RetrievedSource, *, multi_document: bool = False) -> str:
    if multi_document:
        pages = (
            f"p.{source.page_start}"
            if source.page_start == source.page_end
            else f"p.{source.page_start}-{source.page_end}"
        )
        return f'[S{index} · "{source.document_filename}" {pages}]\nText:\n{source.context or source.excerpt}'
    return f"[Source {index} | {format_page_citation(source)}]\nText:\n{source.context or source.excerpt}"

