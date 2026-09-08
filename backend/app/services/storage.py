from datetime import timedelta

from botocore.exceptions import ClientError

from app.core.config import Settings
from app.models import Document
from app.models.mixins import utc_now


def build_document_object_key(user_id: object, document_id: object, extension: str = "pdf") -> str:
    return f"users/{user_id}/documents/{document_id}/original.{extension}"


def build_document_preview_object_key(user_id: object, document_id: object) -> str:
    return f"users/{user_id}/documents/{document_id}/preview.pdf"


class StorageService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def upload_file(self, object_key: str, content: bytes, content_type: str) -> None:
        if not self._has_wasabi_credentials:
            return

        client = self._client()
        client.put_object(
            Bucket=self.settings.wasabi_bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )

    def upload_pdf(self, object_key: str, content: bytes, content_type: str) -> None:
        self.upload_file(object_key, content, content_type)

    def upload_preview_pdf(self, document: Document, content: bytes) -> None:
        self.upload_file(
            build_document_preview_object_key(document.user_id, document.id),
            content,
            "application/pdf",
        )

    def download_file(self, bucket: str, object_key: str) -> bytes:
        if not self._has_wasabi_credentials:
            return b""

        client = self._client()
        try:
            response = client.get_object(Bucket=bucket, Key=object_key)
        except ClientError as error:
            if _is_missing_object_error(error):
                return b""
            raise
        return response["Body"].read()

    def download_pdf(self, document: Document) -> bytes:
        return self.download_file(document.wasabi_bucket, document.wasabi_object_key)

    def download_preview_pdf(self, document: Document) -> bytes:
        return self.download_file(
            document.wasabi_bucket,
            build_document_preview_object_key(document.user_id, document.id),
        )

    def signed_file_url(self, document: Document) -> dict[str, str]:
        expires_at = utc_now() + timedelta(seconds=self.settings.signed_url_ttl_seconds)
        if self._has_wasabi_credentials:
            client = self._client()
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": document.wasabi_bucket, "Key": document.wasabi_object_key},
                ExpiresIn=self.settings.signed_url_ttl_seconds,
            )
        else:
            url = (
                f"https://wasabi.local/{document.wasabi_bucket}/"
                f"{document.wasabi_object_key}?signed=placeholder"
            )
        return {"url": url, "expires_at": expires_at.isoformat()}

    def delete_pdf(self, document: Document) -> None:
        if not self._has_wasabi_credentials:
            return

        client = self._client()
        client.delete_object(Bucket=document.wasabi_bucket, Key=document.wasabi_object_key)
        if (document.format or "pdf") != "pdf":
            try:
                client.delete_object(
                    Bucket=document.wasabi_bucket,
                    Key=build_document_preview_object_key(document.user_id, document.id),
                )
            except ClientError as error:
                if not _is_missing_object_error(error):
                    raise

    def _client(self):
        import boto3

        return boto3.client(
            "s3",
            endpoint_url=self.settings.wasabi_endpoint_url,
            region_name=self.settings.wasabi_region,
            aws_access_key_id=self.settings.wasabi_access_key_id,
            aws_secret_access_key=self.settings.wasabi_secret_access_key,
        )

    @property
    def _has_wasabi_credentials(self) -> bool:
        return bool(
            self.settings.wasabi_access_key_id
            and self.settings.wasabi_secret_access_key
            and self.settings.wasabi_bucket
        )

def _is_missing_object_error(error: ClientError) -> bool:
    code = str(error.response.get("Error", {}).get("Code", ""))
    return code in {"NoSuchKey", "404", "NotFound"}

def get_storage_service(settings: Settings) -> StorageService:
    return StorageService(settings)

