import { InventoryQueryError, type InventoryReading } from "./inventory-query-contract";
export function exactInventoryCount(value: unknown): number {
 if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
  throw new InventoryQueryError("QUERY_FAILED");
 return value;
}
export function inventoryCountReading(value: unknown): InventoryReading {
 return Object.freeze({ status: "AVAILABLE", value: exactInventoryCount(value) });
}
export function inventoryPercentage(numerator: unknown, denominator: unknown): InventoryReading {
 const n = exactInventoryCount(numerator), d = exactInventoryCount(denominator);
 if (n > d) throw new InventoryQueryError("QUERY_FAILED");
 if (d === 0) return Object.freeze({ status: "NO_DATA", value: null, numerator: n, denominator: d });
 return Object.freeze({ status: "AVAILABLE", value: n / d * 100, numerator: n, denominator: d });
}
