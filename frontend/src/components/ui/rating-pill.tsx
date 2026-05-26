import { cn } from "@/lib/utils";

type Rating = "BUY" | "HOLD" | "SELL" | "bullish" | "neutral" | "bearish";

const STYLES: Record<string, string> = {
  BUY: "bg-[var(--bull-dim)] text-[var(--bull)] ring-[var(--bull)]/30",
  bullish: "bg-[var(--bull-dim)] text-[var(--bull)] ring-[var(--bull)]/30",
  HOLD: "bg-[var(--warn-dim)] text-[var(--warn)] ring-[var(--warn)]/30",
  neutral: "bg-[var(--warn-dim)] text-[var(--warn)] ring-[var(--warn)]/30",
  SELL: "bg-[var(--bear-dim)] text-[var(--bear)] ring-[var(--bear)]/30",
  bearish: "bg-[var(--bear-dim)] text-[var(--bear)] ring-[var(--bear)]/30",
};

export function RatingPill({
  rating,
  size = "sm",
  className,
}: {
  rating: Rating;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const padding = {
    xs: "px-1.5 py-[1px] text-[10px]",
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-4 py-1.5 text-sm",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-mono font-semibold uppercase tracking-[0.08em] ring-1 ring-inset",
        STYLES[rating],
        padding,
        className,
      )}
    >
      {rating}
    </span>
  );
}
