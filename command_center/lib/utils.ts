import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}
