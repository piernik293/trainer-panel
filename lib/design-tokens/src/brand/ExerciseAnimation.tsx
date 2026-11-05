/** Animacja ćwiczenia (SVG + requestAnimationFrame, bez bibliotek). Pokazuj WYŁĄCZNIE zatwierdzone (decyduje API). „Ogranicz ruch” = klatka statyczna; przycisk pauzy. */
import { useEffect, useRef, useState } from "react";
import { solve, poseAt, VIEW, ACCENT, type AnimSpec } from "@workspace/survey-config";

const WIDTHS = { shank: 11, thigh: 13, trunk: 15, upperArm: 8, forearm: 7 } as const;

function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!m) return;
    const on = () => setR(m.matches); m.addEventListener?.("change", on); return () => m.removeEventListener?.("change", on);
  }, []);
  return r;
}

export function ExerciseFigure({ spec, u }: { spec: AnimSpec; u: number }) {
  const sk = solve(spec, poseAt(spec.frames, u));
  const accent = new Set(spec.accent);
  const order = spec.mode === "foot" ? ["upperArm", "forearm", "shank", "thigh", "trunk"] : ["shank", "thigh", "trunk", "upperArm", "forearm"];
  const segs = order.map((n) => sk.segments.find((s) => s.name === n)!).filter(Boolean);
  const ankle = sk.points.ankle;
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="h-full w-full" role="img" aria-hidden="false" focusable="false">
      {(spec.props ?? []).map((p, i) => p.kind === "line" ? <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#E2DCD6" strokeWidth={p.width ?? 3} />
        : p.kind === "rect" ? <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={3} fill={p.fill ?? "#E2DCD6"} />
        : <circle key={i} cx={sk.points.wrist.x} cy={sk.points.wrist.y} r={p.r ?? 7} fill="#57534E" />)}
      <line x1={ankle.x - 8} y1={ankle.y + 7} x2={ankle.x + 14} y2={Math.max(ankle.y + 7, spec.floorY - 4)} stroke="#1C1917" strokeWidth={8} strokeLinecap="round" />
      {segs.map((s) => <line key={s.name} x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y} stroke={accent.has(s.name) ? ACCENT : s.name === "upperArm" || s.name === "forearm" ? "#57534E" : "#1C1917"} strokeWidth={WIDTHS[s.name]} strokeLinecap="round" />)}
      <circle cx={sk.points.head.x} cy={sk.points.head.y} r={spec.lengths.head} fill="#1C1917" />
    </svg>
  );
}

export function ExerciseAnimation({ spec, label, className = "" }: { spec: AnimSpec; label: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [u, setU] = useState(() => spec.frames[spec.staticFrame]!.t);
  const startRef = useRef<number | null>(null);
  const still = reduced || paused;
  useEffect(() => {
    if (still) { setU(spec.frames[spec.staticFrame]!.t); return; }
    let raf = 0; startRef.current = null;
    const tick = (now: number) => { startRef.current ??= now; setU((((now - startRef.current) / 1000) / spec.duration) % 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [still, spec]);
  return (
    <figure className={`relative ${className}`} data-testid="exercise-animation" aria-label={`Animacja: ${label}`}>
      <div className="aspect-[240/260] w-full max-w-[260px]"><ExerciseFigure spec={spec} u={u} /></div>
      {!reduced && (
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted-foreground" data-testid="animation-pause">
          {paused ? "Odtwórz animację" : "Wstrzymaj animację"}
        </button>
      )}
    </figure>
  );
}
