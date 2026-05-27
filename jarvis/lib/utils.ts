import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import crypto from "crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreColor(score: number): string {
  if (score >= 90) return "text-blue-400";
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

export function scoreRingColor(score: number): string {
  if (score >= 90) return "#60a5fa"; // blue-400
  if (score >= 75) return "#4ade80"; // green-400
  if (score >= 50) return "#facc15"; // yellow-400
  return "#f87171"; // red-400
}

export function scoreBgColor(score: number): string {
  if (score >= 90) return "bg-blue-400/10 border-blue-400/30";
  if (score >= 75) return "bg-green-400/10 border-green-400/30";
  if (score >= 50) return "bg-yellow-400/10 border-yellow-400/30";
  return "bg-red-400/10 border-red-400/30";
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function hashObject(obj: unknown): string {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 8);
}

// Goal-relative scoring: returns 0-100 based on how close actual is to target
// mode: "higher" = more is better, "lower" = less is better, "exact" = target is ideal
export function goalScore(
  actual: number,
  target: number,
  mode: "higher" | "lower" | "exact" = "higher",
  tolerance: number = 0.1
): number {
  if (!actual || !target) return 0;
  if (mode === "exact") {
    const pct = actual / target;
    if (pct >= 1 - tolerance && pct <= 1 + tolerance) return 100;
    const dist = Math.abs(pct - 1);
    return Math.max(0, 100 - dist * 150);
  }
  if (mode === "higher") {
    const pct = actual / target;
    if (pct >= 1) return 100;
    return Math.max(0, Math.round(pct * 100));
  }
  // lower is better
  const pct = actual / target;
  if (pct <= 1) return 100;
  return Math.max(0, Math.round((2 - pct) * 100));
}
