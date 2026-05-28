"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { createPurchase } from "@/lib/api";
import { cn } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const fieldLabel =
  "block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]";
const fieldInput =
  "mt-1 h-9 w-full rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] px-3 font-mono text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none";

export function BuyDialog({
  ticker,
  analysisId,
  trigger,
  onCreated,
}: {
  ticker: string;
  analysisId?: number | null;
  trigger: React.ReactNode;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [buyDate, setBuyDate] = useState(todayISO());
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBuyDate(todayISO());
    setBuyPrice("");
    setShares("1");
    setNotes("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceN = parseFloat(buyPrice);
    const sharesN = parseFloat(shares);
    if (!Number.isFinite(priceN) || priceN <= 0) {
      setError("Buy price must be a positive number.");
      return;
    }
    if (!Number.isFinite(sharesN) || sharesN <= 0) {
      setError("Shares must be positive.");
      return;
    }
    setSubmitting(true);
    try {
      await createPurchase({
        ticker,
        buy_date: buyDate,
        buy_price: priceN,
        shares: sharesN,
        analysis_id: analysisId ?? null,
        notes: notes.trim() || null,
      });
      onCreated?.();
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save purchase.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={`Record buy: ${ticker}`}
        description="Tracks a position for live P&L. Not a real trade."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="buy-date" className={fieldLabel}>
                Buy date
              </label>
              <input
                id="buy-date"
                type="date"
                required
                value={buyDate}
                max={todayISO()}
                onChange={(e) => setBuyDate(e.target.value)}
                className={fieldInput}
              />
            </div>
            <div>
              <label htmlFor="buy-price" className={fieldLabel}>
                Buy price (USD)
              </label>
              <input
                id="buy-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="0.00"
                className={fieldInput}
              />
            </div>
          </div>
          <div>
            <label htmlFor="shares" className={fieldLabel}>
              Shares
            </label>
            <input
              id="shares"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0.0001"
              required
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className={fieldInput}
            />
          </div>
          <div>
            <label htmlFor="notes" className={fieldLabel}>
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="why this trade?"
              rows={2}
              className={cn(fieldInput, "h-auto resize-none py-2")}
            />
          </div>
          {error && (
            <div className="rounded border border-[var(--bear)]/40 bg-[var(--bear-dim)] px-3 py-2 font-mono text-[11px] text-[var(--bear)]">
              {error}
            </div>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Record buy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
