/** PII scrubbing for anything that leaves the server (Slack, reports, lead_events summaries, logs). */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w-])\+?\d[\d\s().-]{7,}\d(?![\w-])/g;
const URL_WITH_EMAIL = /mailto:[^\s>]+/gi;

export function scrub(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(URL_WITH_EMAIL, '[email]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

/** Drop quoted history ("On … wrote:", "> …") so we classify only what the prospect just wrote. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+wrote:\s*$/i.test(line)) break;
    if (/^-{2,}\s*Original Message/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length) break;
    out.push(line);
  }
  return out.join('\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/** Short one-line preview, scrubbed. */
export function preview(text: string, max = 160): string {
  const s = scrub(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
