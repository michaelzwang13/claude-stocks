"use client";

import { Activity, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { FactorOutput } from "@/lib/api";
import { Panel } from "@/components/ui/panel";
import { ScoreBar } from "@/components/ui/score-bar";
import { cn } from "@/lib/utils";

const FACTOR_META: Record<string, { label: string; sublabel: string }> = {
  valuation:  { label: "VALUATION",  sublabel: "Multiple discipline" },
  growth:     { label: "GROWTH",     sublabel: "Revenue & earnings" },
  moat:       { label: "MOAT",       sublabel: "Competitive position" },
  sentiment:  { label: "SENTIMENT",  sublabel: "News momentum" },
  catalysts:  { label: "CATALYSTS",  sublabel: "Spike potential" },
};

export function FactorCard({
  factor,
  pending,
}: {
  factor?: FactorOutput;
  pending?: { factor: string };
}) {
  if (pending) {
    const meta = FACTOR_META[pending.factor];
    return (
      <Panel className="relative h-full overflow-hidden" padding="md">
        <div className="absolute left-0 top-0 h-[2px] w-full overflow-hidden">
          <div className="absolute h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent" style={{ animation: "shimmer 1.4s linear infinite" }} />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
          {meta?.label ?? pending.factor.toUpperCase()}
        </div>
        <div className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{meta?.sublabel}</div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="font-mono text-3xl text-[var(--text-4)]">—.—</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
          <Activity className="h-3 w-3 animate-pulse" />
          <span>Analyzing…</span>
        </div>
        <div className="mt-4 h-[3px] rounded-full bg-[var(--border-1)]" />
        <div className="mt-3 space-y-1.5">
          <div className="h-2 w-3/4 rounded shimmer" />
          <div className="h-2 w-1/2 rounded shimmer" />
        </div>
      </Panel>
    );
  }

  if (!factor) return null;
  const meta = FACTOR_META[factor.factor];

  const RatingIcon =
    factor.rating === "bullish" ? TrendingUp : factor.rating === "bearish" ? TrendingDown : Minus;
  const ratingColor =
    factor.rating === "bullish"
      ? "text-[var(--bull)]"
      : factor.rating === "bearish"
        ? "text-[var(--bear)]"
        : "text-[var(--warn)]";
  const scoreColor =
    factor.score >= 7
      ? "text-[var(--bull)]"
      : factor.score >= 4
        ? "text-[var(--warn)]"
        : "text-[var(--bear)]";

  return (
    <Panel className="group relative h-full overflow-hidden transition-colors hover:border-[var(--border-2)]" padding="md">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
            {meta?.label ?? factor.factor.toUpperCase()}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{meta?.sublabel}</div>
        </div>
        <RatingIcon className={cn("h-4 w-4", ratingColor)} strokeWidth={2.5} />
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className={cn("font-mono text-3xl font-medium leading-none tabular-nums", scoreColor)}>
          {factor.score.toFixed(1)}
        </span>
        <span className="font-mono text-xs text-[var(--text-4)]">/10</span>
      </div>

      <div className="mt-4">
        <ScoreBar score={factor.score} />
      </div>

      <div className="mt-3 line-clamp-2 text-[12px] leading-snug text-[var(--text-2)]">
        {factor.key_points[0]}
      </div>

      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
        <span className={cn("flex items-center gap-1", ratingColor)}>
          {factor.rating}
        </span>
        <span className="text-[var(--text-4)]">conf · {factor.confidence}</span>
      </div>
    </Panel>
  );
}
