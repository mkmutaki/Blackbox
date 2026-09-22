import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Days elapsed since January 1st of the current year, counting from 1.
 * Mirrors calculateSynodicDay() in backend/routes/videoRoutes.js — keep the two
 * in step, since the backend stamps the value that entries are stored with.
 */
export function getSynodicDay(now: Date = new Date()): number {
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffInDays = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return diffInDays + 1;
}
