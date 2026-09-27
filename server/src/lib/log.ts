/**
 * log — one-line JSON-ish console logger with scopes. Redacts emails, phone-like digit runs and bearer/API keys
 * so a careless `data` object never leaks PII or secrets into logs.
 */
import type { Logger } from '../contracts';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;
const SECRET = /\b(xox[abp]-[\w-]+|xapp-[\w-]+|sk-[\w-]{10,}|AIza[\w-]{20,}|eyJ[\w-]{20,}\.[\w-]+\.[\w-]+|Bearer\s+[\w.-]+)/g;
const SECRET_KEYS = /(key|token|secret|password|authorization)/i;

export function redact(s: string): string {
  return s.replace(SECRET, '[secret]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

function clean(data: unknown, depth = 0): unknown {
  if (data == null || depth > 4) return data;
  if (typeof data === 'string') return redact(data);
  if (Array.isArray(data)) return data.slice(0, 20).map((d) => clean(d, depth + 1));
  if (data instanceof Error) return { name: data.name, message: redact(data.message) };
  if (typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as object)) out[k] = SECRET_KEYS.test(k) ? '[secret]' : clean(v, depth + 1);
    return out;
  }
  return data;
}

function make(scope: string): Logger {
  const emit = (level: 'info' | 'warn' | 'error', msg: string, data?: object) => {
    const t = new Date().toISOString().slice(11, 23);
    const line = `${t} ${level.toUpperCase().padEnd(5)} [${scope}] ${redact(msg)}`;
    const extra = data ? ' ' + JSON.stringify(clean(data)) : '';
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line + extra);
  };
  return {
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
    child: (s) => make(`${scope}:${s}`),
  };
}

export const log: Logger = make('graphi');
