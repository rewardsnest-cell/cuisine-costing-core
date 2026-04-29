// Branded VPSFinest Catering Proposal PDF.
// Implements the layout from the Admin Quote Mega Prompt:
// Header → Client/Event → Sectioned Menu → Pricing → Assumptions → Terms.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, drawBrandedHeader, drawBrandedFooter } from "@/lib/pdf-brand";

export type QuoteSection =
  | "appetizer" | "entree" | "side" | "dessert"
  | "beverage" | "staffing" | "rental" | "other";

export const SECTION_ORDER: QuoteSection[] = [
  "appetizer", "entree", "side", "dessert", "beverage", "staffing", "rental", "other",
];

export const SECTION_LABEL: Record<QuoteSection, string> = {
  appetizer: "Appetizers",
  entree: "Entrées",
  side: "Sides",
  dessert: "Desserts",
  beverage: "Beverages",
  staffing: "Staffing & Service",
  rental: "Rentals & Equipment",
  other: "Additional Items",
};

export type VpsQuoteItem = {
  section: QuoteSection;
  name: string;
  quantity: number;
  unit_price: number; // 0 = "Estimate pending"
};

export type VpsQuoteData = {
  referenceNumber?: string | null;
  issueDate: string; // ISO date
  expiresAt?: string | null;
  // Client
  clientName?: string | null;
  clientOrg?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  // Event
  eventName?: string | null;
  eventDate?: string | null;
  eventLocationName?: string | null;
  eventLocationAddr?: string | null;
  guestCount?: number | null;
  // Items + totals
  items: VpsQuoteItem[];
  taxRate: number;
  notes?: string | null;
};

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateVpsfinestQuotePDF(q: VpsQuoteData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;

  let y = drawBrandedHeader(doc, {
    rightText: "Catering Proposal",
    subTitle: `Issued ${new Date(q.issueDate).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })}`,
  });

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.ink);
  doc.text("Your event, thoughtfully planned.", M, (y += 8));

  if (q.referenceNumber) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Quote #: ${q.referenceNumber}`, M, (y += 16));
  }

  // Client + Event grid
  y += 18;
  const lines: [string, string][] = [
    ["Client", q.clientName || "—"],
    ["Organization", q.clientOrg || "—"],
    ["Email", q.clientEmail || "—"],
    ["Phone", q.clientPhone || "—"],
    ["Event", q.eventName || "—"],
    ["Event Date", q.eventDate || "TBD"],
    ["Location", [q.eventLocationName, q.eventLocationAddr].filter(Boolean).join(" · ") || "TBD"],
    ["Guests", q.guestCount != null ? String(q.guestCount) : "TBD"],
  ];
  doc.setFontSize(10);
  for (const [label, val] of lines) {
    doc.setFont("helvetica", "bold"); doc.setTextColor(...BRAND.muted);
    doc.text(`${label}:`, M, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...BRAND.ink);
    doc.text(val, M + 84, y, { maxWidth: W - M * 2 - 84 });
    y += 14;
  }

  // Divider
  y += 6;
  doc.setDrawColor(...BRAND.gold); doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y); y += 16;

  // Sectioned menu
  let runningSubtotal = 0;
  let hasEstimatePending = false;

  for (const sect of SECTION_ORDER) {
    const items = q.items.filter((it) => it.section === sect);
    if (items.length === 0) continue;

    const H = doc.internal.pageSize.getHeight();
    if (y > H - 120) { doc.addPage(); y = drawBrandedHeader(doc, { rightText: "Catering Proposal" }); }

    doc.setFont("times", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND.ink);
    doc.text(SECTION_LABEL[sect], M, y);
    y += 4;

    const body = items.map((it) => {
      const lineTotal = it.quantity * it.unit_price;
      runningSubtotal += lineTotal;
      const priceCell = it.unit_price === 0 ? "Estimate pending" : fmt(it.unit_price);
      const totalCell = it.unit_price === 0 ? "—" : fmt(lineTotal);
      if (it.unit_price === 0) hasEstimatePending = true;
      return [it.name, String(it.quantity), priceCell, totalCell];
    });

    autoTable(doc, {
      startY: y + 4,
      head: [["Item", "Qty", "Unit Price", "Subtotal"]],
      body,
      theme: "striped",
      headStyles: {
        fillColor: [...BRAND.cocoa] as [number, number, number],
        textColor: [...BRAND.gold] as [number, number, number],
        fontStyle: "bold", fontSize: 10,
      },
      bodyStyles: { fontSize: 10, textColor: [...BRAND.body] as [number, number, number] },
      alternateRowStyles: { fillColor: [...BRAND.cream] as [number, number, number] },
      columnStyles: { 1: { halign: "center", cellWidth: 50 }, 2: { halign: "right", cellWidth: 100 }, 3: { halign: "right", cellWidth: 90 } },
      margin: { left: M, right: M },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Pricing summary
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 160) { doc.addPage(); y = drawBrandedHeader(doc, { rightText: "Catering Proposal" }); }

  const taxAmount = +(runningSubtotal * q.taxRate).toFixed(2);
  const grand = +(runningSubtotal + taxAmount).toFixed(2);
  const totalsX = W - M - 110;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted); doc.text("Subtotal", totalsX, y);
  doc.setTextColor(...BRAND.ink); doc.text(fmt(runningSubtotal), W - M, y, { align: "right" });
  y += 14;
  doc.setTextColor(...BRAND.muted); doc.text(`Tax (${(q.taxRate * 100).toFixed(1)}%)`, totalsX, y);
  doc.setTextColor(...BRAND.ink); doc.text(fmt(taxAmount), W - M, y, { align: "right" });
  y += 10;
  doc.setDrawColor(...BRAND.gold); doc.line(totalsX - 6, y, W - M, y);
  y += 16;
  doc.setFont("times", "bold"); doc.setFontSize(14);
  doc.setTextColor(...BRAND.ink); doc.text("Total", totalsX, y);
  doc.setTextColor(...BRAND.gold); doc.text(fmt(grand), W - M, y, { align: "right" });
  y += 22;

  if (hasEstimatePending) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...BRAND.muted);
    doc.text("Items marked “Estimate pending” will be confirmed before final approval.", M, y);
    y += 14;
  }

  // Assumptions & notes
  if (y > H - 180) { doc.addPage(); y = drawBrandedHeader(doc, { rightText: "Catering Proposal" }); }
  doc.setFont("times", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND.ink);
  doc.text("Assumptions & Notes", M, (y += 8));
  y += 4;
  const notes = [
    "Menu items are subject to seasonal availability.",
    "Final guest count must be confirmed at least 7 days before the event.",
    "Pricing is subject to final approval and may adjust with menu changes.",
    ...(q.notes ? [q.notes] : []),
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...BRAND.body);
  for (const n of notes) {
    const wrapped = doc.splitTextToSize(`•  ${n}`, W - M * 2);
    doc.text(wrapped, M, (y += 14));
    y += (wrapped.length - 1) * 12;
  }

  // Terms & next steps
  y += 14;
  if (y > H - 140) { doc.addPage(); y = drawBrandedHeader(doc, { rightText: "Catering Proposal" }); }
  doc.setFont("times", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND.ink);
  doc.text("Terms & Next Steps", M, y);
  y += 4;
  const expiry = q.expiresAt
    ? new Date(q.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "30 days from issue date";
  const terms = [
    "A 50% deposit is required to confirm the date.",
    "Final balance is due before the event date.",
    `This quote is valid until ${expiry}.`,
    "To approve: reply to this email or contact us at hello@vpsfinest.com.",
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...BRAND.body);
  for (const t of terms) {
    const wrapped = doc.splitTextToSize(`•  ${t}`, W - M * 2);
    doc.text(wrapped, M, (y += 14));
    y += (wrapped.length - 1) * 12;
  }

  drawBrandedFooter(doc, { extra: "VPS Finest Catering Proposal" });
  return doc;
}
