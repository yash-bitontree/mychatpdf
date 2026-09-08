"""folders: folder table plus document/chat folder links

Revision ID: 20260706_0006
Revises: 20260704_0005
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa

revision = "20260706_0006"
down_revision = "20260704_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_folders_user_id", "folders", ["user_id"])
    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(sa.Column("folder_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_documents_folder_id_folders", "folders", ["folder_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_index("ix_documents_folder_id", ["folder_id"])
    with op.batch_alter_table("chats") as batch_op:
        batch_op.add_column(sa.Column("folder_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_chats_folder_id_folders", "folders", ["folder_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_index("ix_chats_folder_id", ["folder_id"])


def downgrade() -> None:
    with op.batch_alter_table("chats") as batch_op:
        batch_op.drop_index("ix_chats_folder_id")
        batch_op.drop_constraint("fk_chats_folder_id_folders", type_="foreignkey")
        batch_op.drop_column("folder_id")
    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_index("ix_documents_folder_id")
        batch_op.drop_constraint("fk_documents_folder_id_folders", type_="foreignkey")
        batch_op.drop_column("folder_id")
    op.drop_index("ix_folders_user_id", table_name="folders")
    op.drop_table("folders")
