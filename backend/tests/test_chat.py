from app.models import (
    Chat,
    Document,
    DocumentChunk,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    User,
)
from app.services.chat import (
    build_contextual_question,
    document_insight_field,
    question_needs_document_overview,
    stream_chat_response,
)
from app.services.vector import (
    ANSWER_SYSTEM_PROMPT,
    DOCUMENT_INTELLIGENCE_VERSION,
    DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT,
    RetrievedSource,
    format_source_context,
)


def test_get_chat_creates_empty_chat_for_owned_document(authenticated_client, db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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
    db_session.add_all([user, document])
    db_session.commit()

    response = authenticated_client.get(f"/api/documents/{document.id}/chat")

    assert response.status_code == 200
    body = response.json()
    assert body["chat"]["document_id"] == str(document.id)
    assert body["chat"]["title"] == "paper.pdf"
    assert body["messages"] == []
    assert db_session.query(Chat).filter_by(document_id=document.id).count() == 1


def test_chat_stream_emits_phase_1_sse_event_names(authenticated_client, db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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
    db_session.add_all([user, document])
    db_session.commit()

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "Summarize this document."},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: message_start" in body
    assert "event: token" in body
    assert "event: sources" in body
    assert "event: message_done" in body


def test_chat_stream_persists_retrieved_sources(authenticated_client, db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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
    chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=7,
        page_end=7,
        text="Pipeline quality improved in regulated industries.",
        text_excerpt="Pipeline quality improved in regulated industries.",
        pinecone_vector_id="doc_chunk_0",
    )
    db_session.add_all([user, document, chunk])
    db_session.commit()

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "What improved?"},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "Pipeline quality improved" in body

    source = db_session.query(MessageSource).one()
    assert source.chunk_id == chunk.id
    assert source.page_start == 7
    assert source.rank == 1


def test_chat_stream_sends_full_chunk_context_to_answer_generator(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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
    chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=9,
        page_end=9,
        text="Visible lead. Hidden answer appears after the saved excerpt.",
        text_excerpt="Visible lead.",
        pinecone_vector_id="doc_chunk_0",
    )
    db_session.add_all([user, document, chunk])
    db_session.commit()

    class RecordingVectorService:
        def __init__(self):
            self.sources = None

        def query_document(self, _user, _document, _question):
            return [
                RetrievedSource(
                    chunk_id=str(chunk.id),
                    page_start=9,
                    page_end=9,
                    excerpt=chunk.text_excerpt,
                    score=0.9,
                )
            ]

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, document, "Where is the answer?", vector_service))

    assert vector_service.sources[0].context == chunk.text


def test_chat_stream_prepends_exact_chapter_question_source(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="policy-manual.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    wrong_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=42,
        page_end=42,
        text="642 CHAPTER 21 Access Requests Figure 21.9 Question 10.",
        text_excerpt="642 CHAPTER 21 Access Requests",
        pinecone_vector_id="doc_chunk_0",
    )
    right_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=1,
        page_start=72,
        page_end=72,
        text=(
            "688 CHAPTER 22 Data Retention. 10 In Fig. 22.8, the archive owner reviews "
            "records against the seven-year retention rule. Figure 22.8 Question 10."
        ),
        text_excerpt="688 CHAPTER 22 Data Retention.",
        pinecone_vector_id="doc_chunk_1",
    )
    db_session.add_all([user, document, wrong_chunk, right_chunk])
    db_session.commit()

    class RecordingVectorService:
        def __init__(self):
            self.sources = None

        def query_document(self, _user, _document, _question):
            return [
                RetrievedSource(
                    chunk_id=str(wrong_chunk.id),
                    page_start=42,
                    page_end=42,
                    excerpt=wrong_chunk.text_excerpt,
                    score=0.9,
                )
            ]

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = RecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            document,
            "what is the answer for chapter 22 question 10",
            vector_service,
        )
    )

    assert vector_service.sources[0].chunk_id == str(right_chunk.id)
    assert "seven-year retention rule" in vector_service.sources[0].context


def test_document_overview_question_detection_ignores_selected_passages():
    assert question_needs_document_overview("Summarize this document.") is True
    assert question_needs_document_overview("What are the key takeaways?") is True
    assert question_needs_document_overview("What does this document cover?") is True
    assert question_needs_document_overview("What should I pay attention to?") is True
    assert question_needs_document_overview("What action items are recommended?") is True
    assert question_needs_document_overview("Summarize this selected passage from page 4") is False
    assert document_insight_field("Summarize this document.") == "summary"
    assert document_insight_field("What are the key takeaways?") == "key_takeaways"
    assert document_insight_field("List action items.") == "action_items"
    assert document_insight_field("What should I pay attention to?") == "attention_points"


def test_chat_stream_prepends_content_overview_sources_for_broad_questions(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="board-report.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    front_matter_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=1,
        page_end=1,
        text="Contents. Preface. Supplementary materials and publisher resources.",
        text_excerpt="Contents. Preface.",
        pinecone_vector_id="doc_chunk_0",
    )
    intro_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=1,
        page_start=1,
        page_end=1,
        text="Introduction. This report explains the program scope, timeline, and business goals.",
        text_excerpt="Introduction. This report explains the program scope.",
        pinecone_vector_id="doc_chunk_1",
    )
    middle_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=2,
        page_start=8,
        page_end=8,
        text="The middle section covers operating risks, delivery milestones, and budget updates.",
        text_excerpt="The middle section covers operating risks.",
        pinecone_vector_id="doc_chunk_2",
    )
    conclusion_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=3,
        page_start=20,
        page_end=20,
        text="Conclusion. The document recommends phased rollout and stronger vendor controls.",
        text_excerpt="Conclusion. The document recommends phased rollout.",
        pinecone_vector_id="doc_chunk_3",
    )
    narrow_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=4,
        page_start=21,
        page_end=21,
        text="A late appendix lists one vendor invoice exception.",
        text_excerpt="A late appendix lists one vendor invoice exception.",
        pinecone_vector_id="doc_chunk_4",
    )
    db_session.add_all([user, document, front_matter_chunk, intro_chunk, middle_chunk, conclusion_chunk, narrow_chunk])
    db_session.commit()

    class RecordingVectorService:
        def __init__(self):
            self.sources = None

        def query_document(self, _user, _document, _question):
            return [
                RetrievedSource(
                    chunk_id=str(narrow_chunk.id),
                    page_start=21,
                    page_end=21,
                    excerpt=narrow_chunk.text_excerpt,
                    score=0.9,
                )
            ]

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, document, "What should I pay attention to?", vector_service))

    source_context = "\n".join(source.context or source.excerpt for source in vector_service.sources)
    assert "Introduction" in source_context
    assert "middle section" in source_context
    assert "Conclusion" in source_context
    assert vector_service.sources[0].chunk_id != str(front_matter_chunk.id)


def test_overview_questions_use_broad_condensed_context(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="long-report.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    chunks = [
        DocumentChunk(
            user=user,
            document=document,
            chunk_index=index,
            page_start=index + 1,
            page_end=index + 1,
            text=f"Section {index + 1}. " + ("detail " * 260) + f"Final point {index + 1}.",
            text_excerpt=f"Section {index + 1}.",
            pinecone_vector_id=f"doc_chunk_{index}",
        )
        for index in range(20)
    ]
    db_session.add_all([user, document, *chunks])
    db_session.commit()

    class RecordingVectorService:
        def __init__(self):
            self.sources = None

        def query_document(self, _user, _document, _question):
            raise AssertionError("vector search should not run for overview questions with chunks")

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, document, "Summarize this document.", vector_service))

    assert len(vector_service.sources) == 12
    assert vector_service.sources[0].page_start == 1
    assert vector_service.sources[-1].page_start == 20
    assert all(
        len(source.context or "") <= DOCUMENT_OVERVIEW_CONTEXT_CHAR_LIMIT + len(" ... ")
        for source in vector_service.sources
    )
    assert "Final point" in vector_service.sources[0].context


def test_overview_questions_use_cached_document_insights(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="plan.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
        insight_payload={
            "version": DOCUMENT_INTELLIGENCE_VERSION,
            "summary": "- Cached summary point (p. 2)",
            "key_takeaways": "- Cached takeaway (p. 2)",
            "action_items": "- Cached action item (p. 2)",
            "attention_points": "- Cached attention point (p. 2)",
            "sources": [],
        },
    )
    db_session.add_all([user, document])
    db_session.commit()

    class UnusedVectorService:
        def query_document(self, _user, _document, _question):
            raise AssertionError("cached overview answers should not run vector search")

        def stream_answer_tokens(self, _question, _sources):
            raise AssertionError("cached overview answers should not call the LLM")

    prompts = {
        "Summarize this document.": "Cached summary point",
        "What are the key takeaways?": "Cached takeaway",
        "List action items.": "Cached action item",
        "What should I pay attention to?": "Cached attention point",
    }

    for prompt, expected in prompts.items():
        events = list(stream_chat_response(db_session, user, document, prompt, UnusedVectorService()))
        assert any(expected in event for event in events)


def test_overview_questions_lazily_backfill_missing_document_insights(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="old.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=1,
        page_end=1,
        text="Executive summary. The rollout reduced support volume.",
        text_excerpt="Executive summary.",
        pinecone_vector_id="doc_chunk_0",
    )
    db_session.add_all([user, document, chunk])
    db_session.commit()

    class BackfillVectorService:
        def generate_document_insight(self, sources):
            return {
                "summary": "- Lazy cached summary (p. 1)",
                "version": DOCUMENT_INTELLIGENCE_VERSION,
                "key_takeaways": "- Lazy cached takeaway (p. 1)",
                "action_items": "- No explicit action items were found in the provided context.",
                "attention_points": "- Lazy cached attention point (p. 1)",
                "sources": [
                    {
                        "chunk_id": source.chunk_id,
                        "page_start": source.page_start,
                        "page_end": source.page_end,
                        "excerpt": source.excerpt,
                    }
                    for source in sources
                ],
            }

        def query_document(self, _user, _document, _question):
            raise AssertionError("lazy cached overview answers should not run vector search")

        def stream_answer_tokens(self, _question, _sources):
            raise AssertionError("lazy cached overview answers should not call the answer LLM")

    events = list(stream_chat_response(db_session, user, document, "Summarize this document.", BackfillVectorService()))

    db_session.refresh(document)
    assert document.insight_payload["summary"] == "- Lazy cached summary (p. 1)"
    assert document.insight_generated_at is not None
    assert any("Lazy cached summary" in event for event in events)


def test_chat_stream_prepends_keyword_sources_before_noisy_vector_matches(db_session):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="security-guide.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    toc_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=1,
        page_end=1,
        text="B R I E F C O N T E N T S 1 Overview 100 2 Incident Response 120 2.1 Triage 121 2.2 Escalation 122 2.3 Evidence 123",
        text_excerpt="B R I E F C O N T E N T S",
        pinecone_vector_id="doc_chunk_0",
    )
    answer_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=1,
        page_start=12,
        page_end=12,
        text="Incident response is the process for triaging security events, preserving evidence, notifying owners, and restoring service.",
        text_excerpt="Incident response is the process for triaging security events.",
        pinecone_vector_id="doc_chunk_1",
    )
    noisy_chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=2,
        page_start=30,
        page_end=30,
        text="Appendix. Vendor invoice exception details.",
        text_excerpt="Appendix. Vendor invoice exception details.",
        pinecone_vector_id="doc_chunk_2",
    )
    db_session.add_all([user, document, toc_chunk, answer_chunk, noisy_chunk])
    db_session.commit()

    class RecordingVectorService:
        def __init__(self):
            self.sources = None

        def query_document(self, _user, _document, _question):
            return [
                RetrievedSource(
                    chunk_id=str(noisy_chunk.id),
                    page_start=30,
                    page_end=30,
                    excerpt=noisy_chunk.text_excerpt,
                    score=0.9,
                )
            ]

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, document, "What is the incident response target?", vector_service))

    assert vector_service.sources[0].chunk_id == str(answer_chunk.id)
    assert all(source.chunk_id != str(toc_chunk.id) for source in vector_service.sources)


def test_chat_stream_uses_recent_history_for_follow_up_retrieval_and_answer(db_session):
    class RecordingVectorService:
        def __init__(self):
            self.query = None
            self.answer_question = None

        def query_document(self, _user, _document, question):
            self.query = question
            return []

        def stream_answer_tokens(self, question, _sources):
            self.answer_question = question
            yield "The approved exception expires on 2026-10-31."

    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="contract.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    chat = Chat(user=user, document=document, title="contract.pdf")
    db_session.add_all([user, document, chat])
    db_session.flush()
    db_session.add_all(
        [
            Message(
                user=user,
                document=document,
                chat=chat,
                role=MessageRole.USER,
                status=MessageStatus.SUCCEEDED,
                content="Who is the technical owner and what is the approved exception?",
            ),
            Message(
                user=user,
                document=document,
                chat=chat,
                role=MessageRole.ASSISTANT,
                status=MessageStatus.SUCCEEDED,
                content=(
                    "The approved exception is temporary CSV export over SFTP "
                    "until 2026-10-31."
                ),
            ),
        ]
    )
    db_session.commit()
    vector_service = RecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            document,
            "When does it expire?",
            vector_service,
        )
    )

    assert "When does it expire?" in vector_service.query
    assert "temporary CSV export over SFTP" in vector_service.query
    assert "2026-10-31" in vector_service.answer_question


def test_contextual_question_does_not_dilute_standalone_questions():
    prior_messages = [
        Message(
            role=MessageRole.USER,
            status=MessageStatus.SUCCEEDED,
            content="What are the annual contract value and payment terms?",
        ),
        Message(
            role=MessageRole.ASSISTANT,
            status=MessageStatus.SUCCEEDED,
            content="The annual contract value is $1,284,500 and payment terms are Net 45.",
        ),
    ]
    current_question = "Who is the technical owner and what is the approved exception?"

    contextual_question = build_contextual_question(current_question, prior_messages)

    assert contextual_question == current_question


def test_contextual_question_keeps_short_standalone_questions_clean():
    contextual_question = build_contextual_question(
        "What is incident response?",
        [
            Message(
                role=MessageRole.ASSISTANT,
                status=MessageStatus.SUCCEEDED,
                content="Earlier answer about vendor invoices and payment timing.",
            )
        ],
    )

    assert contextual_question == "What is incident response?"


def test_contextual_question_keeps_overview_questions_clean():
    contextual_question = build_contextual_question(
        "Summarize this document.",
        [
            Message(
                role=MessageRole.ASSISTANT,
                status=MessageStatus.SUCCEEDED,
                content="Earlier answer about one vendor executive review exception.",
            )
        ],
    )

    assert contextual_question == "Summarize this document."


def test_answer_prompt_contract_requires_grounded_page_citations():
    source = RetrievedSource(
        chunk_id="00000000-0000-0000-0000-000000000001",
        page_start=3,
        page_end=4,
        excerpt="The service must return structured JSON with event labels and confidence scores.",
        score=0.92,
    )

    assert "source of truth for what the document says" in ANSWER_SYSTEM_PROMPT
    assert "question, task, case, exercise, scenario, or problem statement" in ANSWER_SYSTEM_PROMPT
    assert "derived, not copied from an explicit answer or solution" in ANSWER_SYSTEM_PROMPT
    assert "explicit answer, worked solution, conclusion, decision, recommendation, or result" in ANSWER_SYSTEM_PROMPT
    assert "Do not invent facts" in ANSWER_SYSTEM_PROMPT
    assert "Use LaTeX for equations" in ANSWER_SYSTEM_PROMPT
    assert "whole-document summaries" in ANSWER_SYSTEM_PROMPT
    assert "150 words" in ANSWER_SYSTEM_PROMPT
    assert "attention, focus, or study-guide questions" in ANSWER_SYSTEM_PROMPT
    assert "Do not add a separate Sources or References section" in ANSWER_SYSTEM_PROMPT
    assert "(p. 3)" in ANSWER_SYSTEM_PROMPT
    assert "[Source 1 | pp. 3-4]" in format_source_context(1, source)


def test_chat_stream_marks_assistant_failed_when_generation_errors(db_session):
    class FailingVectorService:
        def query_document(self, _user, _document, _question):
            return []

        def stream_answer_tokens(self, _question, _sources):
            raise RuntimeError("OpenAI unavailable")
            yield ""

    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
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
    db_session.add_all([user, document])
    db_session.commit()

    events = list(
        stream_chat_response(
            db_session,
            user,
            document,
            "Summarize this document.",
            FailingVectorService(),
        )
    )

    assistant_message = (
        db_session.query(Message)
        .filter_by(document_id=document.id, role=MessageRole.ASSISTANT)
        .one()
    )
    assert any("event: error" in event for event in events)
    assert assistant_message.status == MessageStatus.FAILED
    assert "OpenAI unavailable" in (assistant_message.message_metadata or {}).get("error", "")


def test_chat_stream_for_non_ready_document_returns_error_event(
    authenticated_client,
    db_session,
):
    user = User(
        clerk_user_id="user_2abc123",
        email="casey@example.com",
        name="Casey Example",
    )
    document = Document(
        user=user,
        original_filename="paper.pdf",
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([user, document])
    db_session.commit()

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "Can I chat now?"},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: error" in body
