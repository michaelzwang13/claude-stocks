"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium tracking-tight transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--bg-base)] hover:brightness-110 hover:shadow-[0_0_20px_var(--accent-glow)]",
        secondary:
          "border border-[var(--border-2)] bg-[var(--bg-elev-1)] text-[var(--text-1)] hover:border-[var(--border-3)] hover:bg-[var(--bg-elev-2)]",
        ghost:
          "text-[var(--text-2)] hover:bg-[var(--bg-elev-1)] hover:text-[var(--text-1)]",
        outline:
          "border border-[var(--border-2)] bg-transparent text-[var(--text-1)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        destructive:
          "bg-[var(--bear-dim)] text-[var(--bear)] hover:bg-[var(--bear)] hover:text-white",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
