/* Client-side fetchers + types matching the FastAPI shape. */

export type Rating = "BUY" | "HOLD" | "SELL";
export type FactorRating = "bullish" | "neutral" | "bearish";
export type Confidence = "low" | "medium" | "high";
export type Spike = "low" | "moderate" | "high";
export type FactorName = "valuation" | "growth" | "moat" | "sentiment" | "catalysts";

export interface AnalysisSummary {
  id: number;
  ticker: string;
  created_at: string;
  entry_price: number;
  overall_rating: Rating;
  overall_score: number;
  spike_potential: Spike;
  confidence: Confidence;
  total_cost_usd: number;
}

export interface FactorOutput {
  factor: FactorName;
  score: number;
  rating: FactorRating;
  key_points: string[];
  reasoning: string;
  confidence: Confidence;
  data_gaps: string[];
}

export interface SynthesisOutput {
  ticker: string;
  overall_rating: Rating;
  overall_score: number;
  factor_scores: Record<FactorName, number>;
  thesis: string;
  risks: string[];
  catalysts_to_watch: string[];
  spike_potential: Spike;
  spike_rationale: string;
  confidence: Confidence;
}

export interface PerformanceSnapshot {
  analysis_id: number;
  interval: "1w" | "1m" | "3m" | "6m" | "1y";
  computed_at: string;
  price_at_interval: number | null;
  return_pct: number | null;
  spy_price_at_analysis: number;
  spy_price_at_interval: number | null;
  spy_return_pct: number | null;
  alpha_pct: number | null;
}

export interface AnalysisDetail extends AnalysisSummary {
  thesis: string;
  factors: FactorOutput[];
  synthesis: SynthesisOutput;
  factor_model: string;
  synthesis_model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  performance: PerformanceSnapshot[];
}

export interface BacktestAggregates {
  totals: {
    analyses: number;
    total_cost_usd: number;
    buy_hit_rate: number | null;
    buy_hit_vs_spy: number | null;
    buy_avg_alpha: number | null;
    buy_avg_return: number | null;
    buy_n: number;
  };
  by_rating: {
    rating: Rating;
    interval: string;
    n: number;
    avg_return_pct: number;
    avg_alpha_pct: number;
    hit_pct: number;
    hit_vs_spy_pct: number;
  }[];
  by_factor: {
    factor: FactorName;
    bucket: "high" | "mid" | "low";
    interval: string;
    n: number;
    avg_return_pct: number;
    avg_alpha_pct: number;
  }[];
  per_analysis: {
    id: number;
    ticker: string;
    overall_rating: Rating;
    overall_score: number;
    spike_potential: Spike;
    confidence: Confidence;
    created_at: string;
    entry_price: number;
    r_1w: number | null;
    r_1m: number | null;
    r_3m: number | null;
    r_6m: number | null;
    r_1y: number | null;
    a_1w: number | null;
    a_1m: number | null;
    a_3m: number | null;
    a_6m: number | null;
    a_1y: number | null;
  }[];
  last_refresh_at: string | null;
}

export interface CurrentQuotesResponse {
  quotes: Record<string, { price: number; timestamp: string }>;
  errors: Record<string, string>;
}

export interface LogosResponse {
  logos: Record<string, string | null>;
}

export interface Purchase {
  id: number;
  ticker: string;
  buy_date: string;
  buy_price: number;
  shares: number;
  analysis_id: number | null;
  notes: string | null;
  created_at: string;
  current_price: number | null;
  return_pct: number | null;
  spy_return_pct: number | null;
  alpha_pct: number | null;
  pnl_usd: number | null;
  cost_basis_usd: number;
}

export interface PurchasesResponse {
  purchases: Purchase[];
}

export interface PurchaseInput {
  ticker: string;
  buy_date: string;
  buy_price: number;
  shares?: number;
  analysis_id?: number | null;
  notes?: string | null;
}

export async function createPurchase(input: PurchaseInput): Promise<{ id: number }> {
  const res = await fetch("/api/purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function deletePurchase(id: number): Promise<void> {
  const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export interface FavoritesResponse {
  tickers: string[];
}

export async function toggleFavorite(ticker: string, favored: boolean): Promise<FavoritesResponse> {
  const res = await fetch(`/api/favorites/${encodeURIComponent(ticker)}`, {
    method: favored ? "PUT" : "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface CostStatus {
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
  pct_used: number;
}

export interface HealthStatus {
  status: string;
  anthropic_key_set: boolean;
  daily_cost_cap_usd: number;
  todays_spend_usd: number;
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function refreshBacktest(): Promise<{ analyses: number; tickers: number; snapshots_written: number }> {
  const res = await fetch("/api/backtest/refresh", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ---- SSE: analyze stream ------------------------------------------------ */

export type AnalyzeEvent =
  | { phase: "data"; status: "start" }
  | { phase: "data"; status: "done"; quote: Record<string, unknown>; fundamentals_summary: Record<string, unknown>; news_count: number; competitor_count: number; earnings_date: string | null }
  | { phase: "factor"; factor: FactorName; status: "start" }
  | { phase: "factor"; factor: FactorName; status: "done"; output: FactorOutput; usage: Record<string, unknown> }
  | { phase: "synthesis"; status: "start" }
  | { phase: "synthesis"; status: "done"; output: SynthesisOutput; usage: Record<string, unknown> }
  | { phase: "persist"; status: "done"; analysis_id: number; totals: Record<string, unknown> }
  | { phase: "error"; message: string };

export async function streamAnalyze(
  ticker: string,
  onEvent: (e: AnalyzeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
    signal,
  });
  if (!res.ok || !res.body) {
    onEvent({ phase: "error", message: `${res.status} ${res.statusText}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const block of events) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as AnalyzeEvent);
      } catch {
        // ignore malformed
      }
    }
  }
}
