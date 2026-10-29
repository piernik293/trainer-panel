import { buildActivityGrid } from "@/lib/shell/activity";
import { pluralPl as plural } from "@/lib/plural";

const CELL = 10; const GAP = 2; const STEP = CELL + GAP;

/** "Mapa roku": one square per day of the last 53 weeks; a filled square = a day with a completed training. Information only. */
export function ActivityMap({ days, today }: { days: readonly string[]; today: string }) {
  const { weeks, total } = buildActivityGrid(days, today);
  const label = `Mapa aktywności: ${total} ${plural(total, "dzień", "dni", "dni")} z treningiem w ostatnich 12 miesiącach`;
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${weeks.length * STEP - GAP} ${7 * STEP - GAP}`} className="block h-auto w-full" data-testid="activity-map">
        {weeks.map((col, w) => col.map((c, d) => (
          <rect
            key={c.date} x={w * STEP} y={d * STEP} width={CELL} height={CELL} rx={2}
            className={c.future ? "fill-transparent" : c.active ? "fill-primary" : "fill-muted"}
            data-date={c.date} data-active={c.active ? "1" : "0"}
          />
        )))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>12 miesięcy temu</span><span>dziś</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{total} {plural(total, "dzień", "dni", "dni")} z treningiem w ostatnim roku</p>
    </div>
  );
}
