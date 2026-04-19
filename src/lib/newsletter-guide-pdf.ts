import jsPDF from "jspdf";
import { BRAND, drawBrandedHeader, drawBrandedFooter } from "@/lib/pdf-brand";

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

/** Generate the calm, branded "Free Weeknight Recipe Guide" PDF. */
export function generateNewsletterGuidePDF(opts: GuideOptions): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;

  const title = opts.title || "Weeknight Recipe Guide";
  const subtitle = opts.subtitle || "Five reliable recipes we cook on busy nights.";

  // ───── Cover ─────
  drawBrandedHeader(doc, { rightText: "Recipe Guide" });
  doc.setFillColor(...BRAND.cream);
  doc.rect(0, 80, W, H - 80, "F");

  doc.setFont("times", "bold");
  doc.setTextColor(...BRAND.ink);
  doc.setFontSize(38);
  const titleLines = doc.splitTextToSize(title, W - M * 2);
  doc.text(titleLines, M, H / 2 - 30);

  doc.setFont("times", "italic");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.body);
  const subLines = doc.splitTextToSize(subtitle, W - M * 2);
  doc.text(subLines, M, H / 2 + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.gold);
  doc.text("A small gift from our kitchen in Aurora, Ohio.", M, H - 80);

  // ───── Recipes ─────
  for (const r of opts.recipes) {
    doc.addPage();
    let y = drawBrandedHeader(doc, { rightText: "Recipe" });

    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...BRAND.ink);
    const nameLines = doc.splitTextToSize(r.name, W - M * 2);
    doc.text(nameLines, M, (y += 6));
    y += nameLines.length * 24 + 4;

    const meta: string[] = [];
    const total = (r.prep_time || 0) + (r.cook_time || 0);
    if (total > 0) meta.push(`${total} min total`);
    if (r.servings) meta.push(`Serves ${r.servings}`);
    if (meta.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.muted);
      doc.text(meta.join("  ·  "), M, y);
      y += 16;
    }

    if (r.description) {
      doc.setFont("times", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND.body);
      const descLines = doc.splitTextToSize(r.description, W - M * 2);
      doc.text(descLines, M, y);
      y += descLines.length * 14 + 12;
    }

    doc.setDrawColor(...BRAND.rule);
    doc.line(M, y, W - M, y);
    y += 18;

    const colW = (W - M * 2) / 2;
    const leftX = M;
    const rightX = M + colW + 12;
    const sectionTop = y;

    // Ingredients
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.ink);
    doc.text("Ingredients", leftX, y);
    let leftY = y + 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.body);
    for (const ing of r.ingredients) {
      const qty = ing.quantity ? `${stripTrailingZero(ing.quantity)} ` : "";
      const unit = ing.unit ? `${ing.unit} ` : "";
      const line = `• ${qty}${unit}${ing.name}`;
      const wrapped = doc.splitTextToSize(line, colW - 16);
      if (leftY + wrapped.length * 14 > H - 56) {
        doc.addPage();
        leftY = drawBrandedHeader(doc, { rightText: "Recipe (cont.)" }) + 12;
      }
      doc.text(wrapped, leftX, leftY);
      leftY += wrapped.length * 14 + 2;
    }

    // Method
    if (r.instructions) {
      doc.setFont("times", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BRAND.ink);
      doc.text("Method", rightX, sectionTop);
      let rightY = sectionTop + 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...BRAND.body);
      const steps = r.instructions.split(/\n+/).filter(Boolean);
      steps.forEach((step, i) => {
        const wrapped = doc.splitTextToSize(`${i + 1}. ${step.trim()}`, colW - 16);
        if (rightY + wrapped.length * 13 > H - 56) {
          doc.addPage();
          rightY = drawBrandedHeader(doc, { rightText: "Recipe (cont.)" }) + 12;
        }
        doc.text(wrapped, rightX, rightY);
        rightY += wrapped.length * 13 + 6;
      });
    }
  }

  drawBrandedFooter(doc, { extra: "Weeknight Recipe Guide" });
  return doc;
}

function stripTrailingZero(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(2)).toString();
}
