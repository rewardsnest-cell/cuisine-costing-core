import jsPDF from "jspdf";

export interface GuideRecipe {
  name: string;
  description?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  servings?: number | null;
  ingredients: { name: string; quantity?: number | null; unit?: string | null }[];
  instructions?: string | null;
}

export interface GuideOptions {
  title?: string;
  subtitle?: string;
  recipes: GuideRecipe[];
}

const BRAND = "VPS Finest";
const SITE = "vpsfinest.com";

/**
 * Generate a calm, branded "Free Weeknight Recipe Guide" PDF using jsPDF.
 * Pure JS — runs in browser AND in the Worker SSR environment.
 */
export function generateNewsletterGuidePDF(opts: GuideOptions): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentW = pageW - margin * 2;

  const title = opts.title || "Weeknight Recipe Guide";
  const subtitle = opts.subtitle || "Five reliable recipes we cook on busy nights.";

  // ───── Cover ─────
  doc.setFillColor(245, 240, 232);
  doc.rect(0, 0, pageW, pageH, "F");

  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(140, 110, 60);
  doc.text(BRAND.toUpperCase(), margin, margin);
  doc.text(SITE, pageW - margin, margin, { align: "right" });

  doc.setFont("times", "bold");
  doc.setTextColor(40, 30, 20);
  doc.setFontSize(40);
  const titleLines = doc.splitTextToSize(title, contentW);
  doc.text(titleLines, margin, pageH / 2 - 30);

  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.setTextColor(90, 80, 70);
  const subLines = doc.splitTextToSize(subtitle, contentW);
  doc.text(subLines, margin, pageH / 2 + 10);

  doc.setFontSize(10);
  doc.setTextColor(140, 110, 60);
  doc.text("A small gift from our kitchen in Aurora, Ohio.", margin, pageH - margin);

  // ───── Recipes ─────
  for (const r of opts.recipes) {
    doc.addPage();
    let y = margin;

    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.setTextColor(140, 110, 60);
    doc.text(BRAND.toUpperCase(), margin, y);
    doc.text(SITE, pageW - margin, y, { align: "right" });
    y += 30;

    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.setTextColor(40, 30, 20);
    const nameLines = doc.splitTextToSize(r.name, contentW);
    doc.text(nameLines, margin, y);
    y += nameLines.length * 26 + 6;

    // Meta row
    const meta: string[] = [];
    const total = (r.prep_time || 0) + (r.cook_time || 0);
    if (total > 0) meta.push(`${total} min total`);
    if (r.servings) meta.push(`Serves ${r.servings}`);
    if (meta.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120, 110, 100);
      doc.text(meta.join("  ·  "), margin, y);
      y += 18;
    }

    // Description
    if (r.description) {
      doc.setFont("times", "italic");
      doc.setFontSize(11);
      doc.setTextColor(80, 70, 60);
      const descLines = doc.splitTextToSize(r.description, contentW);
      doc.text(descLines, margin, y);
      y += descLines.length * 14 + 14;
    }

    // Divider
    doc.setDrawColor(220, 210, 195);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    // Ingredients
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 30, 20);
    doc.text("Ingredients", margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(50, 45, 40);
    const ingW = contentW * 0.45;
    let ingY = y;
    for (const ing of r.ingredients) {
      const qty = ing.quantity ? `${stripTrailingZero(ing.quantity)} ` : "";
      const unit = ing.unit ? `${ing.unit} ` : "";
      const line = `• ${qty}${unit}${ing.name}`;
      const lines = doc.splitTextToSize(line, ingW);
      if (ingY + lines.length * 14 > pageH - margin) {
        doc.addPage();
        ingY = margin;
      }
      doc.text(lines, margin, ingY);
      ingY += lines.length * 14 + 2;
    }

    // Instructions on the right
    if (r.instructions) {
      doc.setFont("times", "bold");
      doc.setFontSize(13);
      doc.setTextColor(40, 30, 20);
      const instX = margin + contentW * 0.5;
      let instY = y;
      doc.text("Method", instX, instY);
      instY += 18;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(50, 45, 40);
      const steps = r.instructions.split(/\n+/).filter(Boolean);
      const stepW = contentW * 0.5;
      for (let i = 0; i < steps.length; i++) {
        const text = `${i + 1}. ${steps[i].trim()}`;
        const lines = doc.splitTextToSize(text, stepW);
        if (instY + lines.length * 13 > pageH - margin) {
          doc.addPage();
          instY = margin;
        }
        doc.text(lines, instX, instY);
        instY += lines.length * 13 + 6;
      }
    }

    // Footer
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.setTextColor(140, 110, 60);
    doc.text(`Thoughtful catering & calm recipes · ${SITE}`, pageW / 2, pageH - 30, { align: "center" });
  }

  return doc;
}

function stripTrailingZero(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(2)).toString();
}
