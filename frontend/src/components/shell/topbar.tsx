"use client";

import { Clock, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

export function Topbar({ context }: { context?: string }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }) + " UTC" + (-d.getTimezoneOffset() / 60 >= 0 ? "+" : "") + (-d.getTimezoneOffset() / 60),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative z-10 flex h-12 items-center justify-between border-b border-[var(--border-1)] bg-[var(--bg-elev-1)]/40 px-6 backdrop-blur-md">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
        {context ?? "Terminal"}
      </div>
      <div className="flex items-center gap-4 font-mono text-[11px] text-[var(--text-3)]">
        <span className="flex items-center gap-1.5">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--bull)] opacity-60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--bull)]" />
          </span>
          <span>LIVE</span>
        </span>
        <span className="h-3 w-px bg-[var(--border-2)]" />
        <span className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3" />
          API
        </span>
        <span className="h-3 w-px bg-[var(--border-2)]" />
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock className="h-3 w-3" />
          {now || "—"}
        </span>
      </div>
    </div>
  );
}
