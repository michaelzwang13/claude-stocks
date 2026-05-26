"use client";

import { RefreshCw, TrendingUp } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import {
  type BacktestAggregates,
  fetcher,
  refreshBacktest,
} from "@/lib/api";
import { cn, formatPct, formatUSD, relativeTime } from "@/lib/utils";

const INTERVALS = ["1w", "1m", "3m", "6m", "1y"] as const;
const FACTORS = ["valuation", "growth", "moat", "sentiment", "catalysts"] as const;

export default function BacktestPage() {
  const { data, isLoading, mutate } = useSWR<BacktestAggregates>(
    "/api/backtest/aggregates",
    fetcher,
  );
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshBacktest();
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell context="Backtest · forward-tracked">
      <div className="mx-auto max-w-7xl p-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-[28px] font-semibold leading-tight text-[var(--text-1)]">
              Backtest dashboard<span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-1 text-[14px] text-[var(--text-3)]">
              Forward-tracked returns vs. SPY benchmark · last refresh{" "}
              {data?.last_refresh_at ? relativeTime(data.last_refresh_at) : "—"}
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh now
          </Button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            label="Total analyses"
            value={data ? String(data.totals.analyses) : "—"}
            hint="All-time"
            tone="default"
          />
          <KpiTile
            label="BUY hit rate"
            value={data?.totals.buy_hit_rate !== null && data?.totals.buy_hit_rate !== undefined
              ? `${data.totals.buy_hit_rate.toFixed(0)}%`
              : "—"}
            hint={data?.totals.buy_n ? `N=${data.totals.buy_n}` : "no filled snapshots"}
            tone="bull"
          />
          <KpiTile
            label="BUY avg α vs SPY"
            value={data?.totals.buy_avg_alpha !== null && data?.totals.buy_avg_alpha !== undefined
              ? formatPct(data.totals.buy_avg_alpha)
              : "—"}
            hint="across all intervals"
            tone={data?.totals.buy_avg_alpha !== null && data?.totals.buy_avg_alpha !== undefined
              ? data.totals.buy_avg_alpha >= 0 ? "bull" : "bear"
              : "default"}
          />
          <KpiTile
            label="Total API spend"
            value={data ? formatUSD(data.totals.total_cost_usd) : "—"}
            hint="all-time"
            tone="default"
          />
        </div>

        {/* By-rating table */}
        <Panel padding="none">
          <div className="border-b border-[var(--border-1)] px-6 py-4">
            <PanelHeader label="Performance by rating × interval" hint="Hit rate = % positive returns. α = return vs SPY." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[12px]">
              <thead className="bg-[var(--bg-elev-2)]/40 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-2.5 font-normal">Rating</th>
                  <th className="px-4 py-2.5 font-normal">Interval</th>
                  <th className="px-4 py-2.5 font-normal text-right">N</th>
                  <th className="px-4 py-2.5 font-normal text-right">Avg return</th>
                  <th className="px-4 py-2.5 font-normal text-right">Avg α</th>
                  <th className="px-4 py-2.5 font-normal text-right">Hit %</th>
                  <th className="px-4 py-2.5 font-normal text-right">Hit vs SPY %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="p-3">
                        <div className="h-4 rounded shimmer" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && data && data.by_rating.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[12px] text-[var(--text-3)]">
                      No filled snapshots yet. The 1w window starts producing data a week after your first analysis.
                    </td>
                  </tr>
                )}
                {data?.by_rating.map((r, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-elev-1)]/40">
                    <td className="px-4 py-2.5">
                      <RatingChip rating={r.rating} />
                    </td>
                    <td className="px-4 py-2.5 uppercase text-[var(--text-2)]">{r.interval}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-2)]">{r.n}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", r.avg_return_pct >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]")}>{formatPct(r.avg_return_pct)}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold", r.avg_alpha_pct >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]")}>{formatPct(r.avg_alpha_pct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-2)]">{r.hit_pct.toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-2)]">{r.hit_vs_spy_pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Factor predictiveness */}
        <Panel padding="lg">
          <PanelHeader
            label="Per-factor predictiveness"
            hint="Avg α at 1m interval grouped by factor-score bucket. High = score ≥ 7."
            right={<TrendingUp className="h-4 w-4 text-[var(--text-3)]" />}
          />
          <FactorChart by_factor={data?.by_factor ?? []} />
        </Panel>
      </div>
    </AppShell>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "default" | "bull" | "bear";
}) {
  return (
    <Panel padding="md" className="relative overflow-hidden">
      <div
        className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl"
        style={{
          background:
            tone === "bull"
              ? "radial-gradient(circle, var(--bull-dim) 0%, transparent 70%)"
              : tone === "bear"
                ? "radial-gradient(circle, var(--bear-dim) 0%, transparent 70%)"
                : "radial-gradient(circle, var(--accent-dim) 0%, transparent 70%)",
        }}
      />
      <div className="relative">
        <Stat label={label} value={value} hint={hint} tone={tone === "bull" ? "bull" : tone === "bear" ? "bear" : "default"} />
      </div>
    </Panel>
  );
}

function RatingChip({ rating }: { rating: string }) {
  const cls =
    rating === "BUY"
      ? "text-[var(--bull)] bg-[var(--bull-dim)] ring-[var(--bull)]/30"
      : rating === "SELL"
        ? "text-[var(--bear)] bg-[var(--bear-dim)] ring-[var(--bear)]/30"
        : "text-[var(--warn)] bg-[var(--warn-dim)] ring-[var(--warn)]/30";
  return (
    <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset", cls)}>
      {rating}
    </span>
  );
}

function FactorChart({
  by_factor,
}: {
  by_factor: BacktestAggregates["by_factor"];
}) {
  // Pivot to one row per factor with three numeric columns (high/mid/low avg alpha at 1m).
  const data = FACTORS.map((f) => {
    const subset = by_factor.filter((b) => b.factor === f && b.interval === "1m");
    const get = (bucket: "high" | "mid" | "low") =>
      subset.find((s) => s.bucket === bucket)?.avg_alpha_pct ?? null;
    return {
      factor: f.charAt(0).toUpperCase() + f.slice(1),
      high: get("high"),
      mid: get("mid"),
      low: get("low"),
    };
  });

  const hasData = data.some((d) => d.high !== null || d.mid !== null || d.low !== null);
  if (!hasData) {
    return (
      <div className="grid h-48 place-items-center font-mono text-[12px] text-[var(--text-3)]">
        Not enough filled snapshots yet to bucket by factor score.
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="var(--border-1)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="factor" tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={{ stroke: "var(--border-2)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            cursor={{ fill: "var(--bg-elev-2)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--bg-elev-2)",
              border: "1px solid var(--border-2)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--text-3)" }}
            formatter={(v) => (typeof v === "number" ? `${v.toFixed(2)}%` : v)}
          />
          <ReferenceLine y={0} stroke="var(--border-3)" />
          <Bar dataKey="high" fill="var(--bull)" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} />
            ))}
          </Bar>
          <Bar dataKey="mid" fill="var(--warn)" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="low" fill="var(--bear)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
