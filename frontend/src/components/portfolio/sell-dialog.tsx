"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { type Purchase, sellPurchase } from "@/lib/api";
import { cn, formatUSD } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const fieldLabel =
  "block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]";
const fieldInput =
  "mt-1 h-9 w-full rounded-md border border-[var(--border-2)] bg-[var(--bg-elev-1)] px-3 font-mono text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none";

export function SellDialog({
  purchase,
  trigger,
  onSold,
}: {
  purchase: Purchase;
  trigger: React.ReactNode;
  onSold?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sellDate, setSellDate] = useState(todayISO());
  const [sellPrice, setSellPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSellDate(todayISO());
    setSellPrice("");
    setNotes("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceN = parseFloat(sellPrice);
    if (!Number.isFinite(priceN) || priceN <= 0) {
      setError("Sell price must be a positive number.");
      return;
    }
    if (sellDate < purchase.buy_date) {
      setError(`Sell date must be on or after the buy date (${purchase.buy_date}).`);
      return;
    }
    setSubmitting(true);
    try {
      await sellPurchase(purchase.id, {
        sell_date: sellDate,
        sell_price: priceN,
        sell_notes: notes.trim() || null,
      });
      onSold?.();
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sell.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewPnL =
    sellPrice && Number.isFinite(parseFloat(sellPrice))
      ? (parseFloat(sellPrice) - purchase.buy_price) * purchase.shares
      : null;

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
        title={`Sell ${purchase.ticker}`}
        description={`${purchase.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares @ ${formatUSD(purchase.buy_price)} (${purchase.buy_date})`}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sell-date" className={fieldLabel}>
                Sell date
              </label>
              <input
                id="sell-date"
                type="date"
                required
                value={sellDate}
                min={purchase.buy_date}
                max={todayISO()}
                onChange={(e) => setSellDate(e.target.value)}
                className={fieldInput}
              />
            </div>
            <div>
              <label htmlFor="sell-price" className={fieldLabel}>
                Sell price (USD)
              </label>
              <input
                id="sell-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.00"
                className={fieldInput}
              />
            </div>
          </div>
          <div>
            <label htmlFor="sell-notes" className={fieldLabel}>
              Notes (optional)
            </label>
            <textarea
              id="sell-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="took profit · stopped out · rotated capital…"
              rows={2}
              className={cn(fieldInput, "h-auto resize-none py-2")}
            />
          </div>
          {previewPnL !== null && (
            <div className="rounded border border-[var(--border-1)] bg-[var(--bg-elev-1)] px-3 py-2 font-mono text-[11px]">
              <span className="text-[var(--text-3)]">Realized P&amp;L: </span>
              <span
                className={cn(
                  "tabular-nums",
                  previewPnL >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]",
                )}
              >
                {formatUSD(previewPnL, { sign: true })}
              </span>
            </div>
          )}
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
              {submitting ? "Saving…" : "Record sell"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
