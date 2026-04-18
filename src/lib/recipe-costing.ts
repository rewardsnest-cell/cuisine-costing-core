function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? "").toLowerCase().trim().replace(/\.$/, "");
}

const WEIGHT_TO_LB: Record<string, number> = {
  lb: 1,
  lbs: 1,
  pound: 1,
  pounds: 1,
  oz: 1 / 16,
  ounce: 1 / 16,
  ounces: 1 / 16,
  g: 1 / 453.592,
  gram: 1 / 453.592,
  grams: 1 / 453.592,
  kg: 2.20462,
  kilogram: 2.20462,
  kilograms: 2.20462,
};

const VOLUME_TO_QT: Record<string, number> = {
  qt: 1,
  quart: 1,
  quarts: 1,
  gal: 4,
  gallon: 4,
  gallons: 4,
  pt: 0.5,
  pint: 0.5,
  pints: 0.5,
  cup: 0.25,
  cups: 0.25,
  c: 0.25,
  "fl oz": 1 / 32,
  floz: 1 / 32,
  tbsp: 1 / 64,
  tablespoon: 1 / 64,
  tablespoons: 1 / 64,
  tsp: 1 / 192,
  teaspoon: 1 / 192,
  teaspoons: 1 / 192,
  ml: 1 / 946.353,
  milliliter: 1 / 946.353,
  l: 1.05669,
  liter: 1.05669,
  liters: 1.05669,
  litre: 1.05669,
};

const VOLUME_TO_LITER: Record<string, number> = {
  l: 1,
  liter: 1,
  liters: 1,
  litre: 1,
  ml: 0.001,
  milliliter: 0.001,
  qt: 0.946353,
  quart: 0.946353,
  gal: 3.78541,
  gallon: 3.78541,
  pt: 0.473176,
  pint: 0.473176,
  cup: 0.236588,
  cups: 0.236588,
  "fl oz": 0.0295735,
  floz: 0.0295735,
  tbsp: 0.0147868,
  tablespoon: 0.0147868,
  tsp: 0.00492892,
  teaspoon: 0.00492892,
};

export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!from || !to) return null;
  if (from === to) return qty;
  if (from in WEIGHT_TO_LB && to in WEIGHT_TO_LB) return (qty * WEIGHT_TO_LB[from]) / WEIGHT_TO_LB[to];
  if (from in VOLUME_TO_QT && to in VOLUME_TO_QT) return (qty * VOLUME_TO_QT[from]) / VOLUME_TO_QT[to];
  if (from in VOLUME_TO_LITER && to in VOLUME_TO_LITER) return (qty * VOLUME_TO_LITER[from]) / VOLUME_TO_LITER[to];

  return null;
}

export function getConvertedUnitCost(
  recipeUnit: string,
  inventoryUnit: string,
  inventoryCostPerUnit: number,
): number | null {
  const convertedSingleUnit = convertQty(1, recipeUnit, inventoryUnit);
  if (convertedSingleUnit === null) return null;
  return convertedSingleUnit * inventoryCostPerUnit;
}

type CostInput = {
  quantity: number;
  unit: string;
  fallbackCostPerUnit?: number | null;
  inventoryItem?: {
    average_cost_per_unit: number;
    unit: string;
  } | null;
};

export function getIngredientCostMetrics({
  quantity,
  unit,
  fallbackCostPerUnit,
  inventoryItem,
}: CostInput) {
  const safeQty = Number(quantity) || 0;
  const fallbackUnitCost = Number(fallbackCostPerUnit) || 0;

  if (inventoryItem && Number(inventoryItem.average_cost_per_unit) > 0) {
    const convertedQty = convertQty(safeQty, unit, inventoryItem.unit);
    const convertedUnitCost = getConvertedUnitCost(
      unit,
      inventoryItem.unit,
      Number(inventoryItem.average_cost_per_unit) || 0,
    );

    if (convertedQty !== null && convertedUnitCost !== null) {
      return {
        unitCost: convertedUnitCost,
        lineTotal: convertedQty * (Number(inventoryItem.average_cost_per_unit) || 0),
        usedInventoryConversion: true,
      };
    }
  }

  return {
    unitCost: fallbackUnitCost,
    lineTotal: safeQty * fallbackUnitCost,
    usedInventoryConversion: false,
  };
}