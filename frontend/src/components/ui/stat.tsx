import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  align = "left",
  mono = true,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "bull" | "bear" | "warn" | "accent";
  align?: "left" | "right" | "center";
  mono?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "bull"
      ? "text-[var(--bull)]"
      : tone === "bear"
        ? "text-[var(--bear)]"
        : tone === "warn"
          ? "text-[var(--warn)]"
          : tone === "accent"
            ? "text-[var(--accent)]"
            : "text-[var(--text-1)]";
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "right" && "items-end text-right",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
        {label}
      </span>
      <span className={cn("text-xl leading-none", mono && "font-mono tabular-nums", toneClass)}>
        {value}
      </span>
      {hint && (
        <span className="font-mono text-[11px] text-[var(--text-3)]">{hint}</span>
      )}
    </div>
  );
}
