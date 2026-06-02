"use client";

import { Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { SellDialog } from "@/components/portfolio/sell-dialog";
import {
  deletePurchase,
  fetcher,
  type LogosResponse,
  type PortfolioStats,
  type Purchase,
  type PurchasesResponse,
} from "@/lib/api";
import { cn, formatPct, formatUSD, shortDate } from "@/lib/utils";

const ALPHA_TOOLTIP =
  "Position return minus SPY return over the same window (buy → today for open, buy → sell for closed). Positive means you beat just holding SPY.";

const QUOTE_TOOLTIP =
  "Live quote from yfinance (free tier). Cached 15 min server-side and may be delayed 15–30 min. Not for trading decisions.";

export default function PortfolioPage() {
  const { data, isLoading, mutate } = useSWR<PurchasesResponse>(
    "/api/purchases",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  );

  const tickersParam = useMemo(() => {
    if (!data) return null;
    const unique = Array.from(new Set(data.purchases.map((p) => p.ticker))).sort();
    return unique.length ? unique.join(",") : null;
  }, [data]);

  const { data: logos } = useSWR<LogosResponse>(
    tickersParam ? `/api/logos?tickers=${encodeURIComponent(tickersParam)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );

  const open = data?.purchases.filter((p) => p.status === "open") ?? [];
  const closed = data?.purchases.filter((p) => p.status === "closed") ?? [];
  const stats = data?.stats;

  async function onDelete(id: number) {
    if (!confirm("Delete this lot entirely?")) return;
    await deletePurchase(id);
    await mutate();
  }

  return (
    <AppShell context="Portfolio">
      <TooltipProvider>
        <div className="mx-auto max-w-[1400px] p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-mono text-[28px] font-semibold leading-tight text-[var(--text-1)]">
                Portfolio<span className="text-[var(--accent)]">.</span>
              </h1>
              <p className="mt-1 text-[14px] text-[var(--text-3)]">
                {data
                  ? `${open.length} open · ${closed.length} closed · live P&L`
                  : "Loading…"}
              </p>
            </div>
          </div>

          {/* Top totals strip */}
          {stats && (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TotalCard
                label="Open P&L"
                value={formatUSD(stats.unrealized_pnl_usd, { sign: true })}
                tone={stats.unrealized_pnl_usd >= 0 ? "bull" : "bear"}
                hint="unrealized · open lots only"
              />
              <TotalCard
                label="Realized P&L"
                value={formatUSD(stats.realized_pnl_usd, { sign: true })}
                tone={stats.realized_pnl_usd >= 0 ? "bull" : "bear"}
                hint="locked-in · closed lots only"
              />
              <TotalCard
                label="All-time P&L"
                value={formatUSD(stats.all_time_pnl_usd, { sign: true })}
                tone={stats.all_time_pnl_usd >= 0 ? "bull" : "bear"}
                hint="realized + unrealized"
              />
              <TotalCard
                label="All-time return"
                value={formatPct(stats.all_time_return_pct)}
                tone={
                  stats.all_time_return_pct === null
                    ? "neutral"
                    : stats.all_time_return_pct >= 0
                      ? "bull"
                      : "bear"
                }
                hint="weighted by capital deployed"
              />
            </div>
          )}

          {/* Trader stats strip */}
          {stats && stats.closed_count > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SmallStat
                label="Win rate"
                value={formatPct(stats.win_rate_pct)}
                hint={`${stats.closed_count} closed`}
              />
              <SmallStat
                label="Avg α vs SPY"
                value={formatPct(stats.avg_alpha_pct_closed)}
                hint="closed lots"
                tip={ALPHA_TOOLTIP}
                tone={
                  stats.avg_alpha_pct_closed === null
                    ? "neutral"
                    : stats.avg_alpha_pct_closed >= 0
                      ? "bull"
                      : "bear"
                }
              />
              <SmallStat
                label="Avg days held"
                value={
                  stats.avg_days_held_closed === null
                    ? "—"
                    : `${stats.avg_days_held_closed.toFixed(0)}d`
                }
                hint="closed lots"
              />
              <BestWorstCard stats={stats} />
            </div>
          )}

          {/* Equity curve */}
          {stats && stats.realized_curve.length > 0 && (
            <Panel padding="md" className="mb-6">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                  Realized equity curve
                </div>
                <div className="font-mono text-[10px] text-[var(--text-4)]">
                  cumulative locked-in P&L
                </div>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.realized_curve}
                    margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
                  >
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <RTooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-elev-3)",
                        border: "1px solid var(--border-2)",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "var(--text-2)" }}
                      formatter={(value: unknown, _name: unknown, ctx: { payload?: { ticker?: string } }) => [
                        formatUSD(typeof value === "number" ? value : 0, { sign: true }),
                        `cumulative · ${ctx?.payload?.ticker ?? ""}`,
                      ]}
                      labelFormatter={(d: unknown) => shortDate(d as string)}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_pnl_usd"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      fill="url(#equityFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {/* Open positions */}
          <Section
            label="Open positions"
            hint={
              isLoading
                ? "loading…"
                : open.length === 0
                  ? "no open positions"
                  : `${open.length} lot${open.length === 1 ? "" : "s"}`
            }
          >
            <Panel padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-[12px]">
                  <thead className="bg-[var(--bg-elev-2)]/40">
                    <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                      <th className="px-3 py-2.5 font-normal">Ticker</th>
                      <th className="px-3 py-2.5 font-normal">Buy date</th>
                      <th className="px-3 py-2.5 text-right font-normal">Shares</th>
                      <th className="px-3 py-2.5 text-right font-normal">Buy price</th>
                      <ThWithTip label="Now" tip={QUOTE_TOOLTIP} align="right" />
                      <th className="px-3 py-2.5 text-right font-normal">P&L</th>
                      <th className="px-3 py-2.5 text-right font-normal">Return</th>
                      <ThWithTip label="α since" tip={ALPHA_TOOLTIP} align="right" />
                      <th className="w-32 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-1)]">
                    {isLoading && (
                      <tr>
                        <td colSpan={9} className="p-3">
                          <div className="h-5 rounded shimmer" />
                        </td>
                      </tr>
                    )}
                    {!isLoading && open.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-10 text-center font-mono text-[12px] text-[var(--text-3)]">
                          No open positions. Open any analysis and click{" "}
                          <span className="text-[var(--text-2)]">Record buy</span> to track one.
                        </td>
                      </tr>
                    )}
                    {open.map((p) => (
                      <OpenRow
                        key={p.id}
                        row={p}
                        logoUrl={logos?.logos[p.ticker] ?? null}
                        onDelete={onDelete}
                        onSold={() => mutate()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Section>

          {/* Closed positions */}
          {closed.length > 0 && (
            <Section
              label="Closed positions"
              hint={`${closed.length} realized`}
              className="mt-6"
            >
              <Panel padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[12px]">
                    <thead className="bg-[var(--bg-elev-2)]/40">
                      <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                        <th className="px-3 py-2.5 font-normal">Ticker</th>
                        <th className="px-3 py-2.5 font-normal">Held</th>
                        <th className="px-3 py-2.5 text-right font-normal">Shares</th>
                        <th className="px-3 py-2.5 text-right font-normal">Buy → Sell</th>
                        <th className="px-3 py-2.5 text-right font-normal">Realized P&L</th>
                        <th className="px-3 py-2.5 text-right font-normal">Return</th>
                        <ThWithTip label="α" tip={ALPHA_TOOLTIP} align="right" />
                        <th className="w-8 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-1)]">
                      {closed.map((p) => (
                        <ClosedRow
                          key={p.id}
                          row={p}
                          logoUrl={logos?.logos[p.ticker] ?? null}
                          onDelete={onDelete}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </Section>
          )}
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

/* ---------- presentational helpers ----------------------------------------- */

function Section({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--text-2)]">
          {label}
        </h2>
        <span className="font-mono text-[10px] text-[var(--text-4)]">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "neutral";
  hint?: string;
}) {
  const toneClass =
    tone === "bull"
      ? "text-[var(--bull)]"
      : tone === "bear"
        ? "text-[var(--bear)]"
        : "text-[var(--text-1)]";
  return (
    <Panel padding="sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-[20px] tabular-nums", toneClass)}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] text-[var(--text-4)]">{hint}</div>
      )}
    </Panel>
  );
}

function SmallStat({
  label,
  value,
  hint,
  tip,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tip?: string;
  tone?: "bull" | "bear" | "neutral";
}) {
  const toneClass =
    tone === "bull"
      ? "text-[var(--bull)]"
      : tone === "bear"
        ? "text-[var(--bear)]"
        : "text-[var(--text-1)]";
  return (
    <Panel padding="sm">
      <div className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
        <span>{label}</span>
        {tip && (
          <Tooltip content={tip}>
            <Info className="h-2.5 w-2.5 text-[var(--text-4)] hover:text-[var(--text-2)] cursor-help" />
          </Tooltip>
        )}
      </div>
      <div className={cn("mt-1 font-mono text-[16px] tabular-nums", toneClass)}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] text-[var(--text-4)]">{hint}</div>
      )}
    </Panel>
  );
}

function BestWorstCard({ stats }: { stats: PortfolioStats }) {
  const { best_trade: best, worst_trade: worst } = stats;
  if (!best && !worst) return null;
  return (
    <Panel padding="sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
        Best / Worst
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {best && (
          <div className="font-mono text-[12px] tabular-nums">
            <span className="text-[var(--bull)]">↑ {best.ticker}</span>
            <span className="ml-1.5 text-[var(--text-2)]">
              {formatUSD(best.realized_pnl_usd, { sign: true })}
            </span>
            <span className="ml-1.5 text-[var(--text-4)]">({formatPct(best.return_pct)})</span>
          </div>
        )}
        {worst && best?.ticker !== worst.ticker && (
          <div className="font-mono text-[12px] tabular-nums">
            <span className="text-[var(--bear)]">↓ {worst.ticker}</span>
            <span className="ml-1.5 text-[var(--text-2)]">
              {formatUSD(worst.realized_pnl_usd, { sign: true })}
            </span>
            <span className="ml-1.5 text-[var(--text-4)]">({formatPct(worst.return_pct)})</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ThWithTip({
  label,
  tip,
  align = "left",
}: {
  label: string;
  tip: string;
  align?: "left" | "right";
}) {
  return (
    <th className={cn("px-3 py-2.5 font-normal", align === "right" && "text-right")}>
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        <span>{label}</span>
        <Tooltip content={tip}>
          <Info
            className="h-2.5 w-2.5 text-[var(--text-4)] hover:text-[var(--text-2)] cursor-help"
            aria-label={tip}
          />
        </Tooltip>
      </span>
    </th>
  );
}

function TickerCell({
  row,
  logoUrl,
}: {
  row: Purchase;
  logoUrl: string | null;
}) {
  const inner = (
    <span className="inline-flex items-center gap-2">
      <TickerLogo ticker={row.ticker} src={logoUrl} size={20} />
      <span className="font-semibold text-[var(--text-1)]">{row.ticker}</span>
    </span>
  );
  return row.analysis_id ? (
    <Link
      href={`/analyses/${row.analysis_id}`}
      className="hover:text-[var(--accent)]"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

function OpenRow({
  row,
  logoUrl,
  onDelete,
  onSold,
}: {
  row: Purchase;
  logoUrl: string | null;
  onDelete: (id: number) => void;
  onSold: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-[var(--bg-elev-2)]/40">
      <td className="px-3 py-2.5">
        <TickerCell row={row} logoUrl={logoUrl} />
        {row.notes && (
          <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-[var(--text-4)]">
            {row.notes}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-[var(--text-2)]">{shortDate(row.buy_date)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-2)]">
        {row.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-2)]">
        {formatUSD(row.buy_price)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-1)]">
        {row.current_price === null ? "—" : formatUSD(row.current_price)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          row.pnl_usd === null
            ? "text-[var(--text-4)]"
            : row.pnl_usd >= 0
              ? "text-[var(--bull)]"
              : "text-[var(--bear)]",
        )}
      >
        {row.pnl_usd === null ? "—" : formatUSD(row.pnl_usd, { sign: true })}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          row.return_pct === null
            ? "text-[var(--text-4)]"
            : row.return_pct >= 0
              ? "text-[var(--bull)]"
              : "text-[var(--bear)]",
        )}
      >
        {formatPct(row.return_pct)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          row.alpha_pct === null
            ? "text-[var(--text-4)]"
            : row.alpha_pct >= 0
              ? "text-[var(--bull)]"
              : "text-[var(--bear)]",
        )}
      >
        {formatPct(row.alpha_pct)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1">
          <SellDialog
            purchase={row}
            onSold={onSold}
            trigger={
              <Button size="xs" variant="secondary">
                Sell
              </Button>
            }
          />
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--bear)] cursor-pointer"
            aria-label={`Delete ${row.ticker} lot`}
            title="Delete entirely (treat as if it never happened)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ClosedRow({
  row,
  logoUrl,
  onDelete,
}: {
  row: Purchase;
  logoUrl: string | null;
  onDelete: (id: number) => void;
}) {
  return (
    <tr className="transition-colors hover:bg-[var(--bg-elev-2)]/40">
      <td className="px-3 py-2.5">
        <TickerCell row={row} logoUrl={logoUrl} />
        {row.sell_notes && (
          <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-[var(--text-4)]">
            {row.sell_notes}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-[var(--text-2)]">
        {shortDate(row.buy_date)} → {shortDate(row.sell_date!)}
        <div className="text-[10px] text-[var(--text-4)]">
          {row.days_held === null ? "" : `${row.days_held}d`}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-2)]">
        {row.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-2)]">
        {formatUSD(row.buy_price)} → {formatUSD(row.sell_price ?? 0)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          (row.realized_pnl_usd ?? 0) >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]",
        )}
      >
        {formatUSD(row.realized_pnl_usd ?? 0, { sign: true })}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          row.return_pct === null
            ? "text-[var(--text-4)]"
            : row.return_pct >= 0
              ? "text-[var(--bull)]"
              : "text-[var(--bear)]",
        )}
      >
        {formatPct(row.return_pct)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums font-semibold",
          row.alpha_pct === null
            ? "text-[var(--text-4)]"
            : row.alpha_pct >= 0
              ? "text-[var(--bull)]"
              : "text-[var(--bear)]",
        )}
      >
        {formatPct(row.alpha_pct)}
      </td>
      <td className="px-2 py-2.5 text-right">
        <button
          type="button"
          onClick={() => onDelete(row.id)}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--bear)] cursor-pointer"
          aria-label={`Delete closed ${row.ticker} lot`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
