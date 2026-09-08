from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Folder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "folders"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255))

    user: Mapped["User"] = relationship(back_populates="folders")
    # Documents survive folder deletion (FK SET NULL); the ORM nulls folder_id
    # on loaded rows so the semantics hold on SQLite too. Folder chats are
    # deleted with the folder (FK CASCADE, mirrored by the ORM cascade below).
    documents: Mapped[list["Document"]] = relationship(
        back_populates="folder",
        order_by="Document.created_at",
    )
    chats: Mapped[list["Chat"]] = relationship(
        back_populates="folder",
        cascade="all, delete-orphan",
    )
