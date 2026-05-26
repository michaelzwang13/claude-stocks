"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function TickerLogo({
  ticker,
  src,
  size = 20,
  className,
}: {
  ticker: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = src && !broken;

  const wrapperClass = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded",
    "bg-[var(--bg-elev-2)] ring-1 ring-inset ring-[var(--border-2)]",
    className,
  );

  return (
    <span
      className={wrapperClass}
      style={{ width: size, height: size }}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${ticker} logo`}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span
          className="font-mono font-semibold text-[var(--text-2)]"
          style={{ fontSize: Math.max(8, Math.round(size * 0.45)) }}
        >
          {ticker.charAt(0)}
        </span>
      )}
    </span>
  );
}
