// Generates the PDF fixture served to Playwright runs; public/e2e-fixture.pdf is gitignored.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function buildPdfFixture(pageCount) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  for (let index = 0; index < pageCount; index += 1) {
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>");
  }
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((content, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const fixture = buildPdfFixture(3);
for (const target of [join(publicDir, "e2e-fixture.pdf"), join(publicDir, "api", "documents", "doc-e2e-ready", "file")]) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, fixture);
  console.log(`wrote ${target}`);
}
