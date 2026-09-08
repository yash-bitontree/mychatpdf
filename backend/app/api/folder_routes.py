from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_owned_folder
from app.db.session import get_db
from app.models import Document, Folder, User

router = APIRouter()

FOLDER_NAME_MAX_CHARS = 255


def _validated_folder_name(payload: dict[str, object]) -> str:
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=422, detail="Folder name is required")
    name = name.strip()
    if len(name) > FOLDER_NAME_MAX_CHARS:
        raise HTTPException(status_code=422, detail="Folder name must be 255 characters or fewer")
    return name


def _folder_summary(folder: Folder, document_count: int) -> dict[str, object]:
    return {
        "id": str(folder.id),
        "name": folder.name,
        "document_count": document_count,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def _document_count(db: Session, folder: Folder) -> int:
    return db.scalar(
        select(func.count(Document.id)).where(
            Document.folder_id == folder.id, Document.deleted_at.is_(None)
        )
    )


@router.post("/api/folders", status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = Folder(user_id=current_user.id, name=_validated_folder_name(payload))
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _folder_summary(folder, document_count=0)


@router.get("/api/folders")
def list_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    rows = db.execute(
        select(Folder, func.count(Document.id))
        .outerjoin(Document, (Document.folder_id == Folder.id) & Document.deleted_at.is_(None))
        .where(Folder.user_id == current_user.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at)
    ).all()
    return {"items": [_folder_summary(folder, count) for folder, count in rows]}


@router.patch("/api/folders/{folder_id}")
def rename_folder(
    folder_id: UUID,
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = get_owned_folder(db, current_user, folder_id)
    folder.name = _validated_folder_name(payload)
    db.commit()
    db.refresh(folder)
    return _folder_summary(folder, document_count=_document_count(db, folder))


@router.delete("/api/folders/{folder_id}")
def delete_folder(
    folder_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    folder = get_owned_folder(db, current_user, folder_id)
    # Documents are kept (the ORM nulls their folder_id, mirroring the FK's
    # SET NULL); folder chats and their messages cascade away.
    db.delete(folder)
    db.commit()
    return {"status": "deleted"}
