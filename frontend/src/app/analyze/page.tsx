import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { AnalyzeForm } from "@/components/analysis/analyze-form";

export default function AnalyzePage() {
  return (
    <AppShell context="Analyze · new ticker">
      <div className="mx-auto max-w-7xl p-8">
        <div className="mb-8">
          <h1 className="font-mono text-[28px] font-semibold leading-tight text-[var(--text-1)]">
            Analyze a security<span className="text-[var(--accent)]">.</span>
          </h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[var(--text-3)]">
            Five factor analyses fire in parallel — valuation, growth, moat, sentiment, catalysts — then a synthesis call produces a structured BUY / HOLD / SELL rating with a 0–10 score, risks, and watch-list catalysts.
          </p>
        </div>
        <Suspense fallback={<div className="h-32 rounded shimmer" />}>
          <AnalyzeForm />
        </Suspense>
      </div>
    </AppShell>
  );
}
