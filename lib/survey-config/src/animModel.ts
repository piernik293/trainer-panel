/**
 * System animacji ćwiczeń — MODEL DANYCH (bez zewnętrznych bibliotek).
 * Sylwetka 2D z boku, zwrócona w prawo: szkielet z odcinków (goleń, udo, tułów, ramię, przedramię) i głową, poruszany KĄTAMI STAWÓW w klatkach kluczowych.
 * Konwencja kątów: 0° = w górę, dodatnie = zgodnie z ruchem wskazówek zegara (w prawo), stopnie.
 *  tryb „foot”: kotwica = kostka (ćwiczenia stojące/leżące na plecach); łańcuch: goleń → udo → tułów (stawy: kolano, biodro), ramię z barku.
 *  tryb „hand”: kotwica = nadgarstek (pompki, deska); łańcuch: przedramię → ramię → tułów → udo → goleń (stawy: łokieć, bark, biodro, kolano).
 * `base` = kąt bezwzględny pierwszego odcinka łańcucha, `rel[i]` = kąt stawu względem poprzedniego odcinka, `arm` = [bark, łokieć] względem tułowia (tryb foot).
 */
export type AnimMode = "foot" | "hand";
export interface AnimPose { base: number; rel: number[]; arm?: [number, number]; head?: number; /** uniesienie kotwicy (px) — wspięcia na palce: pięta w górę */ lift?: number }
export interface AnimFrame { t: number; pose: AnimPose }
export type SegmentName = "shank" | "thigh" | "trunk" | "upperArm" | "forearm";
export interface AnimSpec {
  version: 1;
  mode: AnimMode;
  duration: number; // sekundy pętli (2–3 s)
  anchor: { x: number; y: number };
  floorY: number;
  lengths: Record<SegmentName, number> & { head: number };
  frames: AnimFrame[]; // pierwsza i ostatnia klatka identyczne (pętla bez skoku)
  accent: SegmentName[]; // pracujące partie (kolor akcentu)
  props?: AnimProp[]; // statyczne rekwizyty (podłoga, ławka, skrzynia) i przypięte (hantla)
  staticFrame: number; // klatka dla „ogranicz ruch” i pauzy
  note?: string;
}
export type AnimProp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width?: number }
  | { kind: "weight"; at: "wrist"; r?: number };

export const VIEW = { w: 240, h: 260 } as const;
export const ACCENT = "#C2410C";
const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (deg: number) => ({ x: Math.sin(rad(deg)), y: -Math.cos(rad(deg)) });

export interface Skeleton {
  points: Record<"ankle" | "knee" | "hip" | "shoulder" | "elbow" | "wrist" | "head", { x: number; y: number }>;
  segments: { name: SegmentName; from: { x: number; y: number }; to: { x: number; y: number } }[];
}
const add = (p: { x: number; y: number }, deg: number, len: number) => { const d = dir(deg); return { x: p.x + d.x * len, y: p.y + d.y * len }; };

/** Kinematyka prosta: z kotwicy i kątów stawów liczy położenie wszystkich punktów. */
export function solve(spec: AnimSpec, pose: AnimPose): Skeleton {
  const L = spec.lengths; const a0 = spec.anchor;
  if (spec.mode === "foot") {
    const aShank = pose.base, aThigh = aShank + (pose.rel[0] ?? 0), aTrunk = aThigh + (pose.rel[1] ?? 0);
    const ankle = { x: a0.x, y: a0.y - (pose.lift ?? 0) }, knee = add(ankle, aShank, L.shank), hip = add(knee, aThigh, L.thigh), shoulder = add(hip, aTrunk, L.trunk);
    const aUp = aTrunk + (pose.arm?.[0] ?? 180), aFore = aUp + (pose.arm?.[1] ?? 0);
    const elbow = add(shoulder, aUp, L.upperArm), wrist = add(elbow, aFore, L.forearm);
    const head = add(shoulder, aTrunk + (pose.head ?? 0), L.head * 1.6);
    return { points: { ankle, knee, hip, shoulder, elbow, wrist, head }, segments: [
      { name: "shank", from: ankle, to: knee }, { name: "thigh", from: knee, to: hip }, { name: "trunk", from: hip, to: shoulder },
      { name: "upperArm", from: shoulder, to: elbow }, { name: "forearm", from: elbow, to: wrist } ] };
  }
  const aFore = pose.base, aUp = aFore + (pose.rel[0] ?? 0), aTrunk = aUp + (pose.rel[1] ?? 0), aThigh = aTrunk + (pose.rel[2] ?? 0), aShank = aThigh + (pose.rel[3] ?? 0);
  const wrist = a0, elbow = add(wrist, aFore, L.forearm), shoulder = add(elbow, aUp, L.upperArm), hip = add(shoulder, aTrunk, L.trunk);
  const knee = add(hip, aThigh, L.thigh), ankle = add(knee, aShank, L.shank);
  const head = add(shoulder, aTrunk + 180 + (pose.head ?? 0), L.head * 1.6);
  return { points: { ankle, knee, hip, shoulder, elbow, wrist, head }, segments: [
    { name: "forearm", from: wrist, to: elbow }, { name: "upperArm", from: elbow, to: shoulder }, { name: "trunk", from: shoulder, to: hip },
    { name: "thigh", from: hip, to: knee }, { name: "shank", from: knee, to: ankle } ] };
}

const ease = (t: number) => t * t * (3 - 2 * t); // gładkie wejście i wyjście
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function poseAt(frames: AnimFrame[], u: number): AnimPose {
  const x = ((u % 1) + 1) % 1;
  let i = 0; while (i < frames.length - 2 && x >= frames[i + 1]!.t) i++;
  const a = frames[i]!, b = frames[i + 1]!; const span = b.t - a.t || 1; const k = ease(Math.min(1, Math.max(0, (x - a.t) / span)));
  const rel = a.pose.rel.map((v, j) => lerp(v, b.pose.rel[j] ?? v, k));
  const arm = a.pose.arm ? ([lerp(a.pose.arm[0], b.pose.arm?.[0] ?? a.pose.arm[0], k), lerp(a.pose.arm[1], b.pose.arm?.[1] ?? a.pose.arm[1], k)] as [number, number]) : undefined;
  return { base: lerp(a.pose.base, b.pose.base, k), rel, ...(arm ? { arm } : {}), head: lerp(a.pose.head ?? 0, b.pose.head ?? 0, k), lift: lerp(a.pose.lift ?? 0, b.pose.lift ?? 0, k) };
}

/** Walidacja danych animacji (używana przy zapisie, w testach i w panelu): zwraca listę problemów. */
export function validateSpec(spec: AnimSpec): string[] {
  const p: string[] = [];
  if (spec.version !== 1) p.push("Nieznana wersja");
  if (!(spec.duration >= 1.5 && spec.duration <= 4)) p.push("Pętla powinna trwać 1,5–4 s");
  if (spec.frames.length < 3) p.push("Za mało klatek kluczowych");
  const f0 = spec.frames[0], fl = spec.frames[spec.frames.length - 1];
  if (!f0 || !fl || f0.t !== 0 || fl.t !== 1) p.push("Klatki muszą zaczynać się w 0 i kończyć w 1");
  else if (JSON.stringify(f0.pose) !== JSON.stringify(fl.pose)) p.push("Pierwsza i ostatnia klatka muszą być takie same (pętla bez skoku)");
  for (let i = 1; i < spec.frames.length; i++) if (spec.frames[i]!.t <= spec.frames[i - 1]!.t) p.push("Czasy klatek muszą rosnąć");
  const n = spec.mode === "foot" ? 2 : 4;
  for (const f of spec.frames) if (f.pose.rel.length !== n) { p.push(`Tryb ${spec.mode}: ${n} stawy w łańcuchu`); break; }
  if (spec.staticFrame < 0 || spec.staticFrame >= spec.frames.length) p.push("Zła klatka statyczna");
  // kotwica nie może „odjeżdżać”: żaden punkt nie schodzi pod podłogę i nic nie wychodzi poza kadr
  for (const f of spec.frames) {
    for (const [k, pt] of Object.entries(solve(spec, f.pose).points)) {
      if (pt.y > spec.floorY + 3) { p.push(`Punkt ${k} pod podłogą`); break; }
      if (pt.x < -2 || pt.x > VIEW.w + 2 || pt.y < -2) { p.push(`Punkt ${k} poza kadrem`); break; }
    }
  }
  return [...new Set(p)];
}
