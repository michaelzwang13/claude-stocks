import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(n: number, opts: { sign?: boolean; digits?: number } = {}) {
  const { sign = false, digits = 2 } = opts;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(n));
  if (sign) return `${n >= 0 ? "+" : "−"}$${formatted}`;
  return `$${formatted}`;
}

export function formatPct(n: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const { digits = 2, sign = true } = opts;
  const v = n.toFixed(digits);
  if (sign) return `${n >= 0 ? "+" : ""}${v}%`;
  return `${v}%`;
}

export function formatNumber(n: number, digits = 0) {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(digits);
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86_400);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "2-digit" });
}

export function ratingColor(rating: string): "bull" | "warn" | "bear" | "neutral" {
  if (rating === "BUY" || rating === "bullish") return "bull";
  if (rating === "HOLD" || rating === "neutral") return "warn";
  if (rating === "SELL" || rating === "bearish") return "bear";
  return "neutral";
}
