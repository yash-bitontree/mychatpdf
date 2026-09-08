"""Render uploaded office-style documents into PDF previews."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap

from app.services.processing import UnsupportedFileError

PREVIEW_PDF_FORMATS = {"docx", "pptx", "rtf"}
RTF_PREVIEW_LINE_WIDTH = 92
RTF_PREVIEW_FONT_SIZE = 11
RTF_PREVIEW_LINE_HEIGHT = 15
RTF_PREVIEW_MARGIN = 54
RTF_PREVIEW_PAGE_WIDTH = 595
RTF_PREVIEW_PAGE_HEIGHT = 842


class DocumentPreviewConverter:
    def __init__(self, *, timeout_seconds: int = 90):
        self.timeout_seconds = timeout_seconds

    def convert_to_pdf(self, data: bytes, document_format: str) -> bytes:
        if document_format not in PREVIEW_PDF_FORMATS:
            raise UnsupportedFileError(f"Preview conversion is not supported for format '{document_format}'.")

        try:
            return self._convert_with_libreoffice(data, document_format)
        except UnsupportedFileError:
            if document_format == "rtf":
                return _render_rtf_text_pdf(data)
            raise

    def _convert_with_libreoffice(self, data: bytes, document_format: str) -> bytes:
        executable = self._office_executable()
        if executable is None:
            raise UnsupportedFileError("Document preview conversion is not available on this server.")

        with tempfile.TemporaryDirectory(prefix="mychatpdf-preview-") as tmp_dir:
            work_dir = Path(tmp_dir)
            source_path = work_dir / f"source.{document_format}"
            profile_dir = work_dir / "lo-profile"
            profile_dir.mkdir()
            source_path.write_bytes(data)

            command = [
                executable,
                f"-env:UserInstallation={profile_dir.as_uri()}",
                "--headless",
                "--nologo",
                "--nofirststartwizard",
                "--convert-to",
                "pdf",
                "--outdir",
                str(work_dir),
                str(source_path),
            ]
            try:
                subprocess.run(
                    command,
                    check=True,
                    capture_output=True,
                    timeout=self.timeout_seconds,
                )
            except subprocess.TimeoutExpired as error:
                raise UnsupportedFileError("Document preview conversion timed out.") from error
            except subprocess.CalledProcessError as error:
                details = _decode_process_output(error.stderr) or _decode_process_output(error.stdout)
                message = "Document preview conversion failed."
                if details:
                    message = f"{message} {details}"
                raise UnsupportedFileError(message) from error

            output_path = source_path.with_suffix(".pdf")
            if not output_path.exists() or output_path.stat().st_size == 0:
                raise UnsupportedFileError("Document preview conversion did not produce a PDF.")
            return output_path.read_bytes()

    @staticmethod
    def _office_executable() -> str | None:
        return shutil.which("soffice") or shutil.which("libreoffice")


def _render_rtf_text_pdf(data: bytes) -> bytes:
    import fitz
    from striprtf.striprtf import rtf_to_text

    try:
        text = rtf_to_text(data.decode("utf-8", errors="replace"))
    except Exception as error:
        raise UnsupportedFileError("This RTF file could not be rendered for preview.") from error

    lines = _wrap_preview_text(text)
    if not any(line.strip() for line in lines):
        raise UnsupportedFileError("No readable text was found in this RTF file.")

    lines_per_page = max(1, int((RTF_PREVIEW_PAGE_HEIGHT - (RTF_PREVIEW_MARGIN * 2)) / RTF_PREVIEW_LINE_HEIGHT))
    pdf = fitz.open()
    try:
        for start in range(0, len(lines), lines_per_page):
            page = pdf.new_page(width=RTF_PREVIEW_PAGE_WIDTH, height=RTF_PREVIEW_PAGE_HEIGHT)
            rect = fitz.Rect(
                RTF_PREVIEW_MARGIN,
                RTF_PREVIEW_MARGIN,
                RTF_PREVIEW_PAGE_WIDTH - RTF_PREVIEW_MARGIN,
                RTF_PREVIEW_PAGE_HEIGHT - RTF_PREVIEW_MARGIN,
            )
            page.insert_textbox(
                rect,
                "\n".join(lines[start : start + lines_per_page]),
                fontsize=RTF_PREVIEW_FONT_SIZE,
                fontname="helv",
                color=(0, 0, 0),
            )
        return pdf.tobytes()
    finally:
        pdf.close()


def _wrap_preview_text(text: str) -> list[str]:
    lines: list[str] = []
    for paragraph in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = paragraph.strip()
        if not stripped:
            lines.append("")
            continue
        lines.extend(textwrap.wrap(stripped, width=RTF_PREVIEW_LINE_WIDTH) or [stripped])
    return lines


def _decode_process_output(output: bytes | None) -> str:
    if not output:
        return ""
    return output.decode("utf-8", errors="replace").strip()[:500]
