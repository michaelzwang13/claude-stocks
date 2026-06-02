"use client";

import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RatingPill } from "@/components/ui/rating-pill";
import { TickerLogo } from "@/components/ui/ticker-logo";
import {
  type AnalysisDetail as AnalysisDetailType,
  type CurrentQuotesResponse,
  fetcher,
  type FactorName,
  type LogosResponse,
  type TickerSeriesPoint,
  type TickerSeriesResponse,
} from "@/lib/api";
import { cn, formatPct, formatUSD, shortDate } from "@/lib/utils";

const FACTOR_NAMES: FactorName[] = ["valuation", "growth", "moat", "sentiment", "catalysts"];

// Distinct, accessible-ish hues that read well on dark.
const FACTOR_COLORS: Record<FactorName, string> = {
  valuation: "#7dd3fc",   // sky
  growth:    "#86efac",   // green
  moat:      "#c4b5fd",   // violet
  sentiment: "#fde047",   // amber
  catalysts: "#f9a8d4",   // pink
};

const RATING_COLORS = {
  BUY:  "var(--bull)",
  HOLD: "var(--warn)",
  SELL: "var(--bear)",
} as const;

type ChartMode = "overall" | "factors";

export default function TickerTrendPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = use(params);
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  const { data: series, isLoading } = useSWR<TickerSeriesResponse>(
    `/api/tickers/${encodeURIComponent(ticker)}/series`,
    fetcher,
  );
  const { data: logos } = useSWR<LogosResponse>(
    `/api/logos?tickers=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );
  const { data: quotes } = useSWR<CurrentQuotesResponse>(
    `/api/quotes/current?tickers=${encodeURIComponent(ticker)}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  );

  const points = series?.points ?? [];
  const logoUrl = logos?.logos[ticker] ?? null;
  const currentPrice = quotes?.quotes[ticker]?.price ?? null;

  return (
    <AppShell context={`Trend · ${ticker}`}>
      <div className="mx-auto max-w-[1400px] p-8">
        <Header
          ticker={ticker}
          logoUrl={logoUrl}
          currentPrice={currentPrice}
          count={points.length}
        />

        {isLoading && (
          <Panel padding="lg" className="mt-6">
            <div className="h-32 rounded shimmer" />
          </Panel>
        )}

        {!isLoading && points.length === 0 && (
          <Panel padding="lg" className="mt-6 text-center">
            <p className="font-mono text-[13px] text-[var(--text-3)]">
              No analyses for {ticker} yet.
            </p>
            <Link
              href={`/analyze?ticker=${encodeURIComponent(ticker)}`}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--accent)] hover:underline"
            >
              <Sparkles className="h-3 w-3" />
              Run the first one →
            </Link>
          </Panel>
        )}

        {points.length > 0 && (
          <TrendBody ticker={ticker} points={points} />
        )}
      </div>
    </AppShell>
  );
}

function Header({
  ticker,
  logoUrl,
  currentPrice,
  count,
}: {
  ticker: string;
  logoUrl: string | null;
  currentPrice: number | null;
  count: number;
}) {
  return (
    <Panel padding="lg" className="relative overflow-hidden">
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <TickerLogo ticker={ticker} src={logoUrl} size={56} />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[44px] font-semibold leading-none tracking-tight text-[var(--text-1)]">
              {ticker}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-3)]">
              {count} {count === 1 ? "analysis" : "analyses"} on record
              {currentPrice !== null && ` · now ${formatUSD(currentPrice)}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/analyses?ticker=${encodeURIComponent(ticker)}`}>
            <Button variant="ghost" size="sm">
              View rows
            </Button>
          </Link>
          <Link href={`/analyze?ticker=${encodeURIComponent(ticker)}`}>
            <Button variant="primary" size="sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-analyze
            </Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
}

function TrendBody({ ticker, points }: { ticker: string; points: TickerSeriesPoint[] }) {
  const [mode, setMode] = useState<ChartMode>("overall");
  const [selectedId, setSelectedId] = useState<number>(points[points.length - 1].id);

  const selected = points.find((p) => p.id === selectedId) ?? points[points.length - 1];
  const idx = points.findIndex((p) => p.id === selected.id);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        id: p.id,
        date: p.created_at,
        dateLabel: shortDate(p.created_at),
        overall: p.overall_score,
        rating: p.overall_rating,
        ...p.factor_scores,
      })),
    [points],
  );

  return (
    <div className="mt-6 space-y-6">
      <Panel padding="md">
        <div className="mb-3 flex items-center justify-between">
          <PanelHeader
            label="Rating timeline"
            hint="Each dot is one analysis · click to read the reasoning"
            className="mb-0"
          />
        </div>
        <RatingTimeline
          points={points}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
      </Panel>

      <Panel padding="md">
        <div className="mb-4 flex items-start justify-between gap-4">
          <PanelHeader
            label={mode === "overall" ? "Overall score over time" : "Factor scores over time"}
            hint={mode === "overall" ? "0–10 · click a point to inspect" : "5 lines · valuation, growth, moat, sentiment, catalysts"}
            className="mb-0"
          />
          <div className="flex items-center gap-1 rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] p-1">
            <ModeButton active={mode === "overall"} onClick={() => setMode("overall")}>
              Overall
            </ModeButton>
            <ModeButton active={mode === "factors"} onClick={() => setMode("factors")}>
              Factors
            </ModeButton>
          </div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                stroke="var(--border-2)"
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                stroke="var(--border-2)"
              />
              <RTooltip
                contentStyle={{
                  backgroundColor: "var(--bg-elev-3)",
                  border: "1px solid var(--border-2)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
                labelStyle={{ color: "var(--text-2)" }}
              />
              {mode === "overall" ? (
                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall score"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ) : (
                <>
                  <Legend
                    wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 10, paddingTop: 4 }}
                  />
                  {FACTOR_NAMES.map((f) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      name={f}
                      stroke={FACTOR_COLORS[f]}
                      strokeWidth={1.5}
                      dot={{ r: 2.5 }}
                    />
                  ))}
                </>
              )}
              <ReferenceLine
                x={shortDate(selected.created_at)}
                stroke="var(--accent)"
                strokeDasharray="2 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <ReasoningStepper
        ticker={ticker}
        points={points}
        index={idx}
        onChangeIndex={(i) => setSelectedId(points[i].id)}
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors cursor-pointer",
        active
          ? "bg-[var(--bg-elev-2)] text-[var(--text-1)]"
          : "text-[var(--text-3)] hover:text-[var(--text-2)]",
      )}
    >
      {children}
    </button>
  );
}

function RatingTimeline({
  points,
  selectedId,
  onSelect,
}: {
  points: TickerSeriesPoint[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  if (points.length === 1) {
    return (
      <div className="flex items-center justify-center py-2">
        <DotButton point={points[0]} active={true} onClick={() => onSelect(points[0].id)} />
      </div>
    );
  }
  return (
    <div className="relative flex items-center py-2">
      <div className="absolute left-2 right-2 top-1/2 h-px bg-[var(--border-2)]" />
      <div className="relative flex w-full items-center justify-between">
        {points.map((p) => (
          <DotButton
            key={p.id}
            point={p}
            active={p.id === selectedId}
            onClick={() => onSelect(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DotButton({
  point,
  active,
  onClick,
}: {
  point: TickerSeriesPoint;
  active: boolean;
  onClick: () => void;
}) {
  const color = RATING_COLORS[point.overall_rating];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1 cursor-pointer"
      aria-label={`${point.overall_rating} · ${point.overall_score.toFixed(1)} on ${shortDate(point.created_at)}`}
      aria-pressed={active}
    >
      <span
        className={cn(
          "block h-3 w-3 rounded-full ring-2 transition-all",
          active ? "h-4 w-4 ring-[var(--bg-base)]" : "ring-[var(--bg-elev-1)] group-hover:ring-[var(--accent)]",
        )}
        style={{ backgroundColor: color, boxShadow: active ? `0 0 12px ${color}` : undefined }}
      />
      <span
        className={cn(
          "font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
          active ? "text-[var(--text-1)]" : "text-[var(--text-4)] group-hover:text-[var(--text-2)]",
        )}
      >
        {shortDate(point.created_at)}
      </span>
    </button>
  );
}

function ReasoningStepper({
  ticker,
  points,
  index,
  onChangeIndex,
}: {
  ticker: string;
  points: TickerSeriesPoint[];
  index: number;
  onChangeIndex: (i: number) => void;
}) {
  const selected = points[index];
  const { data: detail } = useSWR<AnalysisDetailType>(
    `/api/analyses/${selected.id}`,
    fetcher,
  );

  return (
    <Panel padding="md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChangeIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="h-3 w-3" />
          Prev
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <RatingPill rating={selected.overall_rating} size="sm" />
            <span className="font-mono text-[16px] tabular-nums text-[var(--text-1)]">
              {selected.overall_score.toFixed(1)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
              · {shortDate(selected.created_at)}
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-4)]">
            Analysis {index + 1} of {points.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChangeIndex(Math.min(points.length - 1, index + 1))}
          disabled={index === points.length - 1}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Factor strip */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {FACTOR_NAMES.map((f) => {
          const score = selected.factor_scores[f];
          return (
            <div
              key={f}
              className="rounded-md border border-[var(--border-1)] bg-[var(--bg-elev-2)]/30 px-3 py-2"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                {f}
              </div>
              <div
                className="mt-0.5 font-mono text-[16px] tabular-nums"
                style={{ color: FACTOR_COLORS[f] }}
              >
                {score === undefined ? "—" : score.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Thesis */}
      <div className="rounded-md border border-[var(--border-1)] bg-[var(--bg-elev-2)]/30 p-4">
        {detail ? (
          <>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
              Thesis
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-1)]">
              <span className="serif-italic text-[var(--accent)]">
                {detail.thesis.split(".")[0]}.
              </span>{" "}
              {detail.thesis.split(".").slice(1).join(".").trim()}
            </p>
            <Link
              href={`/analyses/${selected.id}`}
              className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open full analysis
            </Link>
          </>
        ) : (
          <div className="h-16 rounded shimmer" />
        )}
      </div>
    </Panel>
  );
}
