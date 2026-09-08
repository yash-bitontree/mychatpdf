"""chat scope join table and conversation fields

Revision ID: 20260704_0003
Revises: 20260630_0002
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa

revision = "20260704_0003"
down_revision = "20260630_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_documents",
        sa.Column("chat_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("chat_id", "document_id"),
    )
    op.execute(
        "INSERT INTO chat_documents (chat_id, document_id, position) SELECT id, document_id, 0 FROM chats"
    )
    with op.batch_alter_table("chats") as batch_op:
        batch_op.alter_column("document_id", existing_type=sa.Uuid(), nullable=True)
        batch_op.add_column(sa.Column("model", sa.String(length=64), nullable=True))
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column("document_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column("document_id", existing_type=sa.Uuid(), nullable=False)
    with op.batch_alter_table("chats") as batch_op:
        batch_op.drop_column("model")
        batch_op.alter_column("document_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_table("chat_documents")
