const http = require("http");
const { randomUUID } = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOST = process.env.MYCHATPDF_MANUAL_API_HOST ?? "0.0.0.0";
const PORT = Number(process.env.MYCHATPDF_MANUAL_API_PORT ?? 8000);
const repoRoot = path.resolve(__dirname, "..");
const backendPython = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
const documents = new Map();
let nextDocumentNumber = 1;

function corsHeaders(contentType = "application/json") {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "content-type": contentType
  };
}

function send(res, status, body, contentType = "application/json") {
  res.writeHead(status, corsHeaders(contentType));
  res.end(Buffer.isBuffer(body) ? body : typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function parseMultipartUpload(req, body) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { filename: "manual-upload.pdf", fileBytes: body };
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  let offset = 0;
  while (offset < body.length) {
    const partStart = body.indexOf(boundary, offset);
    if (partStart === -1) {
      break;
    }

    const headerStart = partStart + boundary.length + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) {
      break;
    }

    const headers = body.slice(headerStart, headerEnd).toString("utf8");
    const nameMatch = headers.match(/name="file"/i);
    const filenameMatch = headers.match(/filename="([^"]+)"/i);
    const nextBoundary = body.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) {
      break;
    }

    if (nameMatch) {
      const fileEnd = Math.max(headerEnd + 4, nextBoundary - 2);
      return {
        filename: filenameMatch?.[1] || "manual-upload.pdf",
        fileBytes: body.slice(headerEnd + 4, fileEnd)
      };
    }

    offset = nextBoundary;
  }

  return { filename: "manual-upload.pdf", fileBytes: body };
}

function fallbackPdf(filename) {
  const safeFilename = filename.replace(/[()\\]/g, "");
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 95 >>
stream
BT /F1 18 Tf 72 720 Td (Manual test preview) Tj 0 -30 Td (${safeFilename}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000387 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
457
%%EOF`,
    "utf8"
  );
}

function extractPdfText(fileBytes) {
  const tempPath = path.join(os.tmpdir(), `mychatpdf-manual-${randomUUID()}.pdf`);
  fs.writeFileSync(tempPath, fileBytes);

  const script = [
    "import json, sys",
    "import fitz",
    "doc = fitz.open(sys.argv[1])",
    "pages = []",
    "for index, page in enumerate(doc, start=1):",
    "    pages.append({'page': index, 'text': page.get_text('text')})",
    "print(json.dumps({'pageCount': doc.page_count, 'pages': pages}))",
  ].join("\n");

  try {
    const result = spawnSync(fs.existsSync(backendPython) ? backendPython : "python", ["-c", script, tempPath], {
      encoding: "utf8",
      timeout: 15000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return JSON.parse(result.stdout);
    }
  } catch {
    // Fall through to the no-text result.
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return { pageCount: 1, pages: [{ page: 1, text: "" }] };
}

function cleanText(value) {
  return String(value || "")
    .replace(/[•●▪]/g, "")
    .replace(/^\?+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

const GENERIC_LINES = new Set([
  "Field",
  "Value",
  "Date",
  "Plan",
  "Overview",
  "Course overview",
  "Weekly plan",
  "Assessment",
  "Important dates",
  "Release metadata",
  "Technical decisions",
  "Risks",
  "Trip overview",
  "Daily plan",
  "Important notes",
  "Budget",
  "Invoice summary",
  "Service scope",
  "Payment terms",
  "Risks and obligations",
  "Policy purpose",
  "Eligibility",
  "Security rules",
  "Exceptions and deadlines",
]);

const KNOWN_FIELD_LABELS = new Set([
  "Traveler",
  "Destination",
  "Trip dates",
  "Primary purpose",
  "Booking reference",
  "Hotels",
  "Transport",
  "Activities",
  "Food buffer",
  "Emergency reserve",
  "Vendor",
  "Customer",
  "Invoice number",
  "Invoice date",
  "Payment due date",
  "Total amount due",
  "Payment term",
  "Late payment fee",
  "Purchase order reference",
  "Product name",
  "Spec version",
  "Target release",
  "Primary user role",
  "Deployment target",
  "Program",
  "Instructor",
  "Duration",
  "Quizzes",
  "Assignments",
  "Final project",
  "Participation",
  "Late submission policy",
]);

const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "who",
  "how",
  "does",
  "did",
  "are",
  "is",
  "the",
  "this",
  "that",
  "from",
  "about",
  "with",
  "into",
  "your",
  "document",
  "tell",
  "give",
  "list",
  "should",
  "must",
  "and",
  "for",
  "before",
]);

function rawLinesFor(document) {
  return document.extractedPages.flatMap((page) =>
    page.text
      .split(/\r?\n/)
      .map((line) => ({ page: page.page, text: cleanText(line) }))
      .filter((line) => line.text && line.text !== "?")
  );
}

function looksLikeHeading(text) {
  if (GENERIC_LINES.has(text)) {
    return true;
  }
  if (text.includes(":")) {
    return false;
  }
  if (/[.!?]$/.test(text)) {
    return false;
  }
  const words = text.split(/\s+/);
  return words.length <= 5 && /^[A-Z0-9][A-Za-z0-9 _&/().,-]+$/.test(text);
}

function pageItemsFor(document) {
  const byPage = new Map();
  for (const line of rawLinesFor(document)) {
    const lines = byPage.get(line.page) || [];
    const previous = lines[lines.length - 1];
    const isContinuation = previous &&
      !/[.!?:]$/.test(previous.text) &&
      /^[a-z0-9(]/.test(line.text) &&
      !looksLikeHeading(line.text);

    if (isContinuation) {
      previous.text = `${previous.text} ${line.text}`;
    } else {
      lines.push({ ...line });
    }
    byPage.set(line.page, lines);
  }

  return [...byPage.values()].flat();
}

function linesFor(document) {
  return pageItemsFor(document).filter((line) => line.text.length > 2 && !GENERIC_LINES.has(line.text));
}

function titleFor(document) {
  const firstUsefulLine = rawLinesFor(document).find((line) => line.text.length > 6 && !GENERIC_LINES.has(line.text));
  return firstUsefulLine?.text || document.filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
}

function factsFor(document) {
  const lines = linesFor(document);
  const facts = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (looksLikeHeading(line.text) && !line.text.includes(":")) {
      const next = lines[index + 1];
      if (KNOWN_FIELD_LABELS.has(line.text) && next && !looksLikeHeading(next.text)) {
        facts.push({ page: line.page, text: `${line.text}: ${next.text}` });
        index += 1;
      }
      continue;
    }
    if (line.text.length < 8) {
      continue;
    }
    facts.push(line);
  }

  return facts.filter((fact, index, all) => all.findIndex((item) => item.text === fact.text) === index);
}

function queryWords(content) {
  return cleanText(content)
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function scoreFact(fact, words, prompt) {
  const text = fact.text.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (text.includes(word)) {
      score += word.length > 5 ? 3 : 2;
    }
  }

  const label = fact.text.split(":")[0].toLowerCase();
  if (prompt.includes(label)) {
    score += 8;
  }
  if (/\bwhen\b/.test(prompt) && /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|due|date|deadline)\b/i.test(fact.text)) {
    score += 4;
  }
  if (/\bwho\b/.test(prompt) && /\b(traveler|vendor|customer|instructor|owner|user|role|team)\b/i.test(fact.text)) {
    score += 4;
  }
  if (/\bhow\b/.test(prompt) && /\b(hour|hours|days|percent|inr|minutes|before|after)\b/i.test(fact.text)) {
    score += 3;
  }
  return score;
}

function notableItemsFor(document, limit = 5) {
  const facts = factsFor(document);
  const preferred = facts.filter((fact) =>
    /\b(must|should|deadline|due|target|owner|date|destination|purpose|provider|database|deployment|booking|traveler|version|release|role|api|pinecone|gemini|postgres|docker|kochi|munnar|kerala|invoice|payment|security|vpn|project|final|policy|risk|mitigation)\b/i.test(fact.text)
  );
  return [...preferred, ...facts]
    .filter((line, index, all) => all.findIndex((candidate) => candidate.text === line.text) === index)
    .slice(0, limit);
}

function relevantItemsFor(content, document, limit = 4) {
  const prompt = cleanText(content).toLowerCase();
  const words = queryWords(content);
  const facts = factsFor(document);

  const specialMatches = [];
  if (/\bgrading|weight|assessment|percent\b/.test(prompt)) {
    specialMatches.push(
      ...facts.filter((fact) =>
        /\bpercent\b/i.test(fact.text) &&
        /\b(quizzes|assignments|final project|participation|penalty)\b/i.test(fact.text)
      )
    );
  }
  if (/\bweek|weeks\b/.test(prompt)) {
    const topicWords = words.filter((word) => !["week", "weeks", "cover"].includes(word));
    const matchingWeeks = facts.filter((fact) =>
      /^Week\s+\d+:/i.test(fact.text) &&
      topicWords.some((word) => fact.text.toLowerCase().includes(word))
    );
    specialMatches.push(...(matchingWeeks.length ? matchingWeeks : facts.filter((fact) => /^Week\s+\d+:/i.test(fact.text))));
  }
  if (/\brisk|mitigation\b/.test(prompt)) {
    specialMatches.push(...facts.filter((fact) => /\brisk|mitigation|hallucinated|slow document processing|grounded prompts|status polling\b/i.test(fact.text)));
  }
  if (/\bbudget|amount|reserve|cost|inr\b/.test(prompt)) {
    const exactBudgetMatches = facts.filter((fact) =>
      (prompt.includes("reserve") && /\breserve\b/i.test(fact.text)) ||
      (prompt.includes("amount") && /\bamount\b/i.test(fact.text)) ||
      (prompt.includes("fee") && /\bfee\b/i.test(fact.text)) ||
      (prompt.includes("payment") && /\bpayment\b/i.test(fact.text))
    );
    specialMatches.push(...exactBudgetMatches);
    specialMatches.push(...facts.filter((fact) => /\binr|amount|hotels|transport|activities|food buffer|reserve|payment|fee\b/i.test(fact.text)));
  }
  if (/\bcarry|bring|pack|required documents|id proof\b/.test(prompt)) {
    specialMatches.push(...facts.filter((fact) => /\bcarry|rain jackets|id proof|printed id|hotel check-in|park entry\b/i.test(fact.text)));
  }

  const scored = facts
    .map((fact) => ({ ...fact, score: scoreFact(fact, words, prompt) }))
    .filter((fact) => fact.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page);

  return [...specialMatches, ...scored]
    .filter((fact, index, all) => all.findIndex((item) => item.text === fact.text) === index)
    .slice(0, limit);
}

function answerForPrompt(content, document) {
  const prompt = content.toLowerCase();
  const title = titleFor(document);
  const notableItems = notableItemsFor(document, 5);
  const source = notableItems[0] || factsFor(document)[0] || { page: 1, text: title };

  if (!document.extractedText.trim()) {
    return {
      text: `I could not extract readable text from ${document.filename}. This manual mode can preview the PDF, but summaries need extractable text.`,
      page: 1,
      excerpt: "No extractable text was found in the uploaded PDF.",
    };
  }

  if (prompt.includes("summarize")) {
    const sentences = factsFor(document).slice(0, 5);
    return {
      text: `Summary of ${title}:\n${sentences.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`,
      page: sentences[0]?.page || source.page,
      excerpt: sentences[0]?.text || source.text,
    };
  }

  if (prompt.includes("key takeaway")) {
    const takeaways = notableItems.slice(0, 4).map((item, index) => `${index + 1}. ${item.text}`);
    return {
      text: `Key takeaways from ${title}:\n${takeaways.join("\n")}`,
      page: notableItems[0]?.page || 1,
      excerpt: notableItems[0]?.text || title,
    };
  }

  if (prompt.includes("action item")) {
    const actionItems = factsFor(document)
      .filter((item) => /\b(must|should|deadline|due|owner|date|target|plan|visit|arrive|drive|check|verify|deploy|configure|store|use)\b/i.test(item.text))
      .slice(0, 4);
    const items = actionItems.length ? actionItems : notableItems.slice(0, 3);
    return {
      text: `Action items / next steps found in ${title}:\n${items.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`,
      page: items[0]?.page || 1,
      excerpt: items[0]?.text || title,
    };
  }

  if (prompt.includes("pay attention")) {
    const items = notableItems.slice(0, 4);
    return {
      text: `Pay attention to these details in ${title}:\n${items.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`,
      page: items[0]?.page || 1,
      excerpt: items[0]?.text || title,
    };
  }

  const matches = relevantItemsFor(content, document, 4);
  if (matches.length) {
    const answerText = matches.length === 1
      ? `The document says: ${matches[0].text}`
      : `The document says:\n${matches.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`;
    return {
      text: answerText,
      page: matches[0].page,
      excerpt: matches[0].text,
    };
  }

  const relevant = notableItemsFor(document, 1)[0] || { page: 1, text: title };
  return {
    text: `I could not find an exact answer for "${content}" in ${title}. Closest relevant detail: ${relevant.text}`,
    page: relevant.page,
    excerpt: relevant.text,
  };
}

function summaryFor(document) {
  return {
    id: document.id,
    original_filename: document.filename,
    status: document.ready ? "ready" : "uploaded",
    file_size_bytes: document.fileBytes.length,
    page_count: document.ready ? document.pageCount : null,
    chunk_count: document.ready ? Math.max(1, document.extractedPages.length) : null,
    created_at: document.createdAt,
    processed_at: document.ready ? document.processedAt : null,
    failure_message: null
  };
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function findDocument(id) {
  const document = documents.get(id);
  return document && !document.deleted ? document : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    return send(res, 204, "");
  }
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { status: "ok" });
  }
  if (req.method === "GET" && url.pathname === "/ready") {
    return send(res, 200, { status: "ready" });
  }
  if (req.method === "GET" && url.pathname === "/api/documents") {
    const items = [...documents.values()]
      .filter((document) => !document.deleted)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summaryFor);
    return send(res, 200, { items, next_cursor: null });
  }
  if (req.method === "POST" && url.pathname === "/api/documents") {
    const body = await readBody(req);
    const upload = parseMultipartUpload(req, body);
    const id = `manual-doc-${nextDocumentNumber++}`;
    const now = new Date().toISOString();
    const fileBytes = upload.fileBytes.includes(Buffer.from("%PDF")) ? upload.fileBytes : fallbackPdf(upload.filename);
    const extracted = extractPdfText(fileBytes);
    documents.set(id, {
      id,
      filename: upload.filename,
      fileBytes,
      pageCount: extracted.pageCount || 1,
      extractedPages: extracted.pages || [{ page: 1, text: "" }],
      extractedText: (extracted.pages || []).map((page) => page.text).join("\n"),
      createdAt: now,
      processedAt: null,
      ready: false,
      statusPolls: 0,
      messages: [],
      deleted: false
    });
    return send(res, 201, { id, status: "uploaded", processing_job_id: `manual-job-${id}` });
  }

  const documentMatch = url.pathname.match(/^\/api\/documents\/([^/]+)(?:\/(.+))?$/);
  if (documentMatch) {
    const document = findDocument(documentMatch[1]);
    const subPath = documentMatch[2] || "";
    if (!document) {
      return send(res, 404, { detail: "Document not found" });
    }

    if (req.method === "GET" && !subPath) {
      return send(res, 200, summaryFor(document));
    }
    if (req.method === "DELETE" && !subPath) {
      document.deleted = true;
      return send(res, 200, { status: "deleting" });
    }
    if (req.method === "GET" && subPath === "processing-status") {
      document.statusPolls += 1;
      document.ready = true;
      document.processedAt ||= new Date().toISOString();
      return send(res, 200, {
        document_id: document.id,
        status: "ready",
        current_step: "ready",
        failure_code: null,
        failure_message: null
      });
    }
    if (req.method === "GET" && subPath === "file-url") {
      return send(res, 200, {
        url: `http://${HOST}:${PORT}/mock/files/${document.id}.pdf`,
        expires_at: new Date(Date.now() + 900000).toISOString()
      });
    }
    if (req.method === "GET" && subPath === "chat") {
      return send(res, 200, {
        chat: { id: `manual-chat-${document.id}`, document_id: document.id, title: document.filename },
        messages: document.messages
      });
    }
    if (req.method === "POST" && subPath === "chat/stream") {
      const body = await readBody(req);
      let content = "Summarize this document.";
      try {
        content = JSON.parse(body.toString("utf8") || "{}").content || content;
      } catch {
        // Keep the default prompt.
      }

      const now = new Date().toISOString();
      const answer = answerForPrompt(content, document);
      const source = {
        source_id: randomUUID(),
        chunk_id: randomUUID(),
        page_start: answer.page,
        page_end: answer.page,
        excerpt: answer.excerpt,
        score: 0.92
      };
      document.messages.push(
        { id: randomUUID(), role: "user", content, created_at: now, sources: [] },
        { id: randomUUID(), role: "assistant", content: answer.text, created_at: now, sources: [source] }
      );

      return send(
        res,
        200,
        [
          sseEvent("message_start", { message_id: randomUUID() }),
          sseEvent("token", { text: answer.text }),
          sseEvent("sources", {
            items: [
              {
                chunk_id: source.chunk_id,
                page_start: source.page_start,
                page_end: source.page_end,
                excerpt: source.excerpt,
                score: source.score
              }
            ]
          }),
          sseEvent("message_done", { message_id: randomUUID() })
        ].join(""),
        "text/event-stream"
      );
    }
  }

  const fileMatch = url.pathname.match(/^\/mock\/files\/([^/]+)\.pdf$/);
  if (req.method === "GET" && fileMatch) {
    const document = findDocument(fileMatch[1]);
    if (!document) {
      return send(res, 404, "Document not found", "text/plain");
    }
    return send(res, 200, document.fileBytes, "application/pdf");
  }

  return send(res, 404, { detail: `No mock route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(`Manual mock API running at http://${HOST}:${PORT}`);
});
