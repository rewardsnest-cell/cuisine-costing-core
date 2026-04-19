import type jsPDF from "jspdf";

/**
 * Shared brand palette + header/footer helpers for all VPS Finest PDFs.
 * Pure JS so it runs in browser AND the Worker SSR runtime.
 */
export const BRAND = {
  name: "VPS FINEST",
  tagline: "Catering & Recipes · Aurora, Ohio",
  site: "vpsfinest.com",
  email: "hello@vpsfinest.com",
  phone: "",
  // Aligned with src/styles.css tokens (warm cream + cocoa + gold)
  cream: [245, 240, 232] as const,
  ink: [40, 30, 20] as const,
  body: [60, 50, 40] as const,
  muted: [120, 110, 100] as const,
  rule: [220, 210, 195] as const,
  gold: [196, 155, 70] as const,
  cocoa: [70, 50, 35] as const,
};

/**
 * Draw the branded header bar (cocoa band + gold accent + monogram + brand name).
 * Returns the y position where body content can start.
 */
export function drawBrandedHeader(doc: jsPDF, opts?: { rightText?: string; subTitle?: string }): number {
  const W = doc.internal.pageSize.getWidth();
  const barH = 60;

  // Cocoa header band
  doc.setFillColor(...BRAND.cocoa);
  doc.rect(0, 0, W, barH, "F");
  // Gold underline
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, barH, W, 3, "F");

  // Monogram square
  doc.setFillColor(...BRAND.gold);
  doc.roundedRect(36, 16, 28, 28, 4, 4, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.cocoa);
  doc.text("VF", 50, 35, { align: "center" });

  // Brand name + tagline
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.gold);
  doc.text(BRAND.name, 76, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(225, 215, 190);
  doc.text(BRAND.tagline, 76, 44);

  // Right-aligned slot
  if (opts?.rightText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(225, 215, 190);
    doc.text(opts.rightText, W - 36, 30, { align: "right" });
  }
  if (opts?.subTitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(225, 215, 190);
    doc.text(opts.subTitle, W - 36, 44, { align: "right" });
  }

  return barH + 18;
}

/**
 * Draw a unified footer with site, email and page numbers on every page.
 * Call AFTER the document is fully built.
 */
export function drawBrandedFooter(doc: jsPDF, opts?: { extra?: string }) {
  const total = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // Soft cream strip
    doc.setFillColor(...BRAND.cream);
    doc.rect(0, H - 36, W, 36, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(`${BRAND.site}  ·  ${BRAND.email}`, 36, H - 18);
    if (opts?.extra) {
      doc.text(opts.extra, W / 2, H - 18, { align: "center" });
    }
    doc.text(`Page ${p} of ${total}`, W - 36, H - 18, { align: "right" });
  }
}
