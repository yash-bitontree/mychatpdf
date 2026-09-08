from app.models import (
    Chat,
    Document,
    DocumentChunk,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    ProcessingJob,
    ProcessingJobStatus,
    User,
)


def test_core_models_can_be_created_with_relationships(db_session):
    user = User(
        clerk_user_id="user_models",
        email="models@example.com",
        name="Model Tester",
    )
    document = Document(
        user=user,
        original_filename="paper.pdf",
        content_type="application/pdf",
        file_size_bytes=1234,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="test-bucket",
        wasabi_object_key="users/user-id/documents/doc-id/original.pdf",
        pinecone_namespace="test",
    )
    chunk = DocumentChunk(
        user=user,
        document=document,
        chunk_index=0,
        page_start=1,
        page_end=1,
        text="A useful excerpt from a PDF.",
        text_excerpt="A useful excerpt",
        pinecone_vector_id="doc_1_chunk_0",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    chat = Chat(user=user, document=document, title="paper.pdf")
    user_message = Message(
        user=user,
        document=document,
        chat=chat,
        role=MessageRole.USER,
        status=MessageStatus.SUCCEEDED,
        content="What is this about?",
    )
    assistant_message = Message(
        user=user,
        document=document,
        chat=chat,
        role=MessageRole.ASSISTANT,
        status=MessageStatus.SUCCEEDED,
        content="It is about testing.",
    )
    source = MessageSource(
        message=assistant_message,
        document=document,
        chunk=chunk,
        page_start=1,
        page_end=1,
        excerpt="A useful excerpt",
        score=0.92,
        rank=1,
    )

    db_session.add_all(
        [
            user,
            document,
            chunk,
            job,
            chat,
            user_message,
            assistant_message,
            source,
        ]
    )
    db_session.commit()

    db_session.refresh(document)
    db_session.refresh(chat)
    db_session.refresh(assistant_message)

    assert document.user.clerk_user_id == "user_models"
    assert document.chunks[0].pinecone_vector_id == "doc_1_chunk_0"
    assert document.processing_jobs[0].status == ProcessingJobStatus.QUEUED
    assert {message.role for message in chat.messages} == {
        MessageRole.USER,
        MessageRole.ASSISTANT,
    }
    assert assistant_message.sources[0].excerpt == "A useful excerpt"
