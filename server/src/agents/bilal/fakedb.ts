/**
 * Minimal in-memory stand-in for the Supabase query builder, used by server/test/{bilal,hira}*.test.ts only.
 * Supports the chains Bilal/Hira use: select/eq/in/order/limit/insert/update/upsert (+ head count).
 */
type Row = Record<string, any>;

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let seq = 0;
  const t = (name: string) => (tables[name] ??= []);

  function from(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: any; let onConflict = 'id'; let wantRows = false; let head = false; let limitN = Infinity;
    let orderBy: { col: string; asc: boolean } | null = null;
    const b: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) { wantRows = true; head = !!opts?.head; return b; },
      eq(col: string, v: any) { filters.push((r) => r[col] === v); return b; },
      in(col: string, vs: any[]) { filters.push((r) => vs.includes(r[col])); return b; },
      order(col: string, o?: { ascending?: boolean }) { orderBy = { col, asc: o?.ascending !== false }; return b; },
      limit(n: number) { limitN = n; return b; },
      insert(p: any) { op = 'insert'; payload = p; return b; },
      update(p: any) { op = 'update'; payload = p; return b; },
      upsert(p: any, o?: { onConflict?: string }) { op = 'upsert'; payload = p; onConflict = o?.onConflict ?? 'id'; return b; },
      then(res: (v: any) => void, rej?: (e: any) => void) {
        try { res(exec()); } catch (e) { rej?.(e); }
      },
    };
    function exec() {
      const rows = t(name);
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: r.id ?? `${name}-${++seq}`, ...r }));
        rows.push(...list);
        return { data: wantRows ? list : null, error: null };
      }
      if (op === 'upsert') {
        for (const r of Array.isArray(payload) ? payload : [payload]) {
          const hit = rows.find((x) => x[onConflict] === r[onConflict]);
          if (hit) Object.assign(hit, r); else rows.push({ ...r });
        }
        return { data: null, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { matched.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      let out = [...matched];
      if (orderBy) { const { col, asc } = orderBy; out.sort((a, z) => ((a[col] ?? -1) - (z[col] ?? -1)) * (asc ? 1 : -1)); }
      out = out.slice(0, limitN);
      return { data: head ? null : out, error: null, count: matched.length };
    }
    return b;
  }
  return { from, tables };
}
