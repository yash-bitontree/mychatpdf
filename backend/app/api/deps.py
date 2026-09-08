import logging
from functools import lru_cache
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import Chat, Document, Folder, User

logger = logging.getLogger(__name__)


@lru_cache(maxsize=8)
def get_clerk_jwks_client(jwks_url: str, timeout_seconds: int) -> PyJWKClient:
    return PyJWKClient(jwks_url, timeout=timeout_seconds)


async def get_current_clerk_claims(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        jwks_client = get_clerk_jwks_client(
            settings.clerk_jwks_url,
            settings.clerk_jwks_timeout_seconds,
        )
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        decode_kwargs: dict[str, Any] = {
            "algorithms": ["RS256"],
            "issuer": settings.clerk_issuer,
            "leeway": 30,
        }
        if settings.clerk_audience:
            decode_kwargs["audience"] = settings.clerk_audience
        else:
            decode_kwargs["options"] = {"verify_aud": False}
        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except jwt.PyJWTError as exc:
        logger.warning("Clerk JWT rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if not claims.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


def _claim_email(claims: dict[str, Any]) -> str | None:
    email = claims.get("email")
    if email:
        return str(email)
    email_addresses = claims.get("email_addresses")
    if isinstance(email_addresses, list) and email_addresses:
        first = email_addresses[0]
        if isinstance(first, dict):
            return first.get("email_address")
    return None


def _claim_name(claims: dict[str, Any]) -> str | None:
    name = claims.get("name")
    if name:
        return str(name)
    first_name = claims.get("first_name")
    last_name = claims.get("last_name")
    full_name = " ".join(part for part in [first_name, last_name] if part)
    return full_name or None


def sync_user_from_claims(db: Session, claims: dict[str, Any]) -> User:
    clerk_user_id = str(claims["sub"])
    user = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
    if user is None:
        user = User(
            clerk_user_id=clerk_user_id,
            email=_claim_email(claims),
            name=_claim_name(claims),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    email = _claim_email(claims)
    name = _claim_name(claims)
    if user.email != email or user.name != name:
        user.email = email
        user.name = name
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    claims: dict[str, Any] = Depends(get_current_clerk_claims),
    db: Session = Depends(get_db),
) -> User:
    return sync_user_from_claims(db, claims)


def get_owned_document(db: Session, user: User, document_id: UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.user_id != user.id or document.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def get_owned_folder(db: Session, user: User, folder_id: UUID) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None or folder.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def get_owned_chat(db: Session, user: User, chat_id: UUID) -> Chat:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id or chat.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat
