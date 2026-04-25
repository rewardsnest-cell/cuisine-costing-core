import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, drawBrandedHeader, drawBrandedFooter } from "@/lib/pdf-brand";
import { canonicalize, formatQty } from "@/lib/cqh/units";

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

  // Draw the page-1 header now (returns Y baseline below the brand block).
  const headerY = drawBrandedHeader(doc, {
    rightText: meta.revisionNumber != null ? `Revision ${meta.revisionNumber}` : undefined,
    subTitle: subTitle || undefined,
  });

  doc.setFontSize(16);
  doc.setTextColor(...BRAND.ink);
  doc.text("Shopping List", 36, headerY + 24);

  if (meta.status) {
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text(meta.status.toUpperCase(), W - 36, headerY + 24, { align: "right" });
  }

  const total = items.reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0),
    0,
  );

  // Reserve a top margin on continuation pages so rows don't render under the
  // brand header, and a bottom margin so rows + the foot don't collide with
  // the brand footer. autoTable will auto-paginate within these margins.
  const TOP_CONTINUATION = 72;   // header (~48) + breathing room
  const BOTTOM_RESERVE = 72;     // footer (~32) + foot row + breathing room

  autoTable(doc, {
    startY: headerY + 36,
    margin: { left: 36, right: 36, top: TOP_CONTINUATION, bottom: BOTTOM_RESERVE },
    head: [["Ingredient", "Qty", "Unit", "$ / unit", "Subtotal"]],
    body: items.map((i) => {
      const conv = canonicalize(i.unit ?? null, Number(i.quantity || 0));
      const price = Number(i.unit_price || 0);
      const sub = conv.quantity * price;
      return [
        i.ingredient_name,
        formatQty(conv.quantity, conv.unit, conv.dimension),
        conv.unit ?? "",
        price ? `$${price.toFixed(2)}` : "—",
        sub ? `$${sub.toFixed(2)}` : "—",
      ];
    }),
    foot: [["", "", "", "Total", `$${total.toFixed(2)}`]],
    // Pagination safety:
    //  - rowPageBreak 'avoid' keeps a single row from splitting across pages.
    //  - showFoot 'lastPage' ensures the Total row only renders once, at the
    //    end (autoTable pushes it to a new page if it doesn't fit with the
    //    final body row, preventing an orphaned/cut total).
    pageBreak: "auto",
    rowPageBreak: "avoid",
    showFoot: "lastPage",
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6, textColor: BRAND.body as any, overflow: "linebreak" },
    headStyles: { fillColor: BRAND.cocoa as any, textColor: [255, 255, 255] as any },
    footStyles: { fillColor: BRAND.cream as any, textColor: BRAND.ink as any, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 60 },
      2: { cellWidth: 60 },
      3: { halign: "right", cellWidth: 70 },
      4: { halign: "right", cellWidth: 80 },
    },
    didDrawPage: (data) => {
      // Re-draw brand header on continuation pages so every page is branded.
      if (data.pageNumber > 1) {
        drawBrandedHeader(doc, {
          rightText: meta.revisionNumber != null ? `Revision ${meta.revisionNumber}` : undefined,
          subTitle: subTitle || undefined,
        });
      }
      drawBrandedFooter(doc);
    },
  });

  return doc;
}

