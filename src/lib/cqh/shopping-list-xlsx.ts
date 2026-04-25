import * as XLSX from "xlsx";
import { canonicalize, formatQty } from "@/lib/cqh/units";

export type ShoppingListXlsxItem = {
  ingredient_name: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
};

export type ShoppingListXlsxMeta = {
  eventName?: string | null;
  eventReference?: string | null;
  guestCount?: number | null;
  revisionNumber?: number | null;
  status?: string | null;
};

/**
 * Build an .xlsx workbook for a shopping list. Quantities are converted into
 * the canonical unit (oz / tbsp / etc.) before being written, and totals are
 * authored as live SUM formulas so the file remains editable.
 */
export function generateShoppingListXlsx(
  items: ShoppingListXlsxItem[],
  meta: ShoppingListXlsxMeta = {},
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- Header / meta block --------------------------------------------------
  const headerRows: (string | number | null)[][] = [
    ["Shopping List"],
    ["Event", meta.eventName ?? ""],
    ["Reference", meta.eventReference ?? ""],
    ["Guests", meta.guestCount ?? ""],
    ["Revision", meta.revisionNumber ?? ""],
    ["Status", meta.status ?? ""],
    [],
  ];
  const dataHeaderRowIdx = headerRows.length; // 0-based row index of column headings
  const ws = XLSX.utils.aoa_to_sheet([
    ...headerRows,
    ["Ingredient", "Qty", "Unit", "$ / unit", "Subtotal"],
  ]);

  // --- Item rows ------------------------------------------------------------
  const firstDataRow = dataHeaderRowIdx + 2; // 1-based Excel row of first data line
  const rows = items.map((i) => {
    const conv = canonicalize(i.unit ?? null, Number(i.quantity || 0));
    const qtyText = formatQty(conv.quantity, conv.unit, conv.dimension);
    const qtyNum = Number.isFinite(conv.quantity) ? Number(qtyText) : 0;
    return {
      name: i.ingredient_name,
      qty: qtyNum,
      unit: conv.unit ?? "",
      price: Number(i.unit_price || 0),
    };
  });

  rows.forEach((r, idx) => {
    const excelRow = firstDataRow + idx;
    XLSX.utils.sheet_add_aoa(
      ws,
      [[r.name, r.qty, r.unit, r.price, { f: `B${excelRow}*D${excelRow}` }]],
      { origin: `A${excelRow}` },
    );
  });

  // --- Total row with live formula -----------------------------------------
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRow = lastDataRow + 1;
  if (rows.length > 0) {
    XLSX.utils.sheet_add_aoa(
      ws,
      [["", "", "", "Total", { f: `SUM(E${firstDataRow}:E${lastDataRow})` }]],
      { origin: `A${totalRow}` },
    );
  }

  // --- Number formatting ----------------------------------------------------
  const moneyFmt = '"$"#,##0.00;("$"#,##0.00);"-"';
  for (let r = firstDataRow; r <= totalRow; r++) {
    const priceCell = ws[`D${r}`];
    const subCell = ws[`E${r}`];
    if (priceCell) priceCell.z = moneyFmt;
    if (subCell) subCell.z = moneyFmt;
  }

  // --- Column widths --------------------------------------------------------
  ws["!cols"] = [
    { wch: 38 }, // Ingredient
    { wch: 10 }, // Qty
    { wch: 8 },  // Unit
    { wch: 12 }, // $ / unit
    { wch: 14 }, // Subtotal
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Shopping List");
  return wb;
}

export function downloadShoppingListXlsx(
  items: ShoppingListXlsxItem[],
  meta: ShoppingListXlsxMeta,
  filename: string,
): void {
  const wb = generateShoppingListXlsx(items, meta);
  XLSX.writeFile(wb, filename);
}
