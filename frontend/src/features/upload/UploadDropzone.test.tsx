import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_UPLOAD_EXTENSIONS, UPLOAD_ACCEPT, UploadDropzone } from "./UploadDropzone";

function renderDropzone(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("UploadDropzone", () => {
  it("exposes the full supported accept list on the file input", () => {
    renderDropzone(<UploadDropzone onAccepted={() => undefined} />);

    expect(UPLOAD_ACCEPT).toBe(".pdf,.docx,.pptx,.txt,.rtf");
    expect(screen.getByLabelText(/choose file/i)).toHaveAttribute("accept", ".pdf,.docx,.pptx,.txt,.rtf");
  });

  it.each(SUPPORTED_UPLOAD_EXTENSIONS.map((extension) => [extension]))(
    "accepts a %s file",
    async (extension) => {
      const onAccepted = vi.fn();
      const user = userEvent.setup();

      renderDropzone(<UploadDropzone onAccepted={onAccepted} />);

      await user.upload(
        screen.getByLabelText(/choose file/i),
        new File(["content"], `sample${extension}`, { type: "application/octet-stream" })
      );

      expect(onAccepted).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects unsupported files with clear validation copy", async () => {
    const onAccepted = vi.fn();

    renderDropzone(<UploadDropzone onAccepted={onAccepted} />);

    const input = screen.getByLabelText(/choose file/i);
    fireEvent.change(input, {
      target: { files: [new File(["binary"], "setup.exe", { type: "application/octet-stream" })] }
    });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported file type\. upload a pdf, docx, pptx, txt, or rtf file/i);
  });

  it("shows upload progress while the upload is in flight", async () => {
    const user = userEvent.setup();

    renderDropzone(<UploadDropzone onAccepted={() => new Promise(() => undefined)} initialProgress={42} />);

    const input = screen.getByLabelText(/choose file/i);
    await user.upload(input, new File(["%PDF"], "report.pdf", { type: "application/pdf" }));

    expect(screen.getByRole("progressbar", { name: /upload progress/i })).toHaveAttribute("aria-valuenow", "42");
  });

  it("clears the progress indicator once the upload settles", async () => {
    const user = userEvent.setup();
    let finishUpload = () => undefined as void;
    const onAccepted = () =>
      new Promise<void>((resolve) => {
        finishUpload = resolve;
      });

    renderDropzone(<UploadDropzone onAccepted={onAccepted} initialProgress={42} />);

    await user.upload(screen.getByLabelText(/choose file/i), new File(["%PDF"], "report.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("progressbar", { name: /upload progress/i })).toBeInTheDocument();

    finishUpload();

    await waitFor(() => {
      expect(screen.queryByRole("progressbar", { name: /upload progress/i })).not.toBeInTheDocument();
    });
  });

  it("shows an upgrade prompt for free users uploading files larger than 20 MB", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    const largePdf = new File([new Uint8Array(21 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });

    renderDropzone(<UploadDropzone onAccepted={onAccepted} maxFileSizeMb={20} />);

    await user.upload(screen.getByLabelText(/choose file/i), largePdf);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/max file size is 20 mb for the free plan/i);
    expect(screen.getByRole("link", { name: /upgrade your plan/i })).toHaveAttribute("href", "/app/billing");
  });

  it("allows premium users to upload files up to 50 MB", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    const premiumPdf = new File([new Uint8Array(21 * 1024 * 1024)], "premium.pdf", { type: "application/pdf" });

    renderDropzone(<UploadDropzone onAccepted={onAccepted} maxFileSizeMb={50} />);

    await user.upload(screen.getByLabelText(/choose file/i), premiumPdf);

    expect(onAccepted).toHaveBeenCalledTimes(1);
  });
});
