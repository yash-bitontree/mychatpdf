"""add document insight cache

Revision ID: 20260630_0002
Revises: 20260613_0001
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "20260630_0002"
down_revision = "20260613_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("insight_payload", sa.JSON(), nullable=True))
    op.add_column("documents", sa.Column("insight_generated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "insight_generated_at")
    op.drop_column("documents", "insight_payload")
