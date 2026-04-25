import { describe, it, expect } from "vitest";
import { canonicalize, formatQty, roundQty } from "./units";

/**
 * Unit conversion + aggregation tests.
 *
 * The shopping-list aggregator groups line items by canonicalized unit, so
 * these tests guarantee that mixed-unit inputs (lb + oz, tsp + tbsp, ml + tbsp,
 * kg + oz, etc.) collapse into a single canonical bucket and sum correctly.
 */

// Lightweight aggregator that mirrors how shopping-list-pdf / -xlsx group rows:
// canonicalize each input, then sum quantities under the canonical unit key.
function aggregate(items: Array<{ qty: number; unit: string | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const c = canonicalize(it.unit, it.qty);
    const key = c.unit ?? "(none)";
    out.set(key, (out.get(key) ?? 0) + c.quantity);
  }
  return out;
}

const APPROX = 0.01;

describe("canonicalize — weight (canonical: oz)", () => {
  it("lb → oz: 1 lb = 16 oz", () => {
    const r = canonicalize("lb", 1);
    expect(r.unit).toBe("oz");
    expect(r.dimension).toBe("weight");
    expect(r.quantity).toBe(16);
  });

  it("oz stays oz (no conversion)", () => {
    const r = canonicalize("oz", 8);
    expect(r.unit).toBe("oz");
    expect(r.quantity).toBe(8);
    expect(r.converted).toBe(false);
  });

  it("kg → oz: 1 kg ≈ 35.27 oz", () => {
    const r = canonicalize("kg", 1);
    expect(r.unit).toBe("oz");
    expect(r.quantity).toBeCloseTo(35.27, 1);
  });

  it("g → oz: 100 g ≈ 3.53 oz", () => {
    const r = canonicalize("g", 100);
    expect(r.unit).toBe("oz");
    expect(r.quantity).toBeCloseTo(3.53, 1);
  });
});

describe("canonicalize — volume (canonical: tbsp)", () => {
  it("tsp → tbsp: 3 tsp = 1 tbsp", () => {
    const r = canonicalize("tsp", 3);
    expect(r.unit).toBe("tbsp");
    expect(r.quantity).toBe(1);
  });

  it("tbsp stays tbsp", () => {
    const r = canonicalize("tbsp", 4);
    expect(r.unit).toBe("tbsp");
    expect(r.quantity).toBe(4);
  });

  it("cup → tbsp: 1 cup = 16 tbsp", () => {
    const r = canonicalize("cup", 1);
    expect(r.quantity).toBe(16);
  });

  it("ml → tbsp: 15 ml ≈ 1.01 tbsp", () => {
    const r = canonicalize("ml", 15);
    expect(r.unit).toBe("tbsp");
    expect(r.quantity).toBeCloseTo(1.01, 1);
  });

  it("liter → tbsp: 1 L ≈ 67.6 tbsp", () => {
    const r = canonicalize("liter", 1);
    expect(r.quantity).toBeCloseTo(67.6, 0);
  });
});

describe("canonicalize — count and unknown", () => {
  it("each → ea, rounded whole", () => {
    const r = canonicalize("each", 3.4);
    expect(r.unit).toBe("ea");
    expect(r.quantity).toBe(3);
  });

  it("unknown unit (bunch) is preserved as 'other'", () => {
    const r = canonicalize("bunch", 2);
    expect(r.unit).toBe("bunch");
    expect(r.dimension).toBe("other");
    expect(r.converted).toBe(false);
  });

  it("null unit returns null bucket", () => {
    const r = canonicalize(null, 5);
    expect(r.unit).toBeNull();
    expect(r.quantity).toBe(5);
  });

  it("trims trailing dot and is case-insensitive (Lbs.)", () => {
    const r = canonicalize("Lbs.", 2);
    expect(r.unit).toBe("oz");
    expect(r.quantity).toBe(32);
  });
});

describe("aggregation — mixed-unit shopping list rows combine into one canonical bucket", () => {
  it("lb + oz → single oz row (1 lb + 8 oz = 24 oz)", () => {
    const m = aggregate([
      { qty: 1, unit: "lb" },
      { qty: 8, unit: "oz" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("oz")).toBeCloseTo(24, APPROX);
  });

  it("tsp + tbsp → single tbsp row (6 tsp + 2 tbsp = 4 tbsp)", () => {
    const m = aggregate([
      { qty: 6, unit: "tsp" },
      { qty: 2, unit: "tbsp" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("tbsp")).toBeCloseTo(4, APPROX);
  });

  it("ml + tbsp → single tbsp row (30 ml + 1 tbsp ≈ 3.03 tbsp)", () => {
    const m = aggregate([
      { qty: 30, unit: "ml" },
      { qty: 1, unit: "tbsp" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("tbsp")).toBeCloseTo(3.03, 0.05);
  });

  it("kg + oz → single oz row (1 kg + 4 oz ≈ 39.27 oz)", () => {
    const m = aggregate([
      { qty: 1, unit: "kg" },
      { qty: 4, unit: "oz" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("oz")).toBeCloseTo(39.27, 0.1);
  });

  it("cups + tbsp + tsp + ml all collapse to one tbsp row", () => {
    const m = aggregate([
      { qty: 1, unit: "cup" },   // 16
      { qty: 2, unit: "tbsp" },  // 2
      { qty: 3, unit: "tsp" },   // 1
      { qty: 15, unit: "ml" },   // ~1.01
    ]);
    expect(m.size).toBe(1);
    expect(m.get("tbsp")).toBeCloseTo(20.01, 0.05);
  });

  it("weight and volume stay in separate buckets", () => {
    const m = aggregate([
      { qty: 1, unit: "lb" },
      { qty: 1, unit: "cup" },
    ]);
    expect(m.size).toBe(2);
    expect(m.get("oz")).toBe(16);
    expect(m.get("tbsp")).toBe(16);
  });

  it("unknown units stay in their own bucket and don't merge with canonicals", () => {
    const m = aggregate([
      { qty: 2, unit: "bunch" },
      { qty: 1, unit: "bunch" },
      { qty: 1, unit: "lb" },
    ]);
    expect(m.size).toBe(2);
    expect(m.get("bunch")).toBe(3);
    expect(m.get("oz")).toBe(16);
  });
});

describe("roundQty / formatQty — display precision", () => {
  it("avoids floating-point tails after ml→tbsp", () => {
    // 1 ml = 0.067628 tbsp; want 3 decimals max for sub-1 values
    expect(roundQty(0.067628, "tbsp", "volume")).toBe(0.068);
    expect(formatQty(0.067628, "tbsp", "volume")).toBe("0.068");
  });

  it("strips trailing zeros (16.00 → '16')", () => {
    expect(formatQty(16, "tbsp", "volume")).toBe("16");
  });

  it("rounds count units to whole numbers", () => {
    expect(roundQty(3.7, "ea", "count")).toBe(4);
  });

  it("zero stays zero", () => {
    expect(roundQty(0)).toBe(0);
    expect(formatQty(0)).toBe("0");
  });
});
