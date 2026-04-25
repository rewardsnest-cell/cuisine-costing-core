import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, drawBrandedHeader, drawBrandedFooter } from "@/lib/pdf-brand";

export type ShoppingListPdfItem = {
  ingredient_name: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
};

export type ShoppingListPdfMeta = {
  eventName?: string | null;
  eventReference?: string | null;
  guestCount?: number | null;
  revisionNumber?: number | null;
  status?: string | null;
};

export function generateShoppingListPdf(
  items: ShoppingListPdfItem[],
  meta: ShoppingListPdfMeta = {},
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();

  const subTitle = [
    meta.eventName,
    meta.eventReference ? `#${meta.eventReference}` : null,
    meta.guestCount ? `${meta.guestCount} guests` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let y = drawBrandedHeader(doc, {
    rightText: meta.revisionNumber != null ? `Revision ${meta.revisionNumber}` : undefined,
    subTitle: subTitle || undefined,
  });

  doc.setFontSize(16);
  doc.setTextColor(...BRAND.ink);
  doc.text("Shopping List", 36, y + 24);

  if (meta.status) {
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text(meta.status.toUpperCase(), W - 36, y + 24, { align: "right" });
  }

  const total = items.reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0),
    0,
  );

  autoTable(doc, {
    startY: y + 36,
    margin: { left: 36, right: 36, bottom: 60 },
    head: [["Ingredient", "Qty", "Unit", "$ / unit", "Subtotal"]],
    body: items.map((i) => {
      const qty = Number(i.quantity || 0);
      const price = Number(i.unit_price || 0);
      const sub = qty * price;
      return [
        i.ingredient_name,
        formatQty(qty),
        i.unit ?? "",
        price ? `$${price.toFixed(2)}` : "—",
        sub ? `$${sub.toFixed(2)}` : "—",
      ];
    }),
    foot: [["", "", "", "Total", `$${total.toFixed(2)}`]],
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6, textColor: BRAND.body as any },
    headStyles: { fillColor: BRAND.cocoa as any, textColor: [255, 255, 255] as any },
    footStyles: { fillColor: BRAND.cream as any, textColor: BRAND.ink as any, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    columnStyles: {
      1: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    didDrawPage: () => drawBrandedFooter(doc),
  });

  return doc;
}

function formatQty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
