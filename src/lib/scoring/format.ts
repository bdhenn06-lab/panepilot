/** "$12,345" — rounded, thousands-separated. */
export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** "12,345" — rounded, thousands-separated. */
export function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Local YYYY-MM-DD for "today" (follow-up math runs on calendar days). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Add n days to a YYYY-MM-DD date string. */
export function addDays(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
