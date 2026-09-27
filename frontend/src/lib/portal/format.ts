// One place for machine-value formatting (docs/portal/01-data-access.md §7).

export const taskId = (n: number) => `T-${n}`;

export const int = (n: number) => Math.round(n).toLocaleString("en-US");

export const budgetPct = (spent: number, budget: number) =>
  budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

export type BudgetLevel = "ok" | "warn" | "over";

export function budgetLevel(spent: number, budget: number, warnPct = 80): BudgetLevel {
  if (budget <= 0) return "ok";
  const pct = (spent / budget) * 100;
  if (pct >= 100) return "over";
  if (pct >= warnPct) return "warn";
  return "ok";
}

/** `numeric` columns arrive as strings from PostgREST. */
export function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1000 ? 2 : 0,
    minimumFractionDigits: 0,
  });
}

/** "$12k" for tight spaces (today strip). */
export function moneyShort(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${+(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

const DAY_TIME = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Relative for < 24 h ("3 min ago"), else "Sat 14:05". Browser local time. */
export function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return DAY_TIME.format(t).replace(",", "");
}
