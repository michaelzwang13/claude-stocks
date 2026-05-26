"use client";

import { Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  type AnalyzeEvent,
  type AnalysisDetail,
  fetcher,
  streamAnalyze,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { FactorCard } from "./factor-card";
import { ProgressConsole, makeInitialSteps, type Step } from "./progress-console";

type Phase = "idle" | "running" | "done" | "error";

const POPULAR = ["AAPL", "NVDA", "MSFT", "TSLA", "META", "GOOGL", "AMZN", "PLTR"];

export function AnalyzeForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>(makeInitialSteps());
  const [factors, setFactors] = useState<Record<string, AnalyzeEvent extends infer E ? E extends { phase: "factor"; status: "done"; output: infer O } ? O : never : never>>({});
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  function reset() {
    setSteps(makeInitialSteps());
    setFactors({});
    setError(null);
    setElapsed(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t || phase === "running") return;
    reset();
    setPhase("running");
    startedAt.current = Date.now();
    abortRef.current = new AbortController();

    try {
      await streamAnalyze(
        t,
        (ev) => {
          setSteps((prev) => applyEvent(prev, ev));
          if (ev.phase === "factor" && ev.status === "done") {
            setFactors((prev) => ({ ...prev, [ev.factor]: ev.output }));
          }
          if (ev.phase === "error") {
            setError(ev.message);
            setPhase("error");
          }
          if (ev.phase === "persist" && ev.status === "done") {
            setPhase("done");
            // route to the saved analysis detail
            router.push(`/analyses/${ev.analysis_id}`);
          }
        },
        abortRef.current.signal,
      );
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase("idle");
    reset();
  }

  return (
    <div className="space-y-6">
      <Panel padding="lg">
        <PanelHeader
          label="New analysis"
          hint="Enter a ticker — 5 factor calls in parallel, then a synthesis. Typically 12–25 seconds."
        />
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <Input
              autoFocus
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="enter ticker · e.g. AAPL, NVDA, PLTR"
              className="h-12 pl-10 text-base"
              disabled={phase === "running"}
              maxLength={10}
            />
          </div>
          {phase === "running" ? (
            <Button size="lg" variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button size="lg" type="submit" disabled={!ticker.trim()}>
              <Sparkles className="h-4 w-4" />
              Analyze
            </Button>
          )}
        </form>

        {phase === "idle" && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-4)]">
              Quick picks
            </span>
            {POPULAR.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTicker(t)}
                className="rounded-md border border-[var(--border-1)] bg-[var(--bg-elev-1)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {phase !== "idle" && (
        <ProgressConsole steps={steps} elapsedMs={elapsed} error={error} />
      )}

      {phase === "running" && Object.keys(factors).length > 0 && (
        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
            Factor results · {Object.keys(factors).length}/5 complete
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {["valuation", "growth", "moat", "sentiment", "catalysts"].map((f) => {
              const out = factors[f as keyof typeof factors];
              return out
                ? <FactorCard key={f} factor={out as any} />
                : <FactorCard key={f} pending={{ factor: f }} />;
            })}
          </div>
        </div>
      )}

      {phase === "idle" && <RecentAnalysesPreview />}
    </div>
  );
}

function applyEvent(steps: Step[], ev: AnalyzeEvent): Step[] {
  const next = steps.map((s) => ({ ...s }));
  const update = (id: string, status: Step["status"], hint?: string) => {
    const s = next.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (hint !== undefined) s.hint = hint;
    }
  };
  if (ev.phase === "data") {
    if (ev.status === "start") update("data", "running");
    else if (ev.status === "done") {
      update(
        "data",
        "done",
        `${ev.news_count} news · ${ev.competitor_count} peers${ev.earnings_date ? ` · ER ${ev.earnings_date}` : ""}`,
      );
    }
  } else if (ev.phase === "factor") {
    if (ev.status === "start") update(`factor:${ev.factor}`, "running");
    else if (ev.status === "done") {
      const o = ev.output;
      update(
        `factor:${ev.factor}`,
        "done",
        `score ${o.score.toFixed(1)} · ${o.rating}`,
      );
    }
  } else if (ev.phase === "synthesis") {
    if (ev.status === "start") update("synthesis", "running");
    else if (ev.status === "done") {
      update("synthesis", "done", `${ev.output.overall_rating} · ${ev.output.overall_score.toFixed(1)}`);
    }
  } else if (ev.phase === "persist") {
    update("persist", "done", `id ${ev.analysis_id}`);
  } else if (ev.phase === "error") {
    const running = next.find((s) => s.status === "running");
    if (running) running.status = "error";
  }
  return next;
}

function RecentAnalysesPreview() {
  // Lazy import so this server-side block doesn't break SSR.
  return <RecentAnalysesPreviewClient />;
}

import useSWR from "swr";
import { RatingPill } from "@/components/ui/rating-pill";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { formatUSD, relativeTime, shortDate } from "@/lib/utils";
import type { AnalysisSummary, LogosResponse } from "@/lib/api";
import Link from "next/link";

function RecentAnalysesPreviewClient() {
  const { data: items } = useSWR<AnalysisSummary[]>("/api/analyses?limit=6", fetcher);

  const tickersParam = items && items.length
    ? Array.from(new Set(items.map((a) => a.ticker))).sort().join(",")
    : null;
  const { data: logos } = useSWR<LogosResponse>(
    tickersParam ? `/api/logos?tickers=${encodeURIComponent(tickersParam)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );

  if (!items) {
    return (
      <Panel padding="md">
        <PanelHeader label="Recent analyses" />
        <div className="grid gap-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded shimmer" />
          ))}
        </div>
      </Panel>
    );
  }
  if (items.length === 0) {
    return (
      <Panel padding="lg">
        <PanelHeader label="Recent analyses" hint="No analyses yet — submit a ticker above to start your forward-tracking record." />
      </Panel>
    );
  }
  return (
    <Panel padding="md">
      <PanelHeader label="Recent analyses" hint={`Last ${items.length} runs · click to open`} />
      <div className="grid gap-2 md:grid-cols-3">
        {items.map((a) => (
          <Link
            key={a.id}
            href={`/analyses/${a.id}`}
            className="group relative rounded-md border border-[var(--border-1)] bg-[var(--bg-elev-2)]/30 p-4 transition-all hover:border-[var(--border-2)] hover:bg-[var(--bg-elev-2)]/60"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TickerLogo ticker={a.ticker} src={logos?.logos[a.ticker] ?? null} size={28} />
                <span className="font-mono text-lg font-semibold text-[var(--text-1)]">{a.ticker}</span>
                <RatingPill rating={a.overall_rating} size="xs" />
              </div>
              <span className="font-mono text-lg tabular-nums text-[var(--text-2)]">{a.overall_score.toFixed(1)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              <span>entry {formatUSD(a.entry_price)}</span>
              <span>{relativeTime(a.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
