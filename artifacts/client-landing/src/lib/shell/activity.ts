/** Map of the year: a grid of weeks (columns, Monday first) × weekdays (rows) for the last 53 weeks. Pure. */
export interface MapCell { date: string; active: boolean; future: boolean }

const shift = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const mondayOf = (date: string) => shift(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
export const MAP_WEEKS = 53;

export function buildActivityGrid(activeDays: readonly string[], today: string): { weeks: MapCell[][]; total: number } {
  const active = new Set(activeDays);
  const first = shift(mondayOf(today), -(MAP_WEEKS - 1) * 7);
  const weeks: MapCell[][] = [];
  let total = 0;
  for (let w = 0; w < MAP_WEEKS; w++) {
    const col: MapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = shift(first, w * 7 + d);
      const future = date > today;
      const on = !future && active.has(date);
      if (on) total++;
      col.push({ date, active: on, future });
    }
    weeks.push(col);
  }
  return { weeks, total };
}
