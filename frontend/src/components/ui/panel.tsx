import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export function Panel({
  children,
  className,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  const p = { none: "", sm: "p-3", md: "p-5", lg: "p-7" }[padding];
  return (
    <div
      className={cn(
        "card-glow relative rounded-lg border border-[var(--border-1)] bg-[var(--bg-elev-1)]/80 backdrop-blur-sm",
        p,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  label,
  hint,
  right,
  className,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
          {label}
        </div>
        {hint && <div className="mt-1 text-[12px] text-[var(--text-3)]">{hint}</div>}
      </div>
      {right}
    </div>
  );
}
