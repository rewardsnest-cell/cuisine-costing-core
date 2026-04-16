import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
};

export function generateQuotePDF(data: QuoteData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Header bar
  doc.setFillColor(45, 27, 10);
  doc.rect(0, 0, pageWidth, 45, "F");
  doc.setFillColor(196, 155, 70);
  doc.rect(0, 45, pageWidth, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(196, 155, 70);
  doc.text("TasteQuote", margin, 30);

  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text("Premium Catering Proposal", pageWidth - margin, 25, { align: "right" });
  doc.text(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, pageWidth - margin, 33, { align: "right" });

  y = 60;

  // Client & Event info
  doc.setFontSize(18);
  doc.setTextColor(45, 27, 10);
  doc.setFont("helvetica", "bold");
  doc.text("Catering Proposal", margin, y);
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");

  const details = [
    ["Client", data.clientName || "—"],
    ["Email", data.clientEmail || "—"],
    ["Event", data.eventType || "—"],
    ["Date", data.eventDate || "TBD"],
    ["Guests", String(data.guestCount)],
    ["Menu Style", data.menuStyle.charAt(0).toUpperCase() + data.menuStyle.slice(1)],
  ];

  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 27, 10);
    doc.text(value, margin + 35, y);
    y += 7;
  });

  y += 8;

  // Separator
  doc.setDrawColor(196, 155, 70);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Menu selections table
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(45, 27, 10);
  doc.text("Menu Selections", margin, y);
  y += 8;

  const tableBody = data.proteins.map((protein) => [
    protein,
    String(data.guestCount),
    `$${data.pricePerDish.toFixed(2)}`,
    `$${(data.guestCount * data.pricePerDish).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  ]);

  (doc as any).autoTable({
    startY: y,
    head: [["Dish", "Servings", "Per Person", "Subtotal"]],
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [45, 27, 10],
      textColor: [196, 155, 70],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 10, textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    margin: { left: margin, right: margin },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Totals
  const totalAmount = data.guestCount * data.proteins.length * data.pricePerDish;
  const taxRate = 0.08;
  const taxAmount = totalAmount * taxRate;
  const grandTotal = totalAmount + taxAmount;

  const totalsX = pageWidth - margin - 70;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Subtotal:", totalsX, y);
  doc.setTextColor(45, 27, 10);
  doc.text(`$${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, pageWidth - margin, y, { align: "right" });
  y += 7;

  doc.setTextColor(100, 100, 100);
  doc.text("Tax (8%):", totalsX, y);
  doc.setTextColor(45, 27, 10);
  doc.text(`$${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, pageWidth - margin, y, { align: "right" });
  y += 9;

  doc.setDrawColor(196, 155, 70);
  doc.line(totalsX - 5, y - 3, pageWidth - margin, y - 3);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(45, 27, 10);
  doc.text("Total:", totalsX, y + 4);
  doc.setTextColor(196, 155, 70);
  doc.text(`$${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, pageWidth - margin, y + 4, { align: "right" });
  y += 18;

  // Allergen accommodations
  if (data.allergies.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(45, 27, 10);
    doc.text("Allergen Accommodations", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 50, 50);
    doc.text(data.allergies.join("  •  "), margin, y);
    y += 12;
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFillColor(250, 247, 240);
  doc.rect(0, footerY - 10, pageWidth, 30, "F");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("TasteQuote — Premium Catering Solutions", pageWidth / 2, footerY, { align: "center" });
  doc.text("This proposal is valid for 30 days from the date of issue.", pageWidth / 2, footerY + 5, { align: "center" });

  return doc;
}
