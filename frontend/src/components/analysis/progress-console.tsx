"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { FactorName } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Step = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  hint?: string;
};

export function ProgressConsole({
  steps,
  elapsedMs,
  error,
}: {
  steps: Step[];
  elapsedMs: number;
  error?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-elev-1)]/70 p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-3)]">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          Live pipeline
        </div>
        <div className="font-mono text-[11px] tabular-nums text-[var(--text-3)]">
          {(elapsedMs / 1000).toFixed(1)}s elapsed
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => (
          <StepRow key={s.id} step={s} index={i} />
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-[var(--bear)]/40 bg-[var(--bear-dim)] px-4 py-3 font-mono text-[12px] text-[var(--bear)]">
          ✕ {error}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, index }: { step: Step; index: number }) {
  let icon: ReactNode;
  let textClass = "text-[var(--text-3)]";
  if (step.status === "running") {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />;
    textClass = "text-[var(--text-1)]";
  } else if (step.status === "done") {
    icon = <Check className="h-3.5 w-3.5 text-[var(--bull)]" strokeWidth={2.5} />;
    textClass = "text-[var(--text-2)]";
  } else if (step.status === "error") {
    icon = <X className="h-3.5 w-3.5 text-[var(--bear)]" strokeWidth={2.5} />;
    textClass = "text-[var(--bear)]";
  } else {
    icon = <Circle className="h-3 w-3 text-[var(--text-4)]" strokeWidth={2} />;
  }

  return (
    <div
      className={cn(
        "group relative flex items-center justify-between rounded-md px-3 py-2 font-mono text-[12px]",
        step.status === "running" && "bg-[var(--accent-dim)]/30",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-[var(--text-4)]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="grid h-5 w-5 place-items-center">{icon}</span>
        <span className={textClass}>{step.label}</span>
      </div>
      {step.hint && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-4)]">
          {step.hint}
        </span>
      )}
    </div>
  );
}

export function makeInitialSteps(): Step[] {
  const factorOrder: FactorName[] = ["valuation", "growth", "moat", "sentiment", "catalysts"];
  return [
    { id: "data",                label: "Fetch market data",                  status: "pending" },
    ...factorOrder.map<Step>((f) => ({ id: `factor:${f}`, label: `Factor analysis · ${f}`, status: "pending" })),
    { id: "synthesis", label: "Synthesis · weighted rating",   status: "pending" },
    { id: "persist",   label: "Persist to local store",         status: "pending" },
  ];
}
