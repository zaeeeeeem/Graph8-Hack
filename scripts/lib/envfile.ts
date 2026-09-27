/** .env file edits for scripts/switch-org.ts. Pure; never logs values. */

/** Replace/insert KEY=value and comment out old-org lines. Pure (tested). Never logs values. */
export function editEnvText(text: string, set: Record<string, string>, disable: string[]): string {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
    if (!m) return line;
    const k = m[1]!;
    if (k in set) { seen.add(k); return `${k}=${set[k]}`; }
    if (disable.includes(k)) return `# ${line}  # old graph8 org, disabled by switch-org`;
    return line;
  });
  for (const [k, v] of Object.entries(set)) if (!seen.has(k)) out.push(`${k}=${v}`);
  return out.join('\n');
}
