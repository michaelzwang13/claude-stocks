import { cn } from "@/lib/utils";

export function ScoreBar({
  score,
  className,
  showValue = false,
}: {
  score: number;
  className?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const color =
    score >= 7 ? "var(--bull)" : score >= 4 ? "var(--warn)" : "var(--bear)";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--border-1)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
        {/* tick marks */}
        {[3, 5, 7].map((v) => (
          <div
            key={v}
            className="absolute top-0 h-full w-px bg-[var(--border-2)]"
            style={{ left: `${(v / 10) * 100}%` }}
          />
        ))}
      </div>
      {showValue && (
        <span className="font-mono text-xs tabular-nums text-[var(--text-2)]">
          {score.toFixed(1)}
        </span>
      )}
    </div>
  );
}
