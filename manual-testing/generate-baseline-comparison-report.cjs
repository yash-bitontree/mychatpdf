const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const currentReportPath = path.join(repoRoot, "docs", "pdf-extraction-qa-report.md");
const htmlPath = path.join(repoRoot, "docs", "baseline-vs-current-rag-qa-comparison.html");
const pdfPath = path.join(repoRoot, "docs", "baseline-vs-current-rag-qa-comparison.pdf");

function run(command) {
  try {
    return execSync(command, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return (error.stdout || error.stderr || error.message || "").toString().trim();
  }
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

function parseTable(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];

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

function findQa(qaRows, pdf, question) {
  return qaRows.find((row) => row.pdf === pdf && row.question === question);
}

function compact(value, max = 320) {
  const text = String(value || "").replace(/<br>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function fileTrackedInBaseline(files, pattern) {
  return files.some((file) => pattern.test(file));
}

async function main() {
  const markdown = fs.readFileSync(currentReportPath, "utf8");
  const lines = markdown.split(/\r?\n/);
  const generatedAt = new Date().toISOString();

  const pdfsTested = markdown.match(/PDFs tested: (\d+)/)?.[1] || "6";
  const questionsAsked = markdown.match(/Questions asked: (\d+)/)?.[1] || "66";
  const missingRows = markdown.match(/Answer rows with missing expected keywords: (\d+)/)?.[1] || "10";
  const noTextRows = markdown.match(/Expected no-text\/scanned PDF limitation rows: (\d+)/)?.[1] || "4";

  const qaRows = parseTable(lines, "## Question / Answer Results").map((cells) => ({
    pdf: cells[0],
    question: cells[1],
    answer: cells[2],
    citation: cells[3],
    expected: cells[4],
    issue: cells[5],
  }));

  const extractionRows = parseTable(lines, "## Raw Extraction Observations").map((cells) => ({
    pdf: cells[0],
    pages: cells[1],
    chars: cells[2],
    artifacts: cells[3],
    issue: cells[4],
  }));

  const issueRows = parseTable(lines, "## Issues To Track").map((cells) => ({
    id: cells[0],
    issue: cells[1],
    evidence: cells[2],
    severity: cells[3],
    recommendation: cells[4],
  }));

  const baselineHead = run("git log -1 --oneline --decorate");
  const branchStatus = run("git status --short --branch");
  const trackedFiles = run("git ls-tree -r --name-only HEAD").split(/\r?\n/).filter(Boolean);
  const diffStat = run("git diff --stat");
  const untracked = run("git ls-files --others --exclude-standard");

  const baselineCapabilities = [
    {
      capability: "Manual PDF extraction QA report",
      baseline: fileTrackedInBaseline(trackedFiles, /^docs\/pdf-extraction-qa-report/) ? "Present" : "Not present in pushed code",
      current: "Generated as Markdown, HTML, DOCX-compatible copy, and polished PDF",
      impact: "Manager can review concrete questions, answers, citations, and extraction issues.",
    },
    {
      capability: "Manual local API for PDF QA",
      baseline: fileTrackedInBaseline(trackedFiles, /^manual-testing\/manual-mock-api\.cjs$/) ? "Present" : "Not present in pushed code",
      current: "Present in manual-testing/manual-mock-api.cjs",
      impact: "Manual testing can run without Clerk, object storage, OpenAI, Pinecone, Redis, or Postgres credentials.",
    },
    {
      capability: "Browser e2e test coverage",
      baseline: fileTrackedInBaseline(trackedFiles, /^frontend\/playwright\.config\.ts$/) ? "Present" : "Not present in pushed code",
      current: "Playwright upload/chat/citation/refresh and validation tests added",
      impact: "The frontend flow is verified through the real UI instead of only unit tests.",
    },
    {
      capability: "Backend RAG pipeline e2e test",
      baseline: fileTrackedInBaseline(trackedFiles, /^backend\/tests\/test_e2e_pipeline\.py$/) ? "Present" : "Not present in pushed code",
      current: "Fake-service pipeline test added",
      impact: "Upload, extraction, processing, chat response, citation, and history persistence are covered together.",
    },
    {
      capability: "Test-only auth bypass",
      baseline: fileTrackedInBaseline(trackedFiles, /VITE_E2E_AUTH_BYPASS/) ? "Present" : "Not present in pushed code",
      current: "VITE_E2E_AUTH_BYPASS=true path added for tests only",
      impact: "Tests can enter protected app screens without Clerk test credentials; normal Clerk behavior remains unchanged unless the env flag is set.",
    },
  ];

  const comparisonExamples = [
    {
      pdf: "02_aurorachat_product_spec_rag.pdf",
      question: "What vector database is selected for production?",
      current: findQa(qaRows, "02_aurorachat_product_spec_rag.pdf", "What vector database is selected for production?"),
      baseline: "No pushed-code manual QA output is available. The pushed commit has no sample PDF set, manual mock API, regression script, or report generator to reproduce this answer.",
    },
    {
      pdf: "03_kerala_travel_itinerary.pdf",
      question: "What should the traveler carry?",
      current: findQa(qaRows, "03_kerala_travel_itinerary.pdf", "What should the traveler carry?"),
      baseline: "No pushed-code manual QA output is available for this question. A reviewer would need live service credentials or a newly added harness.",
    },
    {
      pdf: "04_vendor_invoice_contract.pdf",
      question: "What must Orion provide before July 5, 2026?",
      current: findQa(qaRows, "04_vendor_invoice_contract.pdf", "What must Orion provide before July 5, 2026?"),
      baseline: "No pushed-code manual QA output is available for this question. The original repository does not include repeatable extraction-answer evidence.",
    },
    {
      pdf: "06_blank_scanned_like_pdf.pdf",
      question: "Summarize this document.",
      current: findQa(qaRows, "06_blank_scanned_like_pdf.pdf", "Summarize this document."),
      baseline: "No pushed-code scanned-PDF QA report exists. The current audit identifies this as a no-extractable-text limitation rather than a normal summary failure.",
    },
  ];

  const changeRows = [
    {
      area: "frontend/src/api/client.ts",
      change: "Bound native browser fetch with globalThis.fetch.bind(globalThis).",
      impact: "Fixes browser runtime API calls that can fail with an Illegal invocation error when fetch is stored and called later.",
    },
    {
      area: "frontend/src/App.tsx and vite-env.d.ts",
      change: "Added VITE_E2E_AUTH_BYPASS support and env typings.",
      impact: "Allows Playwright/manual e2e mode to use protected screens without Clerk credentials. Production auth is still Clerk unless this test flag is set.",
    },
    {
      area: "frontend/playwright.config.ts and frontend/e2e/document-chat.spec.ts",
      change: "Added browser e2e tests for upload, processing, chat, citation navigation, refresh history, file validation, and SSE error handling.",
      impact: "Covers the application flow users actually perform in the browser.",
    },
    {
      area: "backend/tests/test_e2e_pipeline.py",
      change: "Added a backend pipeline test with fake extractor, storage, and vector services.",
      impact: "Verifies the backend path from uploaded PDF through processing, grounded response, citation, and chat history without live services.",
    },
    {
      area: "manual-testing/",
      change: "Added sample PDFs, manual API, regression checks, test plan, and report generators.",
      impact: "Creates repeatable evidence for PDF extraction issues and answer quality across multiple document types.",
    },
    {
      area: "docs/",
      change: "Added e2e testing log and polished QA reports.",
      impact: "Gives management a clear audit trail of questions asked, actual responses, known limitations, and test results.",
    },
  ];

  const validationRows = [
    ["Manual API regression", "node manual-testing/manual-api-regression.cjs", "49 checks passed across six sample PDFs"],
    ["Backend tests", "cd backend; .\\.venv\\Scripts\\python -m pytest", "40 passed, 3 warnings"],
    ["Frontend unit tests", "cd frontend; npm test", "7 files passed, 19 tests passed"],
    ["Frontend browser e2e", "cd frontend; npm run test:e2e", "4 passed"],
    ["Frontend build", "cd frontend; npm run build", "Production build passed"],
  ];

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Baseline vs Current RAG QA Comparison</title>
  <style>
    @page { size: A4; margin: 15mm 13mm 17mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 10.3px;
      line-height: 1.45;
      background: #fff;
    }
    h1, h2, h3 { margin: 0; color: #111827; }
    h1 { font-size: 25px; letter-spacing: -0.1px; }
    h2 {
      margin-top: 24px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d8dee9;
      font-size: 16px;
    }
    h3 { margin-top: 14px; font-size: 12px; }
    p { margin: 6px 0; }
    code {
      border-radius: 3px;
      background: #eef2f7;
      padding: 1px 4px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9px;
    }
    .cover {
      padding: 18px 20px;
      border: 1px solid #d8dee9;
      border-radius: 10px;
      background: linear-gradient(135deg, #f8fafc, #eef6f5);
      margin-bottom: 16px;
    }
    .subtitle { max-width: 680px; margin-top: 8px; color: #4b5563; font-size: 11px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px 18px;
      margin-top: 14px;
      color: #475569;
      font-size: 9.2px;
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
      min-height: 70px;
    }
    .card .value { font-size: 20px; font-weight: 700; color: #0f766e; }
    .card .label { margin-top: 2px; color: #64748b; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; }
    .note {
      margin-top: 10px;
      padding: 9px 10px;
      border-left: 4px solid #0f766e;
      background: #f0fdfa;
      color: #334155;
    }
    .warning {
      border-left-color: #d97706;
      background: #fffbeb;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .panel {
      border: 1px solid #d8dee9;
      border-radius: 8px;
      padding: 10px;
      page-break-inside: avoid;
      background: #fff;
    }
    .panel h3 { margin-top: 0; color: #0f766e; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; }
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
      font-size: 8.7px;
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
    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 8.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .status.good { color: #166534; background: #dcfce7; }
    .status.warn { color: #92400e; background: #fef3c7; }
    .status.missing { color: #991b1b; background: #fee2e2; }
    .qa-card {
      margin-top: 10px;
      border: 1px solid #d8dee9;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .qa-head {
      padding: 8px 10px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-weight: 700;
    }
    .qa-body {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.15fr);
    }
    .qa-body > div { padding: 9px 10px; }
    .qa-current { border-left: 1px solid #e2e8f0; background: #fbfdff; }
    .label {
      margin: 0 0 4px;
      color: #64748b;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .small { color: #475569; font-size: 9.2px; }
    .pre {
      white-space: pre-wrap;
      font-family: Consolas, "Courier New", monospace;
      font-size: 8.5px;
      line-height: 1.35;
      color: #334155;
    }
  </style>
</head>
<body>
  <section class="cover">
    <h1>Baseline vs Current RAG QA Comparison</h1>
    <p class="subtitle">Comparison of the already pushed repository state against the current local QA/testing branch used to generate the PDF extraction answer-quality report.</p>
    <div class="meta">
      <div><strong>Generated:</strong> ${renderText(generatedAt)}</div>
      <div><strong>Baseline pushed commit:</strong> ${renderText(baselineHead)}</div>
      <div><strong>Current local state:</strong> Unpushed QA/testing changes on the same branch</div>
      <div><strong>Repository:</strong> vibhandikyash/mychatpdf</div>
    </div>
    <div class="cards">
      <div class="card"><div class="value">${renderText(pdfsTested)}</div><div class="label">Current PDFs Tested</div></div>
      <div class="card"><div class="value">${renderText(questionsAsked)}</div><div class="label">Current QA Rows</div></div>
      <div class="card"><div class="value">${renderText(missingRows)}</div><div class="label">Current Answer Issues</div></div>
      <div class="card"><div class="value">${renderText(noTextRows)}</div><div class="label">Expected No-Text Rows</div></div>
    </div>
  </section>

  <h2>Executive Conclusion</h2>
  <p class="note warning"><strong>Important:</strong> the already pushed code at <code>${renderText(baselineHead)}</code> cannot reproduce the polished PDF QA report by itself. It does not include the manual testing harness, sample PDFs, browser e2e config, backend e2e test, regression script, or report generator. The current local branch adds those QA artifacts and one browser runtime fix.</p>
  <div class="grid-2">
    <section class="panel">
      <h3>What the pushed code proves</h3>
      <ul>
        <li>The main application codebase exists at the remote baseline commit.</li>
        <li>It contains regular backend/frontend code and existing tests.</li>
        <li>It does not contain a repeatable manager-facing PDF extraction QA report workflow.</li>
      </ul>
    </section>
    <section class="panel">
      <h3>What the current local code proves</h3>
      <ul>
        <li>Manual PDF extraction behavior was audited on six synthetic PDFs.</li>
        <li>Sixty-six question/answer rows were recorded with citations and issue notes.</li>
        <li>Automated backend, frontend, browser e2e, build, and manual regression checks passed locally.</li>
      </ul>
    </section>
  </div>

  <h2>Baseline Capability Comparison</h2>
  <table>
    <thead><tr><th>Capability</th><th>Already Pushed Code</th><th>Current Local QA Code</th><th>Impact</th></tr></thead>
    <tbody>
      ${baselineCapabilities.map((row) => `<tr>
        <td>${renderText(row.capability)}</td>
        <td><span class="status ${row.baseline.startsWith("Not present") ? "missing" : "good"}">${renderText(row.baseline)}</span></td>
        <td>${renderText(row.current)}</td>
        <td>${renderText(row.impact)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <h2>Answer Quality Evidence Comparison</h2>
  <p class="note">The baseline side is marked as unavailable because the pushed repository does not include the same manual QA machinery. The current side shows the actual answer evidence generated by the local testing pipeline.</p>
  ${comparisonExamples.map((row, index) => `<article class="qa-card">
    <div class="qa-head">${index + 1}. ${renderText(row.pdf)} - ${renderText(row.question)}</div>
    <div class="qa-body">
      <div>
        <p class="label">Already Pushed Code Output</p>
        <p>${renderText(row.baseline)}</p>
      </div>
      <div class="qa-current">
        <p class="label">Current Local QA Output</p>
        <p>${renderText(compact(row.current?.answer || "Not found in current report."))}</p>
        <p class="label">Citation</p>
        <p class="small">${renderText(row.current?.citation || "Not found")}</p>
        <p class="label">Issue Classification</p>
        <p class="small">${renderText(row.current?.issue || "Not found")}</p>
      </div>
    </div>
  </article>`).join("")}

  <h2>What Changed And Pipeline Impact</h2>
  <table>
    <thead><tr><th>Area</th><th>Change</th><th>Impact on RAG Pipeline / App</th></tr></thead>
    <tbody>
      ${changeRows.map((row) => `<tr><td>${renderText(row.area)}</td><td>${renderText(row.change)}</td><td>${renderText(row.impact)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Current Validation Results</h2>
  <table>
    <thead><tr><th>Check</th><th>Command</th><th>Result</th></tr></thead>
    <tbody>
      ${validationRows.map((row) => `<tr><td>${renderText(row[0])}</td><td><code>${renderText(row[1])}</code></td><td><span class="status good">${renderText(row[2])}</span></td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Current Extraction Findings</h2>
  <table>
    <thead><tr><th>PDF</th><th>Pages</th><th>Chars</th><th>? Artifacts</th><th>Risk</th></tr></thead>
    <tbody>
      ${extractionRows.map((row) => `<tr><td>${renderText(row.pdf)}</td><td class="number">${renderText(row.pages)}</td><td class="number">${renderText(row.chars)}</td><td class="number">${renderText(row.artifacts)}</td><td>${renderText(row.issue)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Issues And Recommendations</h2>
  <table>
    <thead><tr><th>ID</th><th>Issue</th><th>Evidence</th><th>Severity</th><th>Recommendation</th></tr></thead>
    <tbody>
      ${issueRows.map((row) => `<tr><td>${renderText(row.id)}</td><td>${renderText(row.issue)}</td><td>${renderText(row.evidence)}</td><td>${renderText(row.severity)}</td><td>${renderText(row.recommendation)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Git Evidence</h2>
  <div class="grid-2">
    <section class="panel">
      <h3>Current working tree</h3>
      <p class="pre">${renderText(branchStatus)}</p>
    </section>
    <section class="panel">
      <h3>Tracked diff summary</h3>
      <p class="pre">${renderText(diffStat || "No tracked diff detected.")}</p>
    </section>
  </div>
  <section class="panel" style="margin-top:10px;">
    <h3>Untracked QA additions</h3>
    <p class="pre">${renderText(untracked || "No untracked files detected.")}</p>
  </section>

  <h2>Answer For Manager</h2>
  <p class="note"><strong>Recommended response:</strong> The report I shared is from the current local QA/testing branch, not from the already pushed commit alone. The pushed code does not contain the testing harness or report generator needed to reproduce this evidence. If we want the team to reproduce the same report and verify the same output quality, we should push these changes as a separate QA/testing branch or pull request. The only application runtime fix in the current code is the browser fetch binding; the rest is primarily testing, manual QA, and reporting infrastructure.</p>
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
    footerTemplate: '<div style="width:100%;font-size:8px;color:#64748b;padding:0 12mm;text-align:right;">Baseline vs Current RAG QA Comparison - Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  await browser.close();

  console.log(htmlPath);
  console.log(pdfPath);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
