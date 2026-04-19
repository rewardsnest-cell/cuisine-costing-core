import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round a dollar amount up to the next $5 increment. */
export function roundUpToNext5(n: number): number {
  if (!isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 5) * 5;
}
