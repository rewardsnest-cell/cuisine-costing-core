// Convert non-image, non-PDF documents (Word, Excel, CSV, plain text) into
// JPEG image blobs by extracting their text and rendering it onto a canvas.
// This lets our image-based analyzer pipeline ingest any document type.

const PAGE_WIDTH = 1240; // ~8.5in @ ~146dpi
const PAGE_HEIGHT = 1600; // ~11in
const PADDING = 60;
const FONT_SIZE = 18;
const LINE_HEIGHT = 26;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - PADDING * 2) / LINE_HEIGHT);

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // Word longer than maxWidth — hard break
      if (ctx.measureText(w).width > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (ctx.measureText(chunk + ch).width > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderPage(lines: string[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.fillStyle = "#000000";
  ctx.font = `${FONT_SIZE}px sans-serif`;
  ctx.textBaseline = "top";
  let y = PADDING;
  for (const line of lines) {
    ctx.fillText(line, PADDING, y);
    y += LINE_HEIGHT;
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.85,
    );
  });
}

async function textToImageBlobs(text: string, maxPages = 6): Promise<Blob[]> {
  // First, build a probe canvas to measure text wrapping
  const probe = document.createElement("canvas");
  const ctx = probe.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.font = `${FONT_SIZE}px sans-serif`;
  const maxWidth = PAGE_WIDTH - PADDING * 2;

  const allLines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const wrapped = wrapLine(ctx, raw, maxWidth);
    allLines.push(...wrapped);
  }

  const blobs: Blob[] = [];
  for (let i = 0; i < allLines.length && blobs.length < maxPages; i += LINES_PER_PAGE) {
    const pageLines = allLines.slice(i, i + LINES_PER_PAGE);
    blobs.push(await renderPage(pageLines));
  }
  if (blobs.length === 0) blobs.push(await renderPage(["(empty document)"]));
  return blobs;
}

async function docxToText(file: File): Promise<string> {
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
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    parts.push(csv);
    parts.push("");
  }
  return parts.join("\n");
}

async function plainTextFromFile(file: File): Promise<string> {
  return await file.text();
}

export function isSupportedDocumentType(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return true;
  if (file.type.startsWith("image/")) return true;
  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".rtf") ||
    file.type === "text/plain" ||
    file.type === "text/csv" ||
    file.type.includes("officedocument") ||
    file.type === "application/msword" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return true;
  }
  return false;
}

/**
 * Convert any supported document type (Word, Excel, CSV, TXT, RTF) into image
 * blobs the analyzer can consume. PDFs and images are NOT handled here —
 * callers route those through their existing paths.
 */
export async function documentFileToImageBlobs(
  file: File,
  opts: { maxPages?: number } = {},
): Promise<Blob[]> {
  const name = file.name.toLowerCase();
  const maxPages = opts.maxPages ?? 6;

  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const text = await docxToText(file);
    return textToImageBlobs(text, maxPages);
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheetml") ||
    file.type === "application/vnd.ms-excel"
  ) {
    const text = await xlsxToText(file);
    return textToImageBlobs(text, maxPages);
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
    const text = await plainTextFromFile(file);
    return textToImageBlobs(text, maxPages);
  }

  if (name.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc files aren't supported in the browser — please save as .docx and try again.",
    );
  }

  throw new Error(`Unsupported document type: ${file.name}`);
}
