// Convert a PDF File into an array of JPEG Blobs (one per page) using pdfjs-dist.
// Runs entirely in the browser. Worker is loaded from a CDN that matches the
// installed pdfjs-dist version to avoid bundling worker assets through Vite.

import * as pdfjsLib from "pdfjs-dist";

// Use the matching worker from a CDN. Version is sourced from the package itself.
// @ts-ignore — version is exposed at runtime by pdfjs-dist
const PDFJS_VERSION: string = (pdfjsLib as any).version || "4.7.76";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function pdfFileToImageBlobs(
  file: File,
  opts: { scale?: number; quality?: number; maxPages?: number } = {},
): Promise<Blob[]> {
  const scale = opts.scale ?? 1.6;
  const quality = opts.quality ?? 0.85;
  const maxPages = opts.maxPages ?? 20;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);

  const blobs: Blob[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to encode page image"))),
        "image/jpeg",
        quality,
      );
    });
    blobs.push(blob);
  }
  return blobs;
}
