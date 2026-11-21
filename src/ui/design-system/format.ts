/** Display only. Does not round, change or persist the underlying currency value. */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const n = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  const short = (v: number) => v.toFixed(1).replace(/\.0$/, '');
  if (n >= 999_950) return `${sign}${short(n / 1_000_000)}M`;
  if (n >= 10_000) return `${sign}${short(n / 1_000)}K`;
  return `${sign}${Math.round(n).toLocaleString('en-US')}`;
}
