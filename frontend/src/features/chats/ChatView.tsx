import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, ExternalLink, Folder, Loader2, Pencil, SendHorizontal, X } from "lucide-react";
import { ChatDocumentRef, ChatMessage, ChatModelTier, ChatSummary, Citation } from "../../types";
import { citationPageLabel } from "../documents/status";
import { chatTitle } from "./ChatHistory";
import { chatModelTier, FastQualityToggle } from "./FastQualityToggle";

interface ChatViewProps {
  chat: ChatSummary | null;
  messages: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (content: string, model: ChatModelTier) => Promise<void> | void;
  onRenameChat?: (title: string) => Promise<void> | void;
  qualityAvailable?: boolean;
  onQualityUnavailable?: () => void;
}

interface PageReference {
  pageStart: number;
  pageEnd: number;
}

function findSourceDocument(chat: ChatSummary | null, source: Citation): ChatDocumentRef | undefined {
  if (!chat) {
    return undefined;
  }

  return (
    chat.documents.find((document) => document.id === source.documentId) ??
    chat.documents.find((document) => document.originalFilename === source.documentFilename)
  );
}

export function ChatView({ chat, messages, isLoading = false, onSendMessage, onRenameChat, qualityAvailable, onQualityUnavailable }: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [tier, setTier] = useState<ChatModelTier>("fast");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const canSend = Boolean(chat) && draft.trim().length > 0 && !isGenerating;

  useEffect(() => {
    if (chat) {
      setTier(chatModelTier(chat.model));
      setTitleDraft(chatTitle(chat));
      setIsRenamingTitle(false);
      setIsSavingTitle(false);
    }
  }, [chat?.id, chat?.model, chat?.title]);

  useEffect(() => {
    if (qualityAvailable === false && tier === "quality") {
      setTier("fast");
    }
  }, [qualityAvailable, tier]);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    if (typeof scrollContainer.scrollTo === "function") {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
      return;
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [messages, isGenerating]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating || !onSendMessage) {
      return;
    }

    setIsGenerating(true);
    setDraft("");
    try {
      await onSendMessage(content, tier);
    } finally {
      setIsGenerating(false);
    }
  }

  function startTitleRename() {
    if (!chat || !onRenameChat) {
      return;
    }
    setTitleDraft(chatTitle(chat));
    setIsRenamingTitle(true);
  }

  function cancelTitleRename() {
    setTitleDraft(chat ? chatTitle(chat) : "");
    setIsRenamingTitle(false);
  }

  async function commitTitleRename() {
    if (!chat || !onRenameChat || isSavingTitle) {
      return;
    }
    const title = titleDraft.trim();
    if (!title) {
      cancelTitleRename();
      return;
    }
    if (title === chatTitle(chat)) {
      setIsRenamingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      await onRenameChat(title);
      setIsRenamingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitleRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleRename();
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Conversation</p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {isRenamingTitle && chat ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  autoFocus
                  aria-label="Conversation name"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={onTitleKeyDown}
                  disabled={isSavingTitle}
                  maxLength={512}
                  className="min-h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-xl font-semibold text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  aria-label="Save conversation name"
                  onClick={() => void commitTitleRename()}
                  disabled={isSavingTitle || !titleDraft.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-teal-100 text-sea transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingTitle ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  aria-label="Cancel conversation name edit"
                  onClick={cancelTitleRename}
                  disabled={isSavingTitle}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="min-w-0 truncate text-xl font-semibold text-ink">{chat ? chatTitle(chat) : "Loading conversation..."}</h1>
                {chat && onRenameChat ? (
                  <button
                    type="button"
                    aria-label={`Rename ${chatTitle(chat)}`}
                    title="Rename conversation"
                    onClick={startTitleRename}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-sea"
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </>
            )}
          </div>
          {chat?.folder ? (
            <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-sea ring-1 ring-teal-100">
              <Folder size={13} aria-hidden="true" />
              <span className="truncate">{chat.folder.name}</span>
            </span>
          ) : null}
          {chat?.documents.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {chat.documents.map((document) => (
                <li
                  key={document.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                >
                  <span className="truncate font-medium">{document.originalFilename}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {document.format ?? "pdf"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div ref={chatScrollRef} className="scrollbar-soft min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_42%)] px-5 py-7">
        {isLoading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading conversation...
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {messages.length === 0 && chat ? (
              <div className="mr-auto max-w-[78ch] rounded-xl border border-teal-100 bg-white px-4 py-4 text-sm leading-6 text-slate-600 shadow-sm">
                Ask anything across {chat.documents.length === 1 ? "this document" : `these ${chat.documents.length} documents`}.
                Answers cite the document and page they come from.
              </div>
            ) : null}

            {messages.map((message) => {
              const isUserMessage = message.role === "user";
              const hasTable = message.role === "assistant" && containsMarkdownTable(message.content);
              return (
                <article
                  key={message.id}
                  className={
                    isUserMessage
                      ? "ml-auto w-fit max-w-[62%] rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-slate-900 shadow-sm"
                      : `mr-auto flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-ink shadow-sm ${hasTable ? "w-full max-w-5xl" : "max-w-[78ch]"}`
                  }
                >
                  {isUserMessage ? null : (
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <Bot size={15} aria-hidden="true" />
                    </span>
                  )}
                  {message.role === "assistant" && !message.content ? (
                    <p className="inline-flex items-center gap-2 text-sm leading-6 text-slate-600">
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Drafting grounded answer...
                    </p>
                  ) : (
                    <FormattedChatMessage chat={chat} message={message} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
        <div className="mx-auto w-full max-w-5xl">
          <label htmlFor="chat-view-composer" className="sr-only">
            Ask across these documents
          </label>
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-end gap-2">
              <textarea
                id="chat-view-composer"
                aria-label="Ask across these documents"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={!chat || isGenerating}
                rows={3}
                placeholder="Ask across these documents..."
                className="min-h-20 flex-1 resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-slate-400 disabled:bg-slate-100"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!canSend}
                className="brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
              >
                <SendHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <FastQualityToggle value={tier} onChange={setTier} disabled={!chat} qualityAvailable={qualityAvailable} onQualityUnavailable={onQualityUnavailable} />
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function FormattedChatMessage({ chat, message }: { chat: ChatSummary | null; message: ChatMessage }) {
  const blocks = parseChatMessageBlocks(message.content);
  const textClassName = message.role === "user" ? "text-slate-900" : "text-ink";

  return (
    <div className={`min-w-0 flex-1 space-y-3 break-words text-sm leading-6 ${textClassName}`}>
      {blocks.map((block, index) => {
        if (block.type === "table") {
          return (
            <MarkdownTable
              key={`table-${index}`}
              block={block}
              chat={chat}
              keyPrefix={`message-${message.id}-${index}`}
              sources={message.sources ?? []}
            />
          );
        }

        return (
          <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
            {renderInlineText(block.text, `message-${message.id}-${index}`, chat, message.sources ?? [])}
          </p>
        );
      })}
    </div>
  );
}

type ChatMessageBlock = { type: "paragraph"; text: string } | { type: "table"; header: string[]; rows: string[][] };

function containsMarkdownTable(content: string) {
  const lines = content.replace(/\r/g, "").split("\n");
  return lines.some((_, index) => parseMarkdownTable(lines, index) !== null);
}

function parseChatMessageBlocks(content: string): ChatMessageBlock[] {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ChatMessageBlock[] = [];
  const paragraphLines: string[] = [];
  let index = 0;

  function flushParagraph() {
    const text = paragraphLines.join("\n").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphLines.length = 0;
  }

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const table = parseMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      blocks.push({ type: "table", header: table.header, rows: table.rows });
      index = table.nextIndex;
      continue;
    }

    paragraphLines.push(line.trimEnd());
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  const header = parseMarkdownTableRow(lines[startIndex] ?? "");
  if (!header || !isMarkdownTableSeparator(lines[startIndex + 1] ?? "")) {
    return null;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = parseMarkdownTableRow(lines[index]);
    if (!row || isMarkdownTableSeparator(lines[index])) {
      break;
    }
    rows.push(normalizeTableRow(row, header.length));
    index += 1;
  }

  if (!rows.length) {
    return null;
  }

  return { header, rows, nextIndex: index };
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmedLine = line.trim();
  if (!trimmedLine.includes("|")) {
    return null;
  }

  const normalizedLine = trimmedLine.replace(/^\|/, "").replace(/\|$/, "");
  const cells = normalizedLine.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

function isMarkdownTableSeparator(line: string) {
  const cells = parseMarkdownTableRow(line);
  return Boolean(cells?.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, ""))));
}

function normalizeTableRow(row: string[], columnCount: number) {
  if (row.length === columnCount) {
    return row;
  }
  if (row.length < columnCount) {
    return [...row, ...Array.from({ length: columnCount - row.length }, () => "")];
  }
  return [...row.slice(0, columnCount - 1), row.slice(columnCount - 1).join(" | ")];
}

function MarkdownTable({
  block,
  chat,
  keyPrefix,
  sources
}: {
  block: Extract<ChatMessageBlock, { type: "table" }>;
  chat: ChatSummary | null;
  keyPrefix: string;
  sources: Citation[];
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm leading-5" aria-label="Comparison table">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            {block.header.map((cell, cellIndex) => (
              <th key={`${keyPrefix}-head-${cellIndex}`} scope="col" className="border-b border-slate-200 px-3 py-2 font-semibold align-top">
                {renderInlineText(cell, `${keyPrefix}-head-${cellIndex}`, chat, sources)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {block.rows.map((row, rowIndex) => (
            <tr key={`${keyPrefix}-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50/50">
              {row.map((cell, cellIndex) => (
                <td key={`${keyPrefix}-cell-${rowIndex}-${cellIndex}`} className="min-w-44 px-3 py-2 align-top text-slate-700">
                  {renderInlineText(cell, `${keyPrefix}-cell-${rowIndex}-${cellIndex}`, chat, sources)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInlineText(text: string, keyPrefix: string, chat: ChatSummary | null, sources: Citation[]) {
  const nodes: ReactNode[] = [];
  const citationPattern = /\((p{1,2})\.\s*([^)]+)\)/gi;
  let cursor = 0;
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(...renderStrongText(text.slice(cursor, match.index), `${keyPrefix}-text-${matchIndex}`));
    }

    const references = parsePageReferences(match[2]);
    if (references.length) {
      nodes.push(
        <InlineSourceReferences
          key={`${keyPrefix}-sources-${matchIndex}`}
          chat={chat}
          context={text}
          references={references}
          sources={sources}
        />
      );
    } else {
      nodes.push(match[0]);
    }

    cursor = match.index + match[0].length;
    matchIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(...renderStrongText(text.slice(cursor), `${keyPrefix}-text-end`));
  }

  return nodes;
}

function renderStrongText(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const strongPattern = /(\*\*|__)(.+?)\1/g;
  let cursor = 0;
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = strongPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    nodes.push(
      <strong key={`${keyPrefix}-strong-${matchIndex}`} className="font-semibold">
        {match[2]}
      </strong>
    );
    cursor = match.index + match[0].length;
    matchIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function InlineSourceReferences({
  chat,
  context,
  references,
  sources
}: {
  chat: ChatSummary | null;
  context: string;
  references: PageReference[];
  sources: Citation[];
}) {
  return (
    <span className="mx-1 inline-flex items-center gap-0.5 align-baseline">
      {references.map((reference, index) => {
        const source = findSourceForPage(sources, reference.pageStart, reference.pageEnd, context);
        const sourceIndex = source ? sources.findIndex((item) => item.sourceId === source.sourceId) + 1 : 0;
        const document = source ? findSourceDocument(chat, source) : undefined;
        const format = document?.format ?? "pdf";
        const pageLabel = citationPageLabel(format, reference.pageStart, reference.pageEnd);
        const documentName = source?.documentFilename ?? document?.originalFilename ?? "Document";
        const sourceLabel = `${documentName} - ${pageLabel}`;
        const badgeLabel = sourceIndex > 0 ? sourceIndex : reference.pageStart;

        if (document) {
          return (
            <Link
              key={`${reference.pageStart}-${reference.pageEnd}-${index}`}
              to={`/app/documents/${document.id}`}
              aria-label={`Open source ${badgeLabel}: ${sourceLabel}`}
              title={source?.excerpt ? `${sourceLabel}\n${source.excerpt}` : sourceLabel}
              className="inline-flex h-5 items-center justify-center gap-0.5 rounded-full bg-blue-100 px-1.5 text-[11px] font-semibold leading-none text-blue-700 transition hover:bg-blue-200"
            >
              <ExternalLink size={10} aria-hidden="true" />
              <span>{badgeLabel}</span>
            </Link>
          );
        }

        return (
          <span
            key={`${reference.pageStart}-${reference.pageEnd}-${index}`}
            aria-label={`Source ${badgeLabel}: ${sourceLabel}`}
            title={source?.excerpt ? `${sourceLabel}\n${source.excerpt}` : sourceLabel}
            className="inline-flex h-5 items-center justify-center gap-0.5 rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold leading-none text-slate-600"
          >
            <ExternalLink size={10} aria-hidden="true" />
            <span>{badgeLabel}</span>
          </span>
        );
      })}
    </span>
  );
}

function parsePageReferences(value: string): PageReference[] {
  return Array.from(value.matchAll(/\d+(?:\s*[-\u2013\u2014]\s*\d+)?/g))
    .map((match) => {
      const [startText, endText] = match[0].split(/[-\u2013\u2014]/).map((part) => part.trim());
      const pageStart = Number.parseInt(startText, 10);
      const parsedPageEnd = endText ? Number.parseInt(endText, 10) : pageStart;
      const pageEnd = Number.isFinite(parsedPageEnd) ? Math.max(pageStart, parsedPageEnd) : pageStart;

      if (!Number.isFinite(pageStart) || pageStart < 1) {
        return null;
      }

      return { pageStart, pageEnd };
    })
    .filter((reference): reference is PageReference => reference !== null);
}

function findSourceForPage(sources: Citation[], pageStart: number, pageEnd: number, context: string) {
  const overlappingSources = sources.filter((source) => pageStart <= source.pageEnd && pageEnd >= source.pageStart);
  const normalizedContext = context.toLowerCase();
  const contextualSource = overlappingSources.find((source) => {
    const filename = source.documentFilename?.toLowerCase();
    const stem = filename?.replace(/\.[^.]+$/, "");
    return Boolean((filename && normalizedContext.includes(filename)) || (stem && normalizedContext.includes(stem)));
  });

  return (
    contextualSource ??
    overlappingSources.find((source) => source.pageStart <= pageStart && source.pageEnd >= pageEnd) ??
    overlappingSources[0]
  );
}

