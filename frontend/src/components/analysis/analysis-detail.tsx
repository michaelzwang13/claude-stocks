"use client";

import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  CalendarClock,
  Database,
  Layers,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  type AnalysisDetail as AnalysisDetailType,
  fetcher,
  type LogosResponse,
  type PerformanceSnapshot,
} from "@/lib/api";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RatingPill } from "@/components/ui/rating-pill";
import { Stat } from "@/components/ui/stat";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { FactorCard } from "./factor-card";
import { cn, formatPct, formatUSD, relativeTime, shortDate } from "@/lib/utils";

const INTERVAL_ORDER = ["1w", "1m", "3m", "6m", "1y"] as const;

export function AnalysisDetail({ data }: { data: AnalysisDetailType }) {
  const synth = data.synthesis;
  const [tab, setTab] = useState("thesis");

  const factorByName = Object.fromEntries(data.factors.map((f) => [f.factor, f]));
  const orderedFactors = ["valuation", "growth", "moat", "sentiment", "catalysts"]
    .map((n) => factorByName[n])
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <AnalysisHeader data={data} />

      <div className="grid gap-3 lg:grid-cols-5">
        {orderedFactors.map((f) => (
          <FactorCard key={f.factor} factor={f} />
        ))}
      </div>

      <Panel padding="none">
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="flex items-center gap-1 border-b border-[var(--border-1)] px-2 pt-2">
            <TabTrigger value="thesis"   icon={<Sparkles className="h-3.5 w-3.5" />}        label="Thesis" />
            <TabTrigger value="risks"    icon={<AlertTriangle className="h-3.5 w-3.5" />}   label="Risks & Catalysts" />
            <TabTrigger value="factors"  icon={<Layers className="h-3.5 w-3.5" />}          label="Per-factor" />
            <TabTrigger value="backtest" icon={<CalendarClock className="h-3.5 w-3.5" />}   label="Performance" />
            <TabTrigger value="cost"     icon={<Database className="h-3.5 w-3.5" />}        label="Cost & Usage" />
          </Tabs.List>

          <Tabs.Content value="thesis" className="px-6 py-6 focus:outline-none">
            <PanelHeader label="Thesis" hint="Synthesized from 5 factor analyses" />
            <p className="text-[15px] leading-relaxed text-[var(--text-1)]">
              <span className="serif-italic text-[var(--accent)]">{synth.thesis.split(".")[0]}.</span>{" "}
              {synth.thesis.split(".").slice(1).join(".").trim()}
            </p>
            {synth.spike_rationale && (
              <div className="mt-6 rounded-lg border border-[var(--border-1)] bg-[var(--bg-elev-2)]/40 p-4">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
                  Spike potential · {synth.spike_potential}
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{synth.spike_rationale}</p>
              </div>
            )}
          </Tabs.Content>

          <Tabs.Content value="risks" className="px-6 py-6 focus:outline-none">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <PanelHeader label="Risks" hint="What would invalidate the rating" />
                <ul className="space-y-2">
                  {synth.risks.map((r, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-[var(--text-2)]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--bear)]" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <PanelHeader label="Catalysts to watch" hint="Near-term events that could shift the view" />
                <ul className="space-y-2">
                  {synth.catalysts_to_watch.map((c, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-[var(--text-2)]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="factors" className="px-6 py-6 focus:outline-none">
            <div className="space-y-4">
              {orderedFactors.map((f) => (
                <div key={f.factor} className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-elev-2)]/30 p-5">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">{f.factor}</span>
                      <span className="font-mono text-xl tabular-nums text-[var(--text-1)]">{f.score.toFixed(1)}</span>
                      <RatingPill rating={f.rating} size="xs" />
                    </div>
                    <span className="font-mono text-[10px] uppercase text-[var(--text-3)]">confidence · {f.confidence}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{f.reasoning}</p>
                  <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
                    {f.key_points.map((kp, i) => (
                      <li key={i} className="flex gap-2 text-[12px] text-[var(--text-2)]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                        <span>{kp}</span>
                      </li>
                    ))}
                  </ul>
                  {f.data_gaps.length > 0 && (
                    <div className="mt-3 rounded border border-dashed border-[var(--warn)]/30 bg-[var(--warn-dim)]/30 px-3 py-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--warn)]">
                        Data gaps
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {f.data_gaps.map((g, i) => (
                          <li key={i} className="text-[11px] text-[var(--text-2)]">— {g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Tabs.Content>

          <Tabs.Content value="backtest" className="px-6 py-6 focus:outline-none">
            <PerformanceTable performance={data.performance} createdAt={data.created_at} entryPrice={data.entry_price} />
          </Tabs.Content>

          <Tabs.Content value="cost" className="px-6 py-6 focus:outline-none">
            <PanelHeader
              label="Cost & token usage"
              hint={`Factor: ${data.factor_model} · Synthesis: ${data.synthesis_model}`}
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Input"        value={data.total_input_tokens.toLocaleString()} />
              <Stat label="Output"       value={data.total_output_tokens.toLocaleString()} />
              <Stat label="Cache · read" value={data.total_cache_read_tokens.toLocaleString()} tone="accent" />
              <Stat label="Cache · write" value={data.total_cache_write_tokens.toLocaleString()} />
              <Stat label="Total cost"   value={formatUSD(data.total_cost_usd, { digits: 4 })} tone="accent" />
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </Panel>
    </div>
  );
}

function TabTrigger({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "group relative flex items-center gap-2 rounded-t-md px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)] outline-none transition-colors",
        "hover:text-[var(--text-1)]",
        "data-[state=active]:text-[var(--text-1)]",
      )}
    >
      <span className="opacity-70 group-data-[state=active]:opacity-100 group-data-[state=active]:text-[var(--accent)]">
        {icon}
      </span>
      <span>{label}</span>
      <span className="absolute inset-x-2 -bottom-px h-px bg-transparent group-data-[state=active]:bg-[var(--accent)]" />
    </Tabs.Trigger>
  );
}

function AnalysisHeader({ data }: { data: AnalysisDetailType }) {
  const { data: logos } = useSWR<LogosResponse>(
    `/api/logos?tickers=${encodeURIComponent(data.ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );
  const logoUrl = logos?.logos[data.ticker] ?? null;

  return (
    <Panel padding="lg" className="relative overflow-hidden">
      {/* tinted glow */}
      <div
        className="absolute -right-32 -top-32 h-72 w-72 rounded-full blur-3xl"
        style={{
          background:
            data.overall_rating === "BUY"
              ? "radial-gradient(circle, var(--bull-dim) 0%, transparent 70%)"
              : data.overall_rating === "SELL"
                ? "radial-gradient(circle, var(--bear-dim) 0%, transparent 70%)"
                : "radial-gradient(circle, var(--warn-dim) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-4">
            <TickerLogo ticker={data.ticker} src={logoUrl} size={56} />
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-[44px] font-semibold leading-none tracking-tight text-[var(--text-1)]">
                {data.ticker}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-3)]">
                {shortDate(data.created_at)} · {relativeTime(data.created_at)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <RatingPill rating={data.overall_rating} size="md" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">
              Conviction · {data.confidence}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">
              Spike · {data.spike_potential}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <Stat label="Overall score" value={data.overall_score.toFixed(1)} hint="out of 10"
            tone={data.overall_rating === "BUY" ? "bull" : data.overall_rating === "SELL" ? "bear" : "warn"} />
          <Stat label="Entry price" value={formatUSD(data.entry_price)} hint="at analysis time" />
          <Stat label="Cost"        value={formatUSD(data.total_cost_usd, { digits: 4 })} hint="API spend" />
        </div>
      </div>
    </Panel>
  );
}

function PerformanceTable({
  performance,
  createdAt,
  entryPrice,
}: {
  performance: PerformanceSnapshot[];
  createdAt: string;
  entryPrice: number;
}) {
  const map = Object.fromEntries(performance.map((p) => [p.interval, p]));
  const created = new Date(createdAt);
  const intervals = { "1w": 7, "1m": 30, "3m": 90, "6m": 182, "1y": 365 } as const;

  return (
    <div>
      <PanelHeader
        label="Forward performance"
        hint={`Entry ${formatUSD(entryPrice)} · vs. SPY benchmark`}
      />
      <div className="overflow-hidden rounded-lg border border-[var(--border-1)]">
        <table className="w-full font-mono text-[12px]">
          <thead className="bg-[var(--bg-elev-2)]/50">
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
              <th className="px-4 py-2.5 font-normal">Interval</th>
              <th className="px-4 py-2.5 font-normal">Status</th>
              <th className="px-4 py-2.5 font-normal text-right">Ticker return</th>
              <th className="px-4 py-2.5 font-normal text-right">SPY return</th>
              <th className="px-4 py-2.5 font-normal text-right">Alpha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-1)]">
            {(INTERVAL_ORDER as readonly string[]).map((iv) => {
              const snap = map[iv];
              const target = new Date(created.getTime() + intervals[iv as keyof typeof intervals] * 86400 * 1000);
              const elapsed = !!snap && snap.return_pct !== null;
              const daysUntil = Math.ceil((target.getTime() - Date.now()) / 86400000);
              return (
                <tr key={iv} className="hover:bg-[var(--bg-elev-1)]/50">
                  <td className="px-4 py-2.5 uppercase tracking-wider text-[var(--text-2)]">{iv}</td>
                  <td className="px-4 py-2.5">
                    {elapsed ? (
                      <span className="text-[var(--text-3)]">filled</span>
                    ) : daysUntil > 0 ? (
                      <span className="text-[var(--text-3)]">pending · {daysUntil}d</span>
                    ) : (
                      <span className="text-[var(--warn)]">awaiting refresh</span>
                    )}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", elapsed ? (snap!.return_pct! >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]") : "text-[var(--text-4)]")}>
                    {elapsed ? formatPct(snap!.return_pct) : "—"}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", elapsed ? (snap!.spy_return_pct! >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]") : "text-[var(--text-4)]")}>
                    {elapsed ? formatPct(snap!.spy_return_pct) : "—"}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold", elapsed ? (snap!.alpha_pct! >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]") : "text-[var(--text-4)]")}>
                    {elapsed ? formatPct(snap!.alpha_pct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
