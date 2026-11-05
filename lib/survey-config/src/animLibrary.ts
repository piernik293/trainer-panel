/**
 * Biblioteka animacji ćwiczeń (dane): 8 z 10 planowanych (wykrok w tył i wspięcia jednostronne wymagają DWÓCH nóg — model ma jedną; zob. docs/ANIMACJE.md). Z najczęstszych ćwiczeń z docs/GRAFIKI-TOP50.csv. Wszystkie startują jako „do sprawdzenia” —
 * w aplikacji widać wyłącznie zatwierdzone przez właściciela. Technika: kolana w linii stóp, neutralny kręgosłup, pełny zakres; przy wątpliwościach prostszy ruch.
 * Kąty pisane bezwzględnie (od pionu w prawo), zamieniane na kąty stawów funkcjami foot()/hand(); ramiona sięgają podłoża przez armsTo() (kinematyka odwrotna).
 */
import { type AnimSpec, type AnimPose, type AnimProp, type SegmentName, solve, VIEW } from "./animModel";

const FLOOR = 236;
const L = { shank: 50, thigh: 52, trunk: 62, upperArm: 32, forearm: 30, head: 12 } as const;
const f1 = (n: number) => Math.round(n * 10) / 10;

/** Poza stojąca/leżąca (kotwica = kostka): kąty bezwzględne odcinków od kostki w górę + ramię z barku. */
export function foot(a: { shank: number; thigh: number; trunk: number }, arm: [number, number] | { up: number; fore: number } = [180, 0], head = 0, lift = 0): AnimPose {
  const rel: number[] = [f1(a.thigh - a.shank), f1(a.trunk - a.thigh)]; // różnice zwykłe (bez zawijania), żeby interpolacja nie szła „dookoła”
  const armRel: [number, number] = Array.isArray(arm) ? arm : [f1(arm.up - a.trunk), f1(arm.fore - arm.up)];
  return { base: a.shank, rel, arm: armRel, head, ...(lift ? { lift } : {}) };
}
/** Poza podporowa (kotwica = nadgarstek): kąty bezwzględne od nadgarstka: przedramię → ramię → tułów → udo → goleń. */
export function hand(a: { forearm: number; upperArm: number; trunk: number; thigh: number; shank: number }, head = 0): AnimPose {
  return { base: a.forearm, rel: [f1(a.upperArm - a.forearm), f1(a.trunk - a.upperArm), f1(a.thigh - a.trunk), f1(a.shank - a.thigh)], head };
}

/** Kinematyka odwrotna ramienia: kąty bezwzględne (ramię, przedramię) tak, by nadgarstek trafił w punkt; łokieć „w dół/do tyłu”. */
export function armsTo(shoulder: { x: number; y: number }, target: { x: number; y: number }, elbowBack = true): { up: number; fore: number } {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y; let d = Math.hypot(dx, dy);
  const a = L.upperArm, b = L.forearm; d = Math.min(d, a + b - 0.01);
  const toTarget = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = w górę
  const cosA = (a * a + d * d - b * b) / (2 * a * d); const alpha = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
  const up = toTarget + (elbowBack ? -alpha : alpha);
  const ex = shoulder.x + a * Math.sin((up * Math.PI) / 180), ey = shoulder.y - a * Math.cos((up * Math.PI) / 180);
  const fore = (Math.atan2(target.x - ex, -(target.y - ey)) * 180) / Math.PI;
  return { up, fore };
}

type Draft = Omit<AnimSpec, "version" | "floorY" | "lengths" | "mode"> & { mode?: AnimSpec["mode"] };
const mk = (d: Draft): AnimSpec => ({ version: 1, floorY: FLOOR, lengths: { ...L }, ...d, mode: d.mode ?? "foot" });
const floorLine: AnimProp = { kind: "line", x1: 10, y1: FLOOR, x2: 230, y2: FLOOR, width: 3 };
/** Kąty o tej samej wartości mod 360 różnią się o pełny obrót — dopasowujemy je do poprzedniej klatki, żeby interpolacja nie szła „dookoła”. */
function unwrap(poses: AnimPose[]): AnimPose[] {
  const fix = (v: number, prev: number) => { let x = v; while (x - prev > 180) x -= 360; while (x - prev < -180) x += 360; return x; };
  const out: AnimPose[] = [];
  poses.forEach((p, i) => {
    if (i === 0) { out.push(p); return; }
    const q = out[i - 1]!;
    out.push({ ...p, base: fix(p.base, q.base), rel: p.rel.map((v, j) => fix(v, q.rel[j] ?? v)), ...(p.arm ? { arm: [fix(p.arm[0], q.arm?.[0] ?? p.arm[0]), fix(p.arm[1], q.arm?.[1] ?? p.arm[1])] as [number, number] } : {}) });
  });
  return out;
}
const loop = (poses: AnimPose[], times: number[]): AnimSpec["frames"] => { const u = unwrap(poses); return [...u.map((pose, i) => ({ t: times[i]!, pose })), { t: 1, pose: u[0]! }]; };

/** Ciało pod kątem (pompki, deska): kostka na podłodze, ręce IK do podłoża pod barkiem. */
function plankPose(tilt: number, wristDx: number, anchor: { x: number; y: number }, kneeOnFloor = false): AnimPose {
  const body = kneeOnFloor ? { shank: 90, thigh: tilt, trunk: tilt } : { shank: tilt, thigh: tilt, trunk: tilt };
  const probe: AnimSpec = { ...mk({ duration: 2.4, anchor, accent: [], frames: [], staticFrame: 0 }) };
  const sk = solve(probe, foot(body));
  const arm = armsTo(sk.points.shoulder, { x: sk.points.shoulder.x + wristDx, y: FLOOR - 4 }, true);
  return foot(body, arm, 10);
}

/** Pompki: wiele klatek wzdłuż łagodnej krzywej, każda z ręką dokładnie na podłożu (kinematyka odwrotna) — dłoń nie „pływa” między klatkami. */
function pushLoop(top: number, bottom: number, dxBottom: number, anchor: { x: number; y: number }, knees: boolean): AnimSpec["frames"] {
  const n = 8; const poses: AnimPose[] = []; const times: number[] = [];
  for (let i = 0; i < n; i++) { const u = i / n; const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * u); poses.push(plankPose(top + (bottom - top) * k, dxBottom * k, anchor, knees)); times.push(u); }
  return loop(poses, times);
}
const ANKLE = { x: 110, y: FLOOR - 8 };
export const ANIMATION_LIBRARY: { exerciseId: number; name: string; spec: AnimSpec }[] = [
  { exerciseId: 117, name: "Pompki klasyczne", spec: mk({ duration: 2.4, anchor: { x: 30, y: FLOOR - 8 }, accent: ["upperArm", "trunk"], staticFrame: 4, props: [floorLine],
    frames: pushLoop(68, 80, -6, { x: 30, y: FLOOR - 8 }, false) }) },
  { exerciseId: 118, name: "Pompki na kolanach", spec: mk({ duration: 2.4, anchor: { x: 30, y: FLOOR - 8 }, accent: ["upperArm", "trunk"], staticFrame: 4, props: [floorLine],
    frames: pushLoop(58, 76, -6, { x: 30, y: FLOOR - 8 }, true) }) },
  { exerciseId: 5, name: "Plank", spec: mk({ duration: 3, anchor: { x: 30, y: FLOOR - 8 }, accent: ["trunk", "thigh"], staticFrame: 0, props: [floorLine],
    note: "Deska na przedramionach. Ćwiczenie izometryczne: pozycja z delikatnym ruchem oddechu (wdech/wydech).",
    frames: loop([plankPose(77.5, 30, { x: 30, y: FLOOR - 8 }), plankPose(78.5, 30, { x: 30, y: FLOOR - 8 })], [0, 0.5]) }) },
  { exerciseId: 105, name: "Glute bridge", spec: mk({ duration: 3, anchor: { x: 205, y: FLOOR - 8 }, accent: ["thigh", "trunk"], staticFrame: 1, props: [floorLine],
    frames: loop([foot({ shank: -20, thigh: -128, trunk: -92 }, { up: -92, fore: -92 }), foot({ shank: -20, thigh: -98, trunk: -104 }, { up: -92, fore: -92 })], [0, 0.45]) }) },
  { exerciseId: 90, name: "Przysiad do skrzyni z masą własnego ciała", spec: mk({ duration: 3, anchor: ANKLE, accent: ["thigh", "shank"], staticFrame: 1,
    props: [floorLine, { kind: "rect", x: 50, y: 188, w: 36, h: 48, fill: "#E2DCD6" }],
    frames: loop([foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 90, fore: 90 }), foot({ shank: 38, thigh: -80, trunk: 28 }, { up: 90, fore: 90 })], [0, 0.45]) }) },
  { exerciseId: 259, name: "Wspięcia na palce obunóż stojąc", spec: mk({ duration: 2.4, anchor: { x: 110, y: FLOOR - 8 }, accent: ["shank"], staticFrame: 1, props: [floorLine],
    frames: loop([foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 180, fore: 180 }), foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 180, fore: 180 }, 0, 10)], [0, 0.5]) }) },
  { exerciseId: 4, name: "Wyciskanie hantli nad głowę", spec: mk({ duration: 3, anchor: ANKLE, accent: ["upperArm", "forearm"], staticFrame: 1, props: [floorLine, { kind: "weight", at: "wrist", r: 7 }],
    frames: loop([foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 70, fore: 0 }), foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 4, fore: 0 })], [0, 0.45]) }) },
  { exerciseId: 101, name: "Martwy ciąg rumuński z hantlami", spec: mk({ duration: 3, anchor: ANKLE, accent: ["thigh", "trunk"], staticFrame: 1, props: [floorLine, { kind: "weight", at: "wrist", r: 7 }],
    frames: loop([foot({ shank: 0, thigh: 0, trunk: 0 }, { up: 180, fore: 180 }), foot({ shank: 4, thigh: -6, trunk: -64 }, { up: 180, fore: 176 })], [0, 0.5]) }) },
];
export { VIEW };
export type { SegmentName };
