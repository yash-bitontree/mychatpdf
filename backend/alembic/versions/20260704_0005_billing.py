"""billing: plans, subscriptions, usage periods, stripe customer id

Revision ID: 20260704_0005
Revises: 20260704_0004
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa

from app.services.billing import PLAN_SEEDS

revision = "20260704_0005"
down_revision = "20260704_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    plans = op.create_table(
        "plans",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("interval", sa.String(length=16), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=True),
        sa.Column("limit_ai_messages", sa.Integer(), nullable=False),
        sa.Column("limit_uploads", sa.Integer(), nullable=False),
        sa.Column("limit_storage_mb", sa.Integer(), nullable=False),
        sa.Column("limit_document_scope", sa.Integer(), nullable=False),
        sa.Column("allowed_chat_models", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.String(length=64), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_subscription_id"),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_table(
        "usage_periods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ai_messages_used", sa.Integer(), nullable=False),
        sa.Column("uploads_used", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "period_start"),
    )
    op.create_index("ix_usage_periods_user_id", "usage_periods", ["user_id"])
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint("uq_users_stripe_customer_id", ["stripe_customer_id"])

    op.bulk_insert(plans, [dict(seed) for seed in PLAN_SEEDS])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_stripe_customer_id", type_="unique")
        batch_op.drop_column("stripe_customer_id")
    op.drop_index("ix_usage_periods_user_id", table_name="usage_periods")
    op.drop_table("usage_periods")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_table("plans")
