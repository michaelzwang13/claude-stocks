"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  History,
  Search,
  Wallet,
  Zap,
} from "lucide-react";
import { cn, formatUSD } from "@/lib/utils";
import { fetcher, type CostStatus } from "@/lib/api";

const NAV = [
  { href: "/analyze", label: "Analyze",      icon: Search,    desc: "New ticker" },
  { href: "/analyses", label: "Past Analyses", icon: History,   desc: "Browse history" },
  { href: "/portfolio", label: "Portfolio",  icon: Wallet,    desc: "Your positions" },
  { href: "/backtest", label: "Backtest",    icon: BarChart3, desc: "Forward returns" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { data: cost } = useSWR<CostStatus>("/api/cost/today", fetcher, {
    refreshInterval: 30_000,
  });

  return (
    <aside className="relative z-10 flex h-screen w-[232px] shrink-0 flex-col border-r border-[var(--border-1)] bg-[var(--bg-elev-1)]/60 backdrop-blur-md">
      {/* Lockup */}
      <Link href="/analyze" className="group flex items-center gap-3 border-b border-[var(--border-1)] px-5 py-5">
        <div className="relative grid h-8 w-8 place-items-center rounded-md bg-[var(--accent-dim)] ring-1 ring-[var(--accent)]/40">
          <Activity className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-3)]">
            Claude
          </span>
          <span className="font-mono text-[13px] font-semibold tracking-wider text-[var(--text-1)]">
            STOCKS<span className="text-[var(--accent)]">.</span>
          </span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-5">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-4)]">
          Navigation
        </div>
        {NAV.map(({ href, label, icon: Icon, desc }) => {
          const active = pathname === href || (href !== "/analyze" && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--bg-elev-2)] text-[var(--text-1)]"
                  : "text-[var(--text-2)] hover:bg-[var(--bg-elev-1)] hover:text-[var(--text-1)]",
              )}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-[var(--accent)]" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-[var(--accent)]" : "text-[var(--text-3)] group-hover:text-[var(--text-2)]",
                )}
                strokeWidth={2}
              />
              <div className="flex flex-col leading-tight">
                <span className="font-medium">{label}</span>
                <span className="font-mono text-[10px] text-[var(--text-3)]">{desc}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Cost gauge */}
      <div className="border-t border-[var(--border-1)] px-5 py-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
          <span>Daily API spend</span>
          <Zap className="h-3 w-3 text-[var(--text-3)]" />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-lg tabular-nums text-[var(--text-1)]">
            {cost ? formatUSD(cost.spent_usd) : "—"}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-3)]">
            / {cost ? formatUSD(cost.cap_usd) : "—"}
          </span>
        </div>
        <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-[var(--border-1)]">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{
              width: `${Math.min(100, cost?.pct_used ?? 0)}%`,
              boxShadow: "0 0 6px var(--accent-glow)",
            }}
          />
        </div>
      </div>

      <div className="border-t border-[var(--border-1)] px-5 py-4">
        <p className="font-mono text-[10px] leading-relaxed text-[var(--text-4)]">
          Personal research only.<br />
          Not financial advice.
        </p>
      </div>
    </aside>
  );
}
