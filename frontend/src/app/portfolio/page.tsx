"use client";

import { Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  deletePurchase,
  fetcher,
  type LogosResponse,
  type Purchase,
  type PurchasesResponse,
} from "@/lib/api";
import { cn, formatPct, formatUSD, shortDate } from "@/lib/utils";

const ALPHA_TOOLTIP =
  "Position return minus SPY return since buy date. Positive means you've beaten just holding SPY.";

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

  const totals = useMemo(() => {
    const rows = data?.purchases ?? [];
    let cost = 0;
    let market = 0;
    let realizable = false;
    for (const p of rows) {
      cost += p.cost_basis_usd;
      if (p.current_price !== null) {
        market += p.current_price * p.shares;
        realizable = true;
      }
    }
    return {
      cost,
      market: realizable ? market : null,
      pnl: realizable ? market - cost : null,
      pct: realizable && cost > 0 ? ((market - cost) / cost) * 100 : null,
    };
  }, [data]);

  async function onDelete(id: number) {
    if (!confirm("Delete this position?")) return;
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
                {data ? `${data.purchases.length} position${data.purchases.length === 1 ? "" : "s"} · live P&L` : "Loading…"}
              </p>
            </div>
          </div>

          {/* Totals strip */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TotalCard label="Cost basis" value={formatUSD(totals.cost)} muted />
            <TotalCard
              label="Market value"
              value={totals.market === null ? "—" : formatUSD(totals.market)}
            />
            <TotalCard
              label="Unrealized P&L"
              value={
                totals.pnl === null
                  ? "—"
                  : formatUSD(totals.pnl, { sign: true })
              }
              tone={totals.pnl === null ? "neutral" : totals.pnl >= 0 ? "bull" : "bear"}
            />
            <TotalCard
              label="Return"
              value={formatPct(totals.pct)}
              tone={totals.pct === null ? "neutral" : totals.pct >= 0 ? "bull" : "bear"}
            />
          </div>

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
                    <th className="w-8 px-2 py-2.5" />
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
                  {!isLoading && (data?.purchases.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={9} className="p-10 text-center font-mono text-[12px] text-[var(--text-3)]">
                        No positions yet. Open any analysis and click <span className="text-[var(--text-2)]">Buy</span> to record one.
                      </td>
                    </tr>
                  )}
                  {data?.purchases.map((p) => (
                    <PortfolioRow
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
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

function TotalCard({
  label,
  value,
  tone = "neutral",
  muted,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "neutral";
  muted?: boolean;
}) {
  const toneClass =
    tone === "bull"
      ? "text-[var(--bull)]"
      : tone === "bear"
        ? "text-[var(--bear)]"
        : muted
          ? "text-[var(--text-2)]"
          : "text-[var(--text-1)]";
  return (
    <Panel padding="sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-[18px] tabular-nums", toneClass)}>
        {value}
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

function PortfolioRow({
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
        {row.analysis_id ? (
          <Link
            href={`/analyses/${row.analysis_id}`}
            className="inline-flex items-center gap-2 hover:text-[var(--accent)]"
          >
            <TickerLogo ticker={row.ticker} src={logoUrl} size={20} />
            <span className="font-semibold text-[var(--text-1)]">{row.ticker}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2">
            <TickerLogo ticker={row.ticker} src={logoUrl} size={20} />
            <span className="font-semibold text-[var(--text-1)]">{row.ticker}</span>
          </span>
        )}
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
      <td className="px-2 py-2.5 text-right">
        <button
          type="button"
          onClick={() => onDelete(row.id)}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--bear)] cursor-pointer"
          aria-label={`Delete ${row.ticker} position`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
