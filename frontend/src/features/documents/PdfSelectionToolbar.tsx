import type { ReactNode } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

export type PdfSelectionAction = "explain" | "summarize" | "rewrite" | "ask";
export type PdfSelectionCopyStatus = "idle" | "copied" | "failed";

export interface PdfSelection {
  text: string;
  pageNumber: number;
  top: number;
  left: number;
  blockKey?: string;
}

interface PdfSelectionToolbarProps {
  copyStatus: PdfSelectionCopyStatus;
  selection: PdfSelection;
  isDisabled: boolean;
  onAction: (action: PdfSelectionAction) => void;
  onCopy: () => void;
}

const actions: Array<{ action: PdfSelectionAction; label: string }> = [
  { action: "explain", label: "Explain" },
  { action: "summarize", label: "Summarize" },
  { action: "rewrite", label: "Rewrite" }
];

export function PdfSelectionToolbar({ copyStatus, selection, isDisabled, onAction, onCopy }: PdfSelectionToolbarProps) {
  const copyLabel = copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy selection";
  const CopyIcon = copyStatus === "copied" ? Check : Copy;

  return (
    <div
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={(event) => event.preventDefault()}
      className="brand-gradient fixed z-50 flex -translate-x-1/2 -translate-y-full items-center rounded-md text-white shadow-panel"
      style={{ left: selection.left, top: selection.top }}
    >
      {actions.map(({ action, label }, index) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          disabled={isDisabled}
          className={`h-11 px-3 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/45 ${
            index > 0 ? "border-l border-white/20" : ""
          }`}
        >
          {label}
        </button>
      ))}
      <span className="h-6 w-px bg-white/20" aria-hidden="true" />
      <ToolbarIconButton
        label="Ask question about this"
        disabled={isDisabled}
        onClick={() => onAction("ask")}
        icon={<MessageCircle size={18} aria-hidden="true" />}
      />
      <ToolbarIconButton label={copyLabel} onClick={onCopy} icon={<CopyIcon size={18} aria-hidden="true" />} />
    </div>
  );
}

function ToolbarIconButton({
  disabled = false,
  icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <span className="group relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className="grid h-11 w-11 place-items-center text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/45"
      >
        {icon}
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-3 py-2 text-xs font-medium text-white opacity-0 shadow-panel transition group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}
