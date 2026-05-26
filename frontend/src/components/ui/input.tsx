"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] px-3 font-mono text-sm uppercase tracking-wider text-[var(--text-1)] placeholder:text-[var(--text-4)] placeholder:normal-case placeholder:tracking-normal focus:border-[var(--accent)] focus:outline-none focus:ring-0 transition-colors",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
