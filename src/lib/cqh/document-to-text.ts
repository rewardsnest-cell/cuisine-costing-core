// Extract plain text from a wide range of document types directly in the
// browser. Used by the Competitor Quote Hub to feed AI dish extraction +
// shopping list generation. PDFs are extracted via pdfjs.

async function docxToText(file: File): Promise<string> {
  // @ts-expect-error - browser bundle has no types
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await (mammoth as any).extractRawText({ arrayBuffer });
  return String(value || "");
}

async function xlsxToText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    parts.push(`=== Sheet: ${name} ===`);
    parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
    parts.push("");
  }
  return parts.join("\n");
}

async function pdfToText(file: File): Promise<string> {
  // Reuse the same pdfjs-dist entry + CDN worker setup as pdf-to-images.ts to
  // avoid bundler issues with the legacy build path.
  const pdfjs: any = await import("pdfjs-dist");
  const version: string = pdfjs.version || "4.7.76";
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it: any) => it.str).join(" "));
  }
  return out.join("\n\n");
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return pdfToText(file);
  }
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    return docxToText(file);
  }
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheetml") ||
    file.type === "application/vnd.ms-excel"
  ) {
    return xlsxToText(file);
  }
  if (
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".rtf") ||
    file.type === "text/plain" ||
    file.type === "text/csv"
  ) {
    return file.text();
  }
  if (name.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc files aren't supported — please save as .docx and try again.",
    );
  }
  throw new Error(`Unsupported document type: ${file.name}`);
}

export const SUPPORTED_DOC_ACCEPT =
  ".pdf,.docx,.xlsx,.xls,.csv,.tsv,.txt,.md,.rtf";
