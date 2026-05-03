import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const u = (unit ?? "").toString();
  const isDollar = u.trim() === "$" || u.toLowerCase().includes("dollar");
  if (isDollar) return "$" + value.toLocaleString("en-US");
  return value.toLocaleString("en-US") + (u ? " " + u : "");
}

export function formatMetricUnitLabel(unit: string | null | undefined): string {
  const u = (unit ?? "").toString();
  const isDollar = u.trim() === "$" || u.toLowerCase().includes("dollar");
  return isDollar ? "$" : u;
}
