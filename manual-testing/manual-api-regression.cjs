const fs = require("fs");
const path = require("path");

const baseUrl = readRequiredUrl("MYCHATPDF_API_BASE_URL");
const sampleDir = path.join(__dirname, "sample-pdfs");

function readRequiredUrl(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} to the API origin before running this manual regression script.`);
  }
  return value.replace(/\/$/, "");
}

const testSets = [
  {
    file: "01_student_course_syllabus.pdf",
    questions: [
      ["Summarize this document.", ["Data Analytics", "Python"]],
      ["What is the final project about?", ["customer churn"]],
      ["What are the grading weights?", ["Quizzes", "Assignments", "Final project", "Participation"]],
      ["When is the project proposal due?", ["July 15, 2026"]],
      ["When is the final presentation?", ["August 12, 2026"]],
      ["What happens if an assignment is submitted late?", ["10 percent penalty"]],
      ["Which weeks cover SQL and dashboards?", ["Week 2", "SQL", "Week 4", "dashboards"]],
      ["Who is the instructor?", ["Dr. Nisha Rao"]],
      ["What are the office hour days and time?", ["Tuesday", "Thursday", "5:30 PM"]],
    ],
  },
  {
    file: "02_aurorachat_product_spec_rag.pdf",
    questions: [
      ["Summarize this document.", ["AuroraChat", "Knowledge Assistant"]],
      ["What is AuroraChat?", ["Knowledge Assistant"]],
      ["What vector database is selected for production?", ["Pinecone"]],
      ["What is the target release date?", ["July 15, 2026"]],
      ["What authentication method is used?", ["Clerk JWTs"]],
      ["What must the answer service include?", ["citations", "page numbers"]],
      ["What are the main risks?", ["Risk", "hallucinated"]],
      ["How is hallucination risk mitigated?", ["grounded prompts", "citations"]],
      ["What is the deployment target?", ["Docker Compose", "PostgreSQL"]],
    ],
  },
  {
    file: "03_kerala_travel_itinerary.pdf",
    questions: [
      ["Summarize this document.", ["Kerala", "Aarav Sharma"]],
      ["Who is the traveler?", ["Aarav Sharma"]],
      ["What are the trip dates?", ["August 4, 2026", "August 9, 2026"]],
      ["What is planned on August 6, 2026?", ["Cheeyappara waterfalls"]],
      ["When is the return flight?", ["6:40 PM"]],
      ["What should the traveler carry?", ["rain jackets", "ID proof"]],
      ["What is the booking reference?", ["KLR-TRIP-4926"]],
      ["What is the estimated road travel time from Kochi to Munnar?", ["4.5 hours"]],
      ["What is the total emergency reserve?", ["INR 10,000"]],
    ],
  },
  {
    file: "04_vendor_invoice_contract.pdf",
    questions: [
      ["Summarize this document.", ["Nimbus Data Services", "Orion Retail Labs"]],
      ["Who is the vendor?", ["Nimbus Data Services"]],
      ["What is the invoice number?", ["NDS-INV-2026-0817"]],
      ["What is the total amount due?", ["INR 8,72,450"]],
      ["What is the payment due date?", ["July 30, 2026"]],
      ["What is the late payment fee?", ["1.5 percent"]],
      ["What must the vendor do for critical incidents?", ["2 hours", "critical data pipeline incident"]],
      ["What must Orion provide before July 5, 2026?", ["VPN access", "runbook"]],
      ["What is the termination notice period?", ["30 days written notice"]],
      ["What data security restriction is mentioned?", ["Confidential data", "approved analytics workspace"]],
    ],
  },
  {
    file: "05_hr_remote_work_policy.pdf",
    questions: [
      ["Summarize this document.", ["remote work", "People Operations"]],
      ["Who owns the policy?", ["People Operations"]],
      ["Who is eligible for remote work?", ["60 days of tenure"]],
      ["What must managers consider before approval?", ["role requirements", "performance", "security constraints"]],
      ["What is mandatory for production systems?", ["VPN"]],
      ["How quickly must lost devices be reported?", ["1 hour"]],
      ["How far in advance is international remote work approval required?", ["14 days before travel"]],
      ["When is annual security training due?", ["September 30, 2026"]],
      ["When do exceptions expire?", ["90 days"]],
      ["When is the next policy review?", ["October 15, 2026"]],
    ],
  },
  {
    file: "06_blank_scanned_like_pdf.pdf",
    questions: [
      ["Summarize this document.", ["could not extract readable text"]],
      ["Does this document contain extractable text?", ["could not extract readable text"]],
    ],
  },
];

async function upload(file) {
  const filePath = path.join(sampleDir, file);
  const form = new FormData();
  form.set("file", new Blob([fs.readFileSync(filePath)], { type: "application/pdf" }), file);
  const response = await fetch(`${baseUrl}/api/documents`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Upload failed for ${file}: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  await fetch(`${baseUrl}/api/documents/${body.id}/processing-status`);
  return body.id;
}

async function ask(documentId, question) {
  const response = await fetch(`${baseUrl}/api/documents/${documentId}/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: question }),
  });
  if (!response.ok) {
    throw new Error(`Question failed: ${response.status} ${await response.text()}`);
  }
  const streamText = await response.text();
  const tokenMatches = [...streamText.matchAll(/^event: token\ndata: (.+)$/gm)];
  return tokenMatches.map((match) => JSON.parse(match[1]).text || "").join("");
}

function assertContains(answer, expected, file, question) {
  const normalized = answer.toLowerCase();
  const missing = expected.filter((keyword) => !normalized.includes(keyword.toLowerCase()));
  if (missing.length) {
    throw new Error(
      [
        `Missing expected keyword(s) for ${file}`,
        `Question: ${question}`,
        `Missing: ${missing.join(", ")}`,
        `Answer: ${answer}`,
      ].join("\n")
    );
  }
}

async function main() {
  const results = [];
  for (const testSet of testSets) {
    const documentId = await upload(testSet.file);
    for (const [question, expected] of testSet.questions) {
      const answer = await ask(documentId, question);
      assertContains(answer, expected, testSet.file, question);
      results.push({ file: testSet.file, question, answer });
    }
  }

  for (const result of results) {
    console.log(`PASS | ${result.file} | ${result.question}`);
  }
  console.log(`\n${results.length} manual API regression checks passed.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
