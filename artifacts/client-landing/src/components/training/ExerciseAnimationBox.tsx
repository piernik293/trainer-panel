/** Animacja ćwiczenia w trakcie treningu (EXERCISE_ANIMATIONS_ENABLED; API oddaje tylko ZATWIERDZONE). Brak flagi / brak animacji / błąd = nic. */
import { useEffect, useState } from "react";
import { ExerciseAnimation } from "@workspace/design-tokens/brand";
import type { AnimSpec } from "@workspace/survey-config";

let enabledCache: Promise<boolean> | null = null;
const flag = (): Promise<boolean> => (enabledCache ??= fetch("/api/exercise-animations/status", { credentials: "include" })
  .then((r) => (r.ok ? r.json() : { enabled: false })).then((b: { enabled?: boolean }) => b.enabled === true).catch(() => false));
export const resetAnimationFlagForTests = () => { enabledCache = null; };

export function ExerciseAnimationBox({ exerciseId, name }: { exerciseId: number; name: string }) {
  const [spec, setSpec] = useState<AnimSpec | null>(null);
  useEffect(() => {
    let alive = true; setSpec(null);
    void (async () => {
      try {
        if (!(await flag())) return;
        const r = await fetch(`/api/exercise-animations/${exerciseId}`, { credentials: "include" });
        if (!r.ok) return;
        const b = (await r.json()) as { spec?: AnimSpec };
        if (alive && b.spec) setSpec(b.spec);
      } catch { /* bez animacji */ }
    })();
    return () => { alive = false; };
  }, [exerciseId]);
  if (!spec) return null;
  return <div className="my-2 flex justify-center rounded-2xl border border-border bg-card p-2" data-testid="set-animation"><ExerciseAnimation spec={spec} label={name} /></div>;
}
