// One place for machine-value formatting (docs/portal/01-data-access.md §7).

export const taskId = (n: number) => `T-${n}`;

/** Integer with thousands separators; missing / non-numeric values (live JSON) read as 0, never "NaN". */
export const int = (n: number | string | null | undefined) => Math.round(Number(n) || 0).toLocaleString("en-US");

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

/** Milliseconds `tz` is ahead of UTC at `at` (e.g. +5 h for Asia/Karachi). */
function tzOffsetMs(tz: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight of "today" in the workspace timezone, as an ISO instant (matches the server's spend day). */
export function startOfDayIso(tz: string, now = Date.now()): string {
  let offset = 0;
  try {
    offset = tzOffsetMs(tz, new Date(now));
  } catch {
    offset = -new Date(now).getTimezoneOffset() * 60_000; // unknown tz name → browser's zone
  }
  const localMidnight = Math.floor((now + offset) / 86_400_000) * 86_400_000;
  return new Date(localMidnight - offset).toISOString();
}
