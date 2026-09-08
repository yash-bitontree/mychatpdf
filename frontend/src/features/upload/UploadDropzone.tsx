import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, Loader2, UploadCloud } from "lucide-react";

const DEFAULT_MAX_FILE_SIZE_MB = 20;
const BYTES_PER_MB = 1024 * 1024;

export const SUPPORTED_UPLOAD_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".rtf"] as const;
export const UPLOAD_ACCEPT = SUPPORTED_UPLOAD_EXTENSIONS.join(",");

interface UploadDropzoneProps {
  onAccepted: (file: File) => void | Promise<void>;
  initialProgress?: number;
  maxFileSizeMb?: number;
}

function isSupportedFile(file: File) {
  const name = file.name.toLowerCase();
  return SUPPORTED_UPLOAD_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function UploadDropzone({
  onAccepted,
  initialProgress = 100,
  maxFileSizeMb = DEFAULT_MAX_FILE_SIZE_MB
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<{ message: string; showUpgradeLink?: boolean } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const maxFileSizeBytes = maxFileSizeMb * BYTES_PER_MB;

  function acceptFile(file: File) {
    if (!isSupportedFile(file)) {
      setError({ message: "Unsupported file type. Upload a PDF, DOCX, PPTX, TXT, or RTF file." });
      setFileName(null);
      setProgress(0);
      return;
    }

    if (file.size > maxFileSizeBytes) {
      setError({
        message: `Max file size is ${maxFileSizeMb} MB for the ${maxFileSizeMb <= DEFAULT_MAX_FILE_SIZE_MB ? "free" : "current"} plan.`,
        showUpgradeLink: maxFileSizeMb <= DEFAULT_MAX_FILE_SIZE_MB
      });
      setFileName(null);
      setProgress(0);
      return;
    }

    setError(null);
    setFileName(file.name);
    setProgress(initialProgress);
    void Promise.resolve(onAccepted(file)).finally(() => {
      setFileName(null);
      setProgress(0);
    });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      acceptFile(file);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      acceptFile(file);
    }
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`flex min-h-[280px] flex-col justify-center rounded-xl border-2 border-dashed bg-white p-6 text-center transition ${
        isDragging ? "brand-soft-surface border-sea ring-4 ring-teal-100" : "border-slate-300"
      }`}
    >
      <div className="brand-gradient mx-auto grid h-16 w-16 place-items-center rounded-xl text-white shadow-sm">
        <UploadCloud size={26} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-ink">Drop your document here</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
        Drag a PDF, DOCX, PPTX, TXT, or RTF file here or choose one from your computer. Uploads are validated before
        processing starts.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <input ref={inputRef} id="pdf-upload" type="file" accept={UPLOAD_ACCEPT} onChange={onInputChange} className="sr-only" />
        <label
          htmlFor="pdf-upload"
          className="brand-gradient inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_14px_28px_rgba(32,104,248,0.22)]"
        >
          <FileUp size={18} aria-hidden="true" />
          Choose file
        </label>
        {fileName ? <span className="text-sm font-medium text-slate-700">{fileName}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="mx-auto mt-4 max-w-md rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
          {error.showUpgradeLink ? (
            <>
              {" "}
              <Link to="/app/billing" className="font-semibold underline hover:no-underline">
                Upgrade your plan
              </Link>
              {" to upload files up to 50 MB."}
            </>
          ) : null}
        </p>
      ) : null}

      {progress > 0 ? (
        <div className="mx-auto mt-5 max-w-lg text-left">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Uploading file...
            </span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="brand-gradient h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
