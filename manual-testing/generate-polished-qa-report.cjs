const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const inputPath = path.join(repoRoot, "docs", "pdf-extraction-qa-report.md");
const htmlPath = path.join(repoRoot, "docs", "pdf-extraction-qa-report-polished.html");
const pdfPath = path.join(repoRoot, "docs", "pdf-extraction-qa-report-polished.pdf");
const appUrl = process.env.MYCHATPDF_APP_URL ?? "configured deployment URL";

function splitMarkdownRow(line) {
  const cells = [];
  let current = "";
  let escaped = false;
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderText(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/&lt;br&gt;/g, "<br>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function parseTable(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return [];
  }
  const tableLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (tableLines.length) break;
      continue;
    }
    if (line.startsWith("|")) {
      tableLines.push(line);
      continue;
    }
    if (tableLines.length) break;
  }
  return tableLines.filter((line) => !/^\|\s*---/.test(line)).slice(1).map(splitMarkdownRow);
}

function issueKind(issue) {
  if (issue.startsWith("No answer issue")) return "pass";
  if (issue.startsWith("Expected extraction limitation")) return "warn";
  return "fail";
}

async function main() {
  const markdown = fs.readFileSync(inputPath, "utf8");
  const lines = markdown.split(/\r?\n/);

  const pdfsTested = markdown.match(/PDFs tested: (\d+)/)?.[1] || "6";
  const questionsAsked = markdown.match(/Questions asked: (\d+)/)?.[1] || "66";
  const missingRows = markdown.match(/Answer rows with missing expected keywords: (\d+)/)?.[1] || "0";
  const noTextRows = markdown.match(/Expected no-text\/scanned PDF limitation rows: (\d+)/)?.[1] || "0";

  const extractionRows = parseTable(lines, "## Raw Extraction Observations").map((cells) => ({
    pdf: cells[0],
    pages: cells[1],
    chars: cells[2],
    artifacts: cells[3],
    issue: cells[4],
  }));

  const qaRows = parseTable(lines, "## Question / Answer Results").map((cells) => ({
    pdf: cells[0],
    question: cells[1],
    answer: cells[2],
    citation: cells[3],
    expected: cells[4],
    issue: cells[5],
  }));

  const issueRows = parseTable(lines, "## Issues To Track").map((cells) => ({
    id: cells[0],
    issue: cells[1],
    evidence: cells[2],
    severity: cells[3],
    recommendation: cells[4],
  }));

  const groupedQa = new Map();
  for (const row of qaRows) {
    if (!groupedQa.has(row.pdf)) groupedQa.set(row.pdf, []);
    groupedQa.get(row.pdf).push(row);
  }

  const generated = markdown.match(/Generated: ([^\n]+)/)?.[1] || new Date().toISOString();

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>PDF Extraction QA Report</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.45;
      background: #ffffff;
    }
    h1, h2, h3 { margin: 0; color: #111827; }
    h1 { font-size: 25px; letter-spacing: -0.2px; }
    h2 {
      margin-top: 26px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d8dee9;
      font-size: 16px;
    }
    h3 { margin-top: 18px; font-size: 13px; }
    p { margin: 6px 0; }
    code {
      border-radius: 3px;
      background: #eef2f7;
      padding: 1px 4px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9.5px;
    }
    .cover {
      padding: 18px 20px;
      border: 1px solid #d8dee9;
      border-radius: 10px;
      background: linear-gradient(135deg, #f8fafc, #eef6f5);
      margin-bottom: 18px;
    }
    .subtitle {
      max-width: 650px;
      margin-top: 8px;
      color: #4b5563;
      font-size: 11px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px 18px;
      margin-top: 16px;
      color: #475569;
      font-size: 9.5px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .card {
      padding: 10px;
      border: 1px solid #d8dee9;
      border-radius: 8px;
      background: #fff;
    }
    .card .value { font-size: 20px; font-weight: 700; color: #0f766e; }
    .card .label { margin-top: 2px; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
    .finding-list {
      margin: 12px 0 0;
      padding-left: 18px;
    }
    .finding-list li { margin: 5px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th {
      padding: 7px 8px;
      background: #1f2937;
      color: white;
      font-size: 9px;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td {
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .number { text-align: right; white-space: nowrap; }
    .issue-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .issue-card {
      border: 1px solid #d8dee9;
      border-radius: 8px;
      padding: 10px;
      page-break-inside: avoid;
      background: #ffffff;
    }
    .issue-card h3 { margin-top: 0; color: #0f766e; }
    .severity {
      display: inline-block;
      margin-left: 6px;
      padding: 2px 6px;
      border-radius: 999px;
      background: #fef3c7;
      color: #92400e;
      font-size: 8.5px;
      font-weight: 700;
    }
    .pdf-section {
      page-break-before: always;
    }
    .qa-card {
      margin-top: 10px;
      border: 1px solid #d8dee9;
      border-radius: 9px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .qa-head {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 8px 10px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .question {
      font-weight: 700;
      font-size: 10.5px;
      color: #111827;
    }
    .badge {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 8.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge.pass { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .qa-body {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.85fr);
      gap: 0;
    }
    .answer, .details { padding: 9px 10px; }
    .details {
      border-left: 1px solid #e2e8f0;
      background: #fbfdff;
    }
    .label {
      margin: 0 0 3px;
      color: #64748b;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .answer-text { margin-bottom: 8px; }
    .small { color: #475569; font-size: 9.3px; }
    .issue-text.fail { color: #991b1b; }
    .issue-text.warn { color: #92400e; }
    .issue-text.pass { color: #166534; }
    .note {
      margin-top: 10px;
      padding: 9px 10px;
      border-left: 4px solid #0f766e;
      background: #f0fdfa;
      color: #334155;
    }
  </style>
</head>
<body>
  <section class="cover">
    <h1>PDF Extraction QA Report</h1>
    <p class="subtitle">Manager-ready audit of PDF extraction behavior and question/answer responses from the local manual testing pipeline.</p>
    <div class="meta">
      <div><strong>Generated:</strong> ${renderText(generated)}</div>
      <div><strong>Source:</strong> Local manual QA run</div>
      <div><strong>App:</strong> <code>${renderText(appUrl)}</code></div>
      <div><strong>PDF folder:</strong> <code>manual-testing/sample-pdfs</code></div>
    </div>
    <div class="cards">
      <div class="card"><div class="value">${pdfsTested}</div><div class="label">PDFs Tested</div></div>
      <div class="card"><div class="value">${questionsAsked}</div><div class="label">Questions Asked</div></div>
      <div class="card"><div class="value">${missingRows}</div><div class="label">Answer Issues</div></div>
      <div class="card"><div class="value">${noTextRows}</div><div class="label">No-Text Rows</div></div>
    </div>
  </section>

  <h2>Executive Findings</h2>
  <ul class="finding-list">
    <li>Text PDFs are extractable, but bullet glyphs appear as <code>?</code> artifacts in raw extraction.</li>
    <li>Wrapped lines can split one fact across multiple extracted lines, which can affect retrieval quality.</li>
    <li>The scanned/image-only PDF has zero extractable text and needs OCR or a graceful failure state.</li>
    <li>Some broad suggested prompts miss important details even when targeted custom questions work.</li>
  </ul>

  <h2>Raw Extraction Observations</h2>
  <table>
    <thead><tr><th>PDF</th><th>Pages</th><th>Chars</th><th>? Artifacts</th><th>Extraction Issue / Risk</th></tr></thead>
    <tbody>
      ${extractionRows.map((row) => `<tr><td>${renderText(row.pdf)}</td><td class="number">${renderText(row.pages)}</td><td class="number">${renderText(row.chars)}</td><td class="number">${renderText(row.artifacts)}</td><td>${renderText(row.issue)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Issues To Track</h2>
  <div class="issue-grid">
    ${issueRows.map((row) => `<article class="issue-card">
      <h3>${renderText(row.id)} <span class="severity">${renderText(row.severity)}</span></h3>
      <p><strong>Issue:</strong> ${renderText(row.issue)}</p>
      <p><strong>Evidence:</strong> ${renderText(row.evidence)}</p>
      <p><strong>Recommendation:</strong> ${renderText(row.recommendation)}</p>
    </article>`).join("")}
  </div>

  ${[...groupedQa.entries()].map(([pdf, rows]) => `<section class="pdf-section">
    <h2>${renderText(pdf)}</h2>
    <p class="note">Questions, actual responses, citations, expected keywords, and issue classification for this PDF.</p>
    ${rows.map((row, index) => {
      const kind = issueKind(row.issue);
      const label = kind === "pass" ? "OK" : kind === "warn" ? "Expected Limitation" : "Issue";
      return `<article class="qa-card">
        <div class="qa-head">
          <div class="question">${index + 1}. ${renderText(row.question)}</div>
          <div class="badge ${kind}">${label}</div>
        </div>
        <div class="qa-body">
          <div class="answer">
            <p class="label">Actual Answer</p>
            <div class="answer-text">${renderText(row.answer)}</div>
          </div>
          <div class="details">
            <p class="label">Expected Keywords</p>
            <p class="small">${renderText(row.expected)}</p>
            <p class="label">Citation</p>
            <p class="small">${renderText(row.citation)}</p>
            <p class="label">Issue With Answer</p>
            <p class="small issue-text ${kind}">${renderText(row.issue)}</p>
          </div>
        </div>
      </article>`;
    }).join("")}
  </section>`).join("")}
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, "utf8");

  const { chromium } = require(path.join(repoRoot, "frontend", "node_modules", "playwright"));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "load" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    headerTemplate: "<div></div>",
    footerTemplate: '<div style="width:100%;font-size:8px;color:#64748b;padding:0 12mm;text-align:right;">PDF Extraction QA Report · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  await browser.close();

  console.log(htmlPath);
  console.log(pdfPath);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
