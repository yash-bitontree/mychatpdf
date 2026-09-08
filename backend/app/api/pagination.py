from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException


def encode_cursor(created_at: datetime, item_id: UUID) -> str:
    payload = f"{created_at.isoformat()}|{item_id}"
    return urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str, detail: str = "Invalid cursor") -> tuple[datetime, UUID]:
    try:
        padded_cursor = cursor + ("=" * (-len(cursor) % 4))
        raw_cursor = urlsafe_b64decode(padded_cursor.encode("ascii")).decode("utf-8")
        created_at, item_id = raw_cursor.split("|", 1)
        return datetime.fromisoformat(created_at), UUID(item_id)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail=detail) from exc
