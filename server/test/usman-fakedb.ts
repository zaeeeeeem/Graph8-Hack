/** Tiny in-memory stand-in for the Supabase query builder subset Usman uses. Test helper only. */
type Row = Record<string, any>;

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let idn = 1;
  const t = (name: string) => (tables[name] ??= []);

  function query(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: any;
    let lim: number | undefined;
    let order: { col: string; asc: boolean } | undefined;
    const q: any = {
      select() { return q; },
      insert(p: any) { op = 'insert'; payload = p; return q; },
      update(p: any) { op = 'update'; payload = p; return q; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return q; },
      in(c: string, vs: any[]) { filters.push((r) => vs.includes(r[c])); return q; },
      is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return q; },
      not(c: string, _op: string, v: any) { filters.push((r) => (r[c] ?? null) !== v); return q; },
      contains(c: string, v: Row) { filters.push((r) => Object.entries(v).every(([k, x]) => r[c]?.[k] === x)); return q; },
      order(col: string, o?: { ascending?: boolean }) { order = { col, asc: o?.ascending !== false }; return q; },
      limit(n: number) { lim = n; return q; },
      then(res: (v: any) => any, rej?: (e: any) => any) {
        try {
          if (op === 'insert') {
            const rows = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({ id: p.id ?? `${name}-${idn++}`, created_at: new Date().toISOString(), ...p }));
            t(name).push(...rows);
            return Promise.resolve({ data: rows, error: null }).then(res, rej);
          }
          let rows = t(name).filter((r) => filters.every((f) => f(r)));
          if (op === 'update') { rows.forEach((r) => Object.assign(r, payload)); return Promise.resolve({ data: rows, error: null }).then(res, rej); }
          if (order) rows = [...rows].sort((a, b) => ((a[order!.col] ?? 0) > (b[order!.col] ?? 0) ? 1 : -1) * (order!.asc ? 1 : -1));
          if (lim !== undefined) rows = rows.slice(0, lim);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return q;
  }
  return { tables, from: (name: string) => query(name) };
}
