"""free plan single document chat scope

Revision ID: 20260714_0008
Revises: 20260706_0007
Create Date: 2026-07-14
"""
from alembic import op

revision = "20260714_0008"
down_revision = "20260706_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE plans SET limit_document_scope = 1 WHERE id = 'free'")


def downgrade() -> None:
    op.execute("UPDATE plans SET limit_document_scope = 2 WHERE id = 'free'")