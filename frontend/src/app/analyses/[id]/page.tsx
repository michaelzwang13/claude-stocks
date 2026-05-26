"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/shell/app-shell";
import { AnalysisDetail } from "@/components/analysis/analysis-detail";
import { Panel } from "@/components/ui/panel";
import { type AnalysisDetail as AnalysisDetailType, fetcher } from "@/lib/api";

export default function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<AnalysisDetailType>(
    `/api/analyses/${id}`,
    fetcher,
  );

  return (
    <AppShell context={data ? `${data.ticker} · ${data.overall_rating}` : "Loading…"}>
      <div className="mx-auto max-w-7xl p-8">
        <Link
          href="/analyses"
          className="mb-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <ArrowLeft className="h-3 w-3" /> Past analyses
        </Link>
        {isLoading && (
          <Panel padding="lg">
            <div className="h-8 w-40 rounded shimmer" />
            <div className="mt-4 h-4 w-72 rounded shimmer" />
          </Panel>
        )}
        {error && (
          <Panel padding="lg">
            <p className="font-mono text-sm text-[var(--bear)]">Failed to load: {String(error)}</p>
          </Panel>
        )}
        {data && <AnalysisDetail data={data} />}
      </div>
    </AppShell>
  );
}
