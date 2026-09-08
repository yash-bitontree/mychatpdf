import sys
from types import SimpleNamespace

from app.core.config import Settings
from app.models import Document, DocumentChunk, DocumentStatus, User
from app.services.vector import (
    DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT,
    MULTI_DOCUMENT_ATTRIBUTION_PROMPT,
    PER_DOCUMENT_DETAIL_PROMPT,
    SUMMARY_MAX_COMPLETION_TOKENS,
    RetrievedSource,
    VectorService,
    format_source_context,
    multi_document_context_source_limit,
    question_needs_per_document_answer,
    question_needs_short_summary,
)


def test_embed_texts_passes_configured_openai_dimensions(monkeypatch):
    calls = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            calls.append(kwargs)

            class FakeEmbedding:
                embedding = [0.1, 0.2]

            class FakeResponse:
                data = [FakeEmbedding()]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_embedding_model="text-embedding-3-small",
        openai_embedding_dimensions=512,
    )

    vectors = VectorService(settings).embed_texts(["hello"])

    assert vectors == [[0.1, 0.2]]
    assert calls == [
        {
            "model": "text-embedding-3-small",
            "input": ["hello"],
            "dimensions": 512,
        }
    ]


def test_embed_texts_batches_requests_and_preserves_order(monkeypatch):
    calls = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            calls.append(kwargs["input"])

            class FakeResponse:
                data = [
                    type("FakeEmbedding", (), {"embedding": [float(len(calls)), float(index)]})()
                    for index, _text in enumerate(kwargs["input"])
                ]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_embedding_batch_size=2,
    )

    vectors = VectorService(settings).embed_texts(["one", "two", "three"])

    assert calls == [["one", "two"], ["three"]]
    assert vectors == [[1.0, 0.0], [1.0, 1.0], [2.0, 0.0]]


def test_embed_texts_retries_transient_openai_failures(monkeypatch):
    attempts = 0
    sleeps = []

    class FakeEmbeddings:
        def create(self, **kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("temporary")

            class FakeEmbedding:
                embedding = [0.4]

            class FakeResponse:
                data = [FakeEmbedding()]

            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(
        openai_api_key="sk-test",
        openai_request_max_retries=2,
        openai_retry_initial_seconds=0.25,
    )

    vectors = VectorService(settings, sleeper=sleeps.append).embed_texts(["hello"])

    assert vectors == [[0.4]]
    assert attempts == 2
    assert sleeps == [0.25]


def test_stream_answer_tokens_omits_temperature_by_default(monkeypatch):
    calls = []

    class FakeDelta:
        content = "Answer"

    class FakeChoice:
        delta = FakeDelta()

    class FakeEvent:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return [FakeEvent()]

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = Settings(openai_api_key="sk-test", openai_chat_model="gpt-5-mini")
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=1,
        page_end=1,
        excerpt="Relevant context.",
        score=0.9,
    )

    tokens = list(VectorService(settings).stream_answer_tokens("Question?", [source]))

    assert tokens == ["Answer"]
    assert "temperature" not in calls[0]


def test_stream_answer_tokens_caps_plain_document_summaries(monkeypatch):
    calls = []

    class FakeDelta:
        content = "Answer"

    class FakeChoice:
        delta = FakeDelta()

    class FakeEvent:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return [FakeEvent()]

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=1,
        page_end=1,
        excerpt="Relevant context.",
        score=0.9,
    )

    list(VectorService(Settings(openai_api_key="sk-test")).stream_answer_tokens("Summarize this document.", [source]))

    assert calls[0]["max_completion_tokens"] == SUMMARY_MAX_COMPLETION_TOKENS


def test_generate_document_insight_returns_structured_cache(monkeypatch):
    calls = []

    class FakeMessage:
        content = (
            '{"summary":"- Summary (p. 1)",'
            '"key_takeaways":"- Takeaway (p. 1)",'
            '"action_items":"- Apply the concepts as a study task (p. 1)",'
            '"attention_points":"- Attention point (p. 2)"}'
        )

    class FakeChoice:
        message = FakeMessage()

    class FakeResponse:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return FakeResponse()

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    sources = [
        RetrievedSource(
            chunk_id="00000000-0000-0000-0000-000000000001",
            page_start=1,
            page_end=1,
            excerpt="First source.",
            score=None,
            context="First source.",
        ),
        RetrievedSource(
            chunk_id="00000000-0000-0000-0000-000000000002",
            page_start=2,
            page_end=2,
            excerpt="Second source.",
            score=None,
            context="Second source.",
        ),
    ]

    payload = VectorService(Settings(openai_api_key="sk-test")).generate_document_insight(sources)

    assert payload["summary"] == "- Summary"
    assert payload["key_takeaways"] == "- Takeaway"
    assert payload["action_items"] == "- No explicit action items were found in the provided context."
    assert payload["attention_points"] == "- Attention point"
    assert payload["sources"][1]["page_start"] == 2
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert "Do not include page citations" in DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT
    assert "Do not convert topics, exercises, formulas, study advice, or reader activities into action items" in (
        DOCUMENT_INTELLIGENCE_SYSTEM_PROMPT
    )


def test_stream_answer_tokens_without_openai_includes_page_citation():
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=2,
        page_end=3,
        excerpt="Relevant context.",
        score=None,
    )

    tokens = list(VectorService(Settings(openai_api_key=None)).stream_answer_tokens("Question?", [source]))

    assert tokens == ["Based on the retrieved document context, Relevant context. (pp. 2-3)"]


def test_short_summary_detection_keeps_detailed_requests_uncapped():
    assert question_needs_short_summary("Summarize this document.") is True
    assert question_needs_short_summary("Give me a detailed summary of this document.") is False
    assert question_needs_short_summary("Summarize this selected passage.") is False


def test_per_document_question_detection():
    assert question_needs_per_document_answer("What is the teaching from each file?") is True
    assert question_needs_per_document_answer("What is the summary from all the files?") is True
    assert question_needs_per_document_answer("Compare every document.") is True
    assert question_needs_per_document_answer("What is the teaching here?") is False
    assert multi_document_context_source_limit(8) == 12
    assert multi_document_context_source_limit(20) == 20


def test_delete_document_vectors_uses_stored_vector_ids(db_session, monkeypatch):
    calls = []

    class FakeIndex:
        def delete(self, **kwargs):
            calls.append(kwargs)

    class FakePinecone:
        def __init__(self, api_key):
            self.api_key = api_key

        def Index(self, name):
            calls.append({"index": name})
            return FakeIndex()

    monkeypatch.setitem(sys.modules, "pinecone", SimpleNamespace(Pinecone=FakePinecone))
    user = User(clerk_user_id="user_vectors", email="vectors@example.com")
    document = Document(
        user=user,
        original_filename="paper.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all(
        [
            user,
            document,
            DocumentChunk(
                user=user,
                document=document,
                chunk_index=0,
                page_start=1,
                page_end=1,
                text="First chunk",
                text_excerpt="First chunk",
                pinecone_vector_id="vec-1",
            ),
            DocumentChunk(
                user=user,
                document=document,
                chunk_index=1,
                page_start=2,
                page_end=2,
                text="Second chunk",
                text_excerpt="Second chunk",
                pinecone_vector_id="vec-2",
            ),
        ]
    )
    db_session.commit()

    VectorService(
        Settings(
            pinecone_api_key="pinecone-key",
            pinecone_index_name="mychatpdf",
            pinecone_namespace="phase1",
        )
    ).delete_document_vectors(user, document)

    assert calls == [
        {"index": "mychatpdf"},
        {"ids": ["vec-1", "vec-2"], "namespace": "phase1"},
    ]


def _scope_document(user: User, filename: str) -> Document:
    return Document(
        user=user,
        original_filename=filename,
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key=f"users/user/documents/{filename}/original.pdf",
        pinecone_namespace="test",
    )


def _pinecone_match(document_id: str, chunk_id: str, score: float) -> SimpleNamespace:
    return SimpleNamespace(
        metadata={
            "chunk_id": chunk_id,
            "page_start": 1,
            "page_end": 1,
            "text_excerpt": f"Excerpt {chunk_id}.",
            "document_id": document_id,
        },
        score=score,
    )


def _patch_fake_pinecone_and_openai(monkeypatch, matches: list[SimpleNamespace], query_calls: list):
    class FakeIndex:
        def query(self, **kwargs):
            query_calls.append(kwargs)
            return SimpleNamespace(matches=matches)

    class FakePinecone:
        def __init__(self, api_key):
            self.api_key = api_key

        def Index(self, name):
            return FakeIndex()

    class FakeEmbeddings:
        def create(self, **kwargs):
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1, 0.2])])

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.embeddings = FakeEmbeddings()

    monkeypatch.setitem(sys.modules, "pinecone", SimpleNamespace(Pinecone=FakePinecone))
    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)


def test_query_scope_filters_pinecone_with_document_id_in(db_session, monkeypatch):
    user = User(clerk_user_id="user_scope", email="scope@example.com")
    document_a = _scope_document(user, "contract-a.pdf")
    document_b = _scope_document(user, "contract-b.pdf")
    db_session.add_all([user, document_a, document_b])
    db_session.commit()
    query_calls: list = []
    _patch_fake_pinecone_and_openai(
        monkeypatch,
        [_pinecone_match(str(document_a.id), "chunk-a-0", 0.9)],
        query_calls,
    )
    settings = Settings(_env_file=None, openai_api_key="sk-test", pinecone_api_key="pinecone-key")

    sources = VectorService(settings).query_scope(user, [document_a, document_b], "Which notice period applies?")

    assert query_calls[0]["filter"] == {
        "user_id": str(user.id),
        "document_id": {"$in": [str(document_a.id), str(document_b.id)]},
    }
    assert query_calls[0]["top_k"] == 16
    assert sources[0].document_id == str(document_a.id)
    assert sources[0].document_filename == "contract-a.pdf"


def test_query_scope_guarantees_a_source_from_each_matched_document(db_session, monkeypatch):
    user = User(clerk_user_id="user_fair", email="fair@example.com")
    document_a = _scope_document(user, "verbose.pdf")
    document_b = _scope_document(user, "quiet.pdf")
    db_session.add_all([user, document_a, document_b])
    db_session.commit()
    matches = [
        _pinecone_match(str(document_a.id), f"chunk-a-{index}", 0.9 - index * 0.01) for index in range(16)
    ] + [_pinecone_match(str(document_b.id), "chunk-b-0", 0.2)]
    _patch_fake_pinecone_and_openai(monkeypatch, matches, [])
    settings = Settings(_env_file=None, openai_api_key="sk-test", pinecone_api_key="pinecone-key")

    sources = VectorService(settings).query_scope(user, [document_a, document_b], "Compare the documents.")

    assert len(sources) == 12
    assert any(source.document_id == str(document_b.id) for source in sources)


def test_query_document_delegates_to_single_document_scope(db_session, monkeypatch):
    user = User(clerk_user_id="user_single", email="single@example.com")
    document = _scope_document(user, "paper.pdf")
    db_session.add_all([user, document])
    db_session.commit()
    query_calls: list = []
    _patch_fake_pinecone_and_openai(
        monkeypatch,
        [_pinecone_match(str(document.id), "chunk-0", 0.9)],
        query_calls,
    )
    settings = Settings(_env_file=None, openai_api_key="sk-test", pinecone_api_key="pinecone-key")

    sources = VectorService(settings).query_document(user, document, "Question?")

    assert query_calls[0]["filter"] == {
        "user_id": str(user.id),
        "document_id": {"$in": [str(document.id)]},
    }
    assert sources[0].excerpt == "Excerpt chunk-0."
    assert sources[0].document_id == str(document.id)


def test_format_source_context_labels_documents_only_when_multi_document():
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=12,
        page_end=13,
        excerpt="Clause text.",
        score=0.9,
        document_id="doc-a",
        document_filename="contract-a.pdf",
    )

    assert format_source_context(3, source, multi_document=True).startswith('[S3 · "contract-a.pdf" p.12-13]')
    assert format_source_context(3, source).startswith("[Source 3 | pp. 12-13]")


def _recording_stream_openai(monkeypatch, calls: list):
    class FakeDelta:
        content = "Answer"

    class FakeChoice:
        delta = FakeDelta()

    class FakeEvent:
        choices = [FakeChoice()]

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return [FakeEvent()]

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = FakeChat()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)


def test_stream_answer_tokens_adds_per_document_detail_prompt_for_each_file_questions(monkeypatch):
    calls: list = []
    _recording_stream_openai(monkeypatch, calls)
    sources = [
        RetrievedSource(
            chunk_id="chunk-a",
            page_start=1,
            page_end=1,
            excerpt="The first story teaches generosity.",
            score=0.9,
            document_id="doc-a",
            document_filename="story-a.pdf",
        ),
        RetrievedSource(
            chunk_id="chunk-b",
            page_start=2,
            page_end=2,
            excerpt="The second story teaches patience.",
            score=0.8,
            document_id="doc-b",
            document_filename="story-b.pdf",
        ),
    ]
    service = VectorService(Settings(_env_file=None, openai_api_key="sk-test"))

    list(service.stream_answer_tokens("What is the summary from all the files?", sources))

    assert PER_DOCUMENT_DETAIL_PROMPT in calls[0]["messages"][0]["content"]
    assert "do not apply the short-summary limit" in calls[0]["messages"][1]["content"]
    assert "max_completion_tokens" not in calls[0]


def test_stream_answer_tokens_adds_attribution_prompt_for_multi_document_sources(monkeypatch):
    calls: list = []
    _recording_stream_openai(monkeypatch, calls)
    sources = [
        RetrievedSource(
            chunk_id="chunk-a",
            page_start=1,
            page_end=1,
            excerpt="From contract A.",
            score=0.9,
            document_id="doc-a",
            document_filename="contract-a.pdf",
        ),
        RetrievedSource(
            chunk_id="chunk-b",
            page_start=4,
            page_end=5,
            excerpt="From contract B.",
            score=0.8,
            document_id="doc-b",
            document_filename="contract-b.pdf",
        ),
    ]
    service = VectorService(Settings(_env_file=None, openai_api_key="sk-test"))

    list(service.stream_answer_tokens("Compare the contracts.", sources))

    assert MULTI_DOCUMENT_ATTRIBUTION_PROMPT in calls[0]["messages"][0]["content"]
    assert '[S1 · "contract-a.pdf" p.1]' in calls[0]["messages"][1]["content"]
    assert '[S2 · "contract-b.pdf" p.4-5]' in calls[0]["messages"][1]["content"]

    list(service.stream_answer_tokens("Question?", sources[:1]))

    assert MULTI_DOCUMENT_ATTRIBUTION_PROMPT not in calls[1]["messages"][0]["content"]
    assert "[Source 1 | p. 1]" in calls[1]["messages"][1]["content"]


def test_stream_answer_tokens_uses_model_override(monkeypatch):
    calls: list = []
    _recording_stream_openai(monkeypatch, calls)
    source = RetrievedSource(
        chunk_id="chunk-id",
        page_start=1,
        page_end=1,
        excerpt="Relevant context.",
        score=0.9,
    )
    service = VectorService(Settings(_env_file=None, openai_api_key="sk-test", openai_chat_model="gpt-4.1-mini"))

    list(service.stream_answer_tokens("Question?", [source], model="o4-mini"))
    list(service.stream_answer_tokens("Question?", [source]))

    assert calls[0]["model"] == "o4-mini"
    assert calls[1]["model"] == "gpt-4.1-mini"


def _retry_settings():
    return Settings(
        _env_file=None,
        openai_api_key="sk-test",
        openai_request_max_retries=3,
        openai_retry_initial_seconds=0,
    )


class _Transient(Exception):
    status_code = 503


class _Permanent(Exception):
    status_code = 401


def test_retry_recovers_after_transient_errors():
    attempts = {"n": 0}

    def operation():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise _Transient("temporary")
        return "ok"

    result = VectorService(_retry_settings(), sleeper=lambda _d: None)._retry_openai_request(operation)

    assert result == "ok"
    assert attempts["n"] == 3


def test_retry_does_not_retry_permanent_errors():
    attempts = {"n": 0}

    def operation():
        attempts["n"] += 1
        raise _Permanent("bad key")

    service = VectorService(_retry_settings(), sleeper=lambda _d: None)
    try:
        service._retry_openai_request(operation)
        raised = False
    except _Permanent:
        raised = True

    assert raised is True
    assert attempts["n"] == 1
