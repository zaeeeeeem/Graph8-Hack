/**
 * site — read a company's public website as plain text (W13 "any company").
 * Used when graph8 has no company docs for the domain (or its docs are about another company): homepage + /about over
 * plain HTTPS, 8 s timeout per page, HTML stripped, capped at 15k chars. Never throws; returns what it could read.
 */

export const SITE_TIMEOUT_MS = 8_000;
export const SITE_MAX_CHARS = 15_000;
const UA = 'Mozilla/5.0 (compatible; GraphiBot/1.0; +https://graph8.com)';
const ABOUT_PATHS = ['/about', '/about-us', '/company'];

export interface SitePage { url: string; title: string; description: string; text: string }
export interface SiteText { domain: string; pages: SitePage[]; text: string }

type Fetch = typeof fetch;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
    .replace(/&([a-z0-9#]+);/gi, (m, k) => ENTITIES[k.toLowerCase()] ?? m);
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0] ?? '';
  return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim();
}

/** HTML → readable text: drop script/style/svg/nav chrome, keep headings and paragraphs as lines. */
export function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const description = meta(html, 'description') || meta(html, 'og:description');
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|h[1-6]|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/header|\/footer|\/nav|\/ul|\/tr|\/button)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((l) => l.length > 1)
    .filter((l, i, a) => a.indexOf(l) === i) // menus/footers repeat
    .join('\n');
  return { title, description, text };
}

/** Only public hostnames — a founder-typed domain must never make us hit localhost or a private range. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return false; // also rejects bare IPv4 / IPv6
  return !/(^|\.)(localhost|local|internal|lan)$/.test(h);
}

async function getPage(url: string, f: Fetch, timeoutMs: number): Promise<SitePage | null> {
  try {
    const res = await f(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|text\/plain/i.test(type)) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    const { title, description, text } = htmlToText(html);
    if (!text && !description) return null;
    return { url: res.url || url, title, description, text };
  } catch {
    return null;
  }
}

/** Homepage + first /about-style page that answers, in parallel. Plain text, ≤ SITE_MAX_CHARS. */
export async function readSite(domain: string, opts: { fetch?: Fetch; timeoutMs?: number; maxChars?: number } = {}): Promise<SiteText> {
  const f = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? SITE_TIMEOUT_MS;
  const max = opts.maxChars ?? SITE_MAX_CHARS;
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!isPublicHost(host)) return { domain: host, pages: [], text: '' };
  const base = `https://${host}`;
  const [home, ...abouts] = await Promise.all([getPage(base, f, timeoutMs), ...ABOUT_PATHS.map((p) => getPage(base + p, f, timeoutMs))]);
  // Sites that 200 every path with the homepage: skip an "about" identical to home.
  const about = abouts.find((p) => p && p.text !== home?.text) ?? null;
  const pages = [home, about].filter((p): p is SitePage => !!p);
  const parts = pages.map((p) => [`## ${p.url}`, p.title && `Title: ${p.title}`, p.description && `Description: ${p.description}`, p.text].filter(Boolean).join('\n'));
  // Give each page a fair share so a huge homepage can't crowd out /about.
  const share = Math.floor(max / Math.max(parts.length, 1));
  const text = parts.map((p) => p.slice(0, share)).join('\n\n').slice(0, max);
  return { domain: host, pages, text };
}
