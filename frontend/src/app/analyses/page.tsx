"use client";

import { ArrowDown, ArrowUp, Filter, Info, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/shell/app-shell";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { RatingPill } from "@/components/ui/rating-pill";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  type BacktestAggregates,
  type CurrentQuotesResponse,
  fetcher,
  type LogosResponse,
  type Rating,
} from "@/lib/api";
import { cn, formatPct, formatUSD, relativeTime, shortDate } from "@/lib/utils";

type Row = BacktestAggregates["per_analysis"][number];
type SortKey = "created_at" | "ticker" | "overall_score" | "r_1w" | "r_1m" | "r_3m" | "r_6m" | "r_1y";

const QUOTE_DISCLAIMER =
  "Live quote from yfinance (free tier). Cached 15 min server-side and may be delayed 15–30 min vs the real market. Not for trading decisions.";

const ALPHA_EXPLAINER =
  "α 1W = ticker return minus SPY return over the 1 week after the analysis. Positive means it beat SPY.";

const RATING_FILTERS: { label: string; value: Rating | "ALL" }[] = [
  { label: "All",  value: "ALL"  },
  { label: "Buy",  value: "BUY"  },
  { label: "Hold", value: "HOLD" },
  { label: "Sell", value: "SELL" },
];

const SORT_STORAGE_KEY = "claude-stocks:analyses-sort";

type SortState = { key: SortKey; dir: "asc" | "desc" };
const DEFAULT_SORT: SortState = { key: "created_at", dir: "desc" };

function isValidSortKey(v: unknown): v is SortKey {
  return (
    v === "created_at" || v === "ticker" || v === "overall_score" ||
    v === "r_1w" || v === "r_1m" || v === "r_3m" || v === "r_6m" || v === "r_1y"
  );
}

export default function PastAnalysesPage() {
  const { data, isLoading } = useSWR<BacktestAggregates>(
    "/api/backtest/aggregates",
    fetcher,
  );

  const tickersParam = useMemo(() => {
    if (!data) return null;
    const unique = Array.from(new Set(data.per_analysis.map((r) => r.ticker))).sort();
    return unique.length ? unique.join(",") : null;
  }, [data]);

  const { data: quotes } = useSWR<CurrentQuotesResponse>(
    tickersParam ? `/api/quotes/current?tickers=${encodeURIComponent(tickersParam)}` : null,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  );

  // Logos: 30-day server cache, so revalidate sparingly on the client too.
  const { data: logos } = useSWR<LogosResponse>(
    tickersParam ? `/api/logos?tickers=${encodeURIComponent(tickersParam)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );

  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<Rating | "ALL">("ALL");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  // Hydrate sort from sessionStorage on mount. The persist effect must skip
  // its first invocation so it cannot overwrite a saved value with
  // DEFAULT_SORT before the hydrated state lands. Using `useRef` (not the
  // hydrate effect itself) to gate, so StrictMode's double-invoke can't race.
  const skipNextPersist = useRef(true);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SortState>;
        if (isValidSortKey(parsed.key) && (parsed.dir === "asc" || parsed.dir === "desc")) {
          setSort({ key: parsed.key, dir: parsed.dir });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {}
  }, [sort]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data.per_analysis.filter((r) => {
      if (ratingFilter !== "ALL" && r.overall_rating !== ratingFilter) return false;
      if (search && !r.ticker.includes(search.toUpperCase())) return false;
      return true;
    });
    rows.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const an = av === null || av === undefined ? -Infinity : av;
      const bn = bv === null || bv === undefined ? -Infinity : bv;
      if (typeof an === "string" && typeof bn === "string") {
        return sort.dir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      return sort.dir === "asc" ? (an as number) - (bn as number) : (bn as number) - (an as number);
    });
    return rows;
  }, [data, search, ratingFilter, sort]);

  function toggleSort(k: SortKey) {
    setSort((prev) =>
      prev.key === k
        ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: "desc" },
    );
  }

  return (
    <AppShell context="Past analyses">
      <TooltipProvider>
      <div className="mx-auto max-w-[1400px] p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-[28px] font-semibold leading-tight text-[var(--text-1)]">
              Past analyses<span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-1 text-[14px] text-[var(--text-3)]">
              {data ? `${data.per_analysis.length} total · forward-tracked vs. SPY` : "Loading…"}
            </p>
          </div>
          <Link
            href="/analyze"
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--bg-base)] hover:brightness-110"
          >
            New analysis
          </Link>
        </div>

        <Panel padding="none" className="overflow-hidden">
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-1)] p-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value.toUpperCase())}
                placeholder="filter by ticker"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] p-1">
              <Filter className="ml-1.5 h-3 w-3 text-[var(--text-3)]" />
              {RATING_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setRatingFilter(f.value)}
                  className={cn(
                    "rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors cursor-pointer",
                    ratingFilter === f.value
                      ? "bg-[var(--bg-elev-2)] text-[var(--text-1)]"
                      : "text-[var(--text-3)] hover:text-[var(--text-2)]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[12px]">
              <thead className="bg-[var(--bg-elev-2)]/40">
                <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                  <Th label="When"     sortable sortKey="created_at"   currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} />
                  <Th label="Ticker"   sortable sortKey="ticker"       currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} />
                  <Th label="Rating" />
                  <Th label="Score"    sortable sortKey="overall_score" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="Entry"    align="right" />
                  <Th
                    label="Now"
                    align="right"
                    tooltip={QUOTE_DISCLAIMER}
                  />
                  <Th label="1W"       sortable sortKey="r_1w" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="1M"       sortable sortKey="r_1m" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="3M"       sortable sortKey="r_3m" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="6M"       sortable sortKey="r_6m" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="1Y"       sortable sortKey="r_1y" currentKey={sort.key} currentDir={sort.dir} onSort={toggleSort} align="right" />
                  <Th label="α 1W"     align="right" tooltip={ALPHA_EXPLAINER} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={12} className="p-3">
                        <div className="h-5 rounded shimmer" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-10 text-center font-mono text-[12px] text-[var(--text-3)]">
                      No analyses match the current filters.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <AnalysisRow
                    key={r.id}
                    row={r}
                    currentPrice={quotes?.quotes[r.ticker]?.price ?? null}
                    logoUrl={logos?.logos[r.ticker] ?? null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      </TooltipProvider>
    </AppShell>
  );
}

function Th({
  label,
  align = "left",
  sortable,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  tooltip,
}: {
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortKey?: SortKey;
  currentKey?: SortKey;
  currentDir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
  tooltip?: string;
}) {
  const active = sortable && sortKey === currentKey;
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-normal",
        align === "right" && "text-right",
        sortable && "cursor-pointer select-none hover:text-[var(--text-1)]",
      )}
      onClick={sortable && sortKey ? () => onSort?.(sortKey) : undefined}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        <span className={active ? "text-[var(--accent)]" : ""}>{label}</span>
        {active && (currentDir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
        {tooltip && (
          <Tooltip content={tooltip}>
            <Info
              className="h-2.5 w-2.5 text-[var(--text-4)] hover:text-[var(--text-2)] cursor-help"
              aria-label={tooltip}
            />
          </Tooltip>
        )}
      </span>
    </th>
  );
}

function AnalysisRow({
  row,
  currentPrice,
  logoUrl,
}: {
  row: Row;
  currentPrice: number | null;
  logoUrl: string | null;
}) {
  const pctSinceEntry =
    currentPrice !== null ? (currentPrice / row.entry_price - 1) * 100 : null;
  return (
    <tr className="group relative transition-colors hover:bg-[var(--bg-elev-2)]/40">
      <td className="px-3 py-2.5">
        <Link href={`/analyses/${row.id}`} className="absolute inset-0" />
        <div className="text-[var(--text-2)]">{shortDate(row.created_at)}</div>
        <div className="text-[10px] text-[var(--text-4)]">{relativeTime(row.created_at)}</div>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-2">
          <TickerLogo ticker={row.ticker} src={logoUrl} size={20} />
          <span className="font-semibold text-[var(--text-1)]">{row.ticker}</span>
        </span>
      </td>
      <td className="px-3 py-2.5">
        <RatingPill rating={row.overall_rating} size="xs" />
      </td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums",
        row.overall_score >= 7 ? "text-[var(--bull)]" : row.overall_score >= 4 ? "text-[var(--warn)]" : "text-[var(--bear)]"
      )}>
        {row.overall_score.toFixed(1)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-2)]">
        {formatUSD(row.entry_price)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {currentPrice === null ? (
          <span className="text-[var(--text-4)]">—</span>
        ) : (
          <div className="relative z-10 inline-flex flex-col items-end leading-tight">
            <span className="text-[var(--text-1)]">{formatUSD(currentPrice)}</span>
            <span
              className={cn(
                "text-[10px]",
                pctSinceEntry === null
                  ? "text-[var(--text-4)]"
                  : pctSinceEntry >= 0
                    ? "text-[var(--bull)]"
                    : "text-[var(--bear)]",
              )}
            >
              {formatPct(pctSinceEntry)}
            </span>
          </div>
        )}
      </td>
      <ReturnCell value={row.r_1w} />
      <ReturnCell value={row.r_1m} />
      <ReturnCell value={row.r_3m} />
      <ReturnCell value={row.r_6m} />
      <ReturnCell value={row.r_1y} />
      <td className={cn("px-3 py-2.5 text-right tabular-nums",
        row.a_1w === null ? "text-[var(--text-4)]" : row.a_1w >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]")}>
        {row.a_1w === null ? "—" : formatPct(row.a_1w)}
      </td>
    </tr>
  );
}

function ReturnCell({ value }: { value: number | null }) {
  if (value === null) return <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-4)]">—</td>;
  return (
    <td className={cn("px-3 py-2.5 text-right tabular-nums", value >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]")}>
      {formatPct(value)}
    </td>
  );
}
