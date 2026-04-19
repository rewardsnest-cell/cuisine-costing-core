import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { QuotePreferences } from "@/components/quote/types";
import { BRAND, drawBrandedHeader, drawBrandedFooter } from "@/lib/pdf-brand";

type QuoteData = {
  clientName: string;
  clientEmail: string;
  eventType: string;
  eventDate: string;
  guestCount: number;
  menuStyle: string;
  proteins: string[];
  allergies: string[];
  pricePerDish: number;
  preferences?: QuotePreferences;
  /** Optional reference number to print on the cover ("TQ-XXXXXX"). */
  referenceNumber?: string | null;
};

/**
 * Branded customer-facing catering proposal.
 * Header/footer match the recipe printable + newsletter guide.
 */
export function generateQuotePDF(data: QuoteData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;

  let y = drawBrandedHeader(doc, {
    rightText: "Catering Proposal",
    subTitle: `Prepared ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
  });

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.ink);
  doc.text("Your event, thoughtfully planned.", M, (y += 8));
  y += 10;

  if (data.referenceNumber) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Reference: ${data.referenceNumber}`, M, (y += 14));
  }

  // Client / Event grid
  y += 18;
  const details: [string, string][] = [
    ["Client", data.clientName || "—"],
    ["Email", data.clientEmail || "—"],
    ["Event", data.eventType || "—"],
    ["Date", data.eventDate || "TBD"],
    ["Guests", String(data.guestCount)],
    ["Menu Style", data.menuStyle.charAt(0).toUpperCase() + data.menuStyle.slice(1)],
  ];
  doc.setFontSize(10);
  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.muted);
    doc.text(`${label}:`, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.ink);
    doc.text(value, M + 70, y);
    y += 14;
  });

  // Divider
  y += 6;
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 16;

  // Menu selections
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.ink);
  doc.text("Menu Selections", M, y);
  y += 8;

  const tableBody = data.proteins.map((protein) => [
    protein,
    String(data.guestCount),
    `$${data.pricePerDish.toFixed(2)}`,
    `$${(data.guestCount * data.pricePerDish).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Dish", "Servings", "Per Person", "Subtotal"]],
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [...BRAND.cocoa] as [number, number, number],
      textColor: [...BRAND.gold] as [number, number, number],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 10, textColor: [...BRAND.body] as [number, number, number] },
    alternateRowStyles: { fillColor: [...BRAND.cream] as [number, number, number] },
    margin: { left: M, right: M },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 16;

  // Totals
  const subtotal = data.guestCount * data.proteins.length * data.pricePerDish;
  const taxRate = 0.08;
  const tax = subtotal * taxRate;
  const grand = subtotal + tax;
  const totalsX = W - M - 80;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text("Subtotal:", totalsX, y);
  doc.setTextColor(...BRAND.ink);
  doc.text(`$${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, W - M, y, { align: "right" });
  y += 14;

  doc.setTextColor(...BRAND.muted);
  doc.text("Tax (8%):", totalsX, y);
  doc.setTextColor(...BRAND.ink);
  doc.text(`$${tax.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, W - M, y, { align: "right" });
  y += 10;

  doc.setDrawColor(...BRAND.gold);
  doc.line(totalsX - 6, y, W - M, y);
  y += 14;

  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.ink);
  doc.text("Total", totalsX, y);
  doc.setTextColor(...BRAND.gold);
  doc.text(`$${grand.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, W - M, y, { align: "right" });
  y += 22;

  // Allergens
  if (data.allergies.length > 0) {
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.ink);
    doc.text("Allergen Accommodations", M, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(180, 50, 50);
    doc.text(data.allergies.join("  •  "), M, (y += 8));
    y += 14;
  }

  // Chef Preferences
  const p = data.preferences || {};
  const prefRows: [string, string][] = [];
  if (p.proteinDetails) prefRows.push(["Protein notes", p.proteinDetails]);
  if (p.vegetableNotes) prefRows.push(["Vegetable notes", p.vegetableNotes]);
  if (p.cuisineLean) prefRows.push(["Cuisine direction", p.cuisineLean]);
  if (p.spiceLevel) prefRows.push(["Spice level", p.spiceLevel]);
  if (p.vibe) prefRows.push(["Event vibe", p.vibe]);
  if (p.alcohol?.beer) prefRows.push(["Beer", p.alcohol.beer]);
  if (p.alcohol?.wine) prefRows.push(["Wine", p.alcohol.wine]);
  if (p.alcohol?.spirits) prefRows.push(["Spirits", p.alcohol.spirits]);
  if (p.alcohol?.signatureCocktail) prefRows.push(["Signature cocktail", p.alcohol.signatureCocktail]);
  if (p.notes) prefRows.push(["Additional notes", p.notes]);

  if (prefRows.length > 0) {
    const H = doc.internal.pageSize.getHeight();
    if (y > H - 110) {
      doc.addPage();
      y = drawBrandedHeader(doc, { rightText: "Catering Proposal" });
    }
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.ink);
    doc.text("Chef Preferences", M, y);

    autoTable(doc, {
      startY: y + 6,
      head: [["Detail", "Value"]],
      body: prefRows,
      theme: "grid",
      headStyles: {
        fillColor: [...BRAND.cocoa] as [number, number, number],
        textColor: [...BRAND.gold] as [number, number, number],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: { fontSize: 10, textColor: [...BRAND.body] as [number, number, number], cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold", textColor: [...BRAND.muted] as [number, number, number] },
        1: { cellWidth: "auto" },
      },
      margin: { left: M, right: M },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Closing note
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 80) {
    doc.addPage();
    y = drawBrandedHeader(doc, { rightText: "Catering Proposal" });
  }
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text(
    "This proposal is valid for 30 days. Reply to lock your date or ask any question — we'll come back quickly.",
    M,
    y + 6,
    { maxWidth: W - M * 2 },
  );

  drawBrandedFooter(doc, { extra: "Catering proposal" });
  return doc;
}
