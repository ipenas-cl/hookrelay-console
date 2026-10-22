export function relativeTime(ms: number, now = Date.now()): string {
  const d = Math.round((ms - now) / 1000);
  const abs = Math.abs(d);
  const [v, u] = abs < 60 ? [abs, "s"] : abs < 3600 ? [Math.round(abs / 60), "m"] : abs < 86400 ? [Math.round(abs / 3600), "h"] : [Math.round(abs / 86400), "d"];
  return d >= 0 ? `in ${v}${u}` : `${v}${u} ago`;
}

export function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
