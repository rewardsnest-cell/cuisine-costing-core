// Client-side document text extraction for CQH uploads.
// Reuses the existing patterns: mammoth for .docx, xlsx for spreadsheets, raw text otherwise.
// PDFs: caller should pass already-OCR'd text or skip extraction (the AI will operate on
// dish-name lines if any are present).

import * as XLSX from "xlsx";

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value || "";
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv") || name.endsWith(".tsv")) {
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`# ${sheetName}\n${csv}`);
    }
    return parts.join("\n\n");
  }

  if (name.endsWith(".pdf")) {
    // Best-effort: try to read as text. For binary PDFs the AI will see whatever
    // is salvageable. The user can re-upload an exported text version if needed.
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const raw = decoder.decode(buf);
    // Strip non-printables.
    return raw.replace(/[^\x20-\x7E\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Plain text / markdown / rtf fallback.
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export function fileTypeLabel(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".doc")) return "doc";
  if (n.endsWith(".xlsx")) return "xlsx";
  if (n.endsWith(".xls")) return "xls";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".tsv")) return "tsv";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".txt")) return "txt";
  if (n.endsWith(".md")) return "md";
  if (n.endsWith(".rtf")) return "rtf";
  return file.type || "file";
}
