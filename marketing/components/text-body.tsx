import { CheckIcon } from "@/components/icons";

// Renders CMS long-text bodies: blank-line separated blocks. "## " lines
// become h2 headings, blocks where every line starts with "- " become
// check-bulleted lists, and everything else is a paragraph.
export default function TextBody({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="text-ink mt-10 text-2xl font-semibold tracking-tight first:mt-0">
              {block.slice(3)}
            </h2>
          );
        }
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={i} className="space-y-3">
              {lines.map((line, j) => (
                <li key={j} className="flex items-start gap-3 leading-relaxed text-slate-600">
                  <span
                    className="bg-ice text-sea mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    aria-hidden
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span>{line.slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed text-slate-600">
            {block}
          </p>
        );
      })}
    </div>
  );
}
