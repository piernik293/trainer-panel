/**
 * Story 9:16 (1080×1920 PNG) drawn in the browser on a canvas — no external services (docs/screens/ux-v2/Story.dc.html).
 * PRIVACY (hard rule): the picture can only contain what `StoryData` allows — logo, weekday, training name, time, kg, sets, record, streak and
 * the nick. Never pain, health data, body weight or a first/last name; without a nick there is no signature.
 */
export interface StoryData {
  /** "WTOREK" */ weekday: string;
  /** training day name, e.g. "Góra ciała" */ title: string;
  /** whole minutes */ minutes: number;
  /** total kg lifted; null → the tile shows repetitions instead */ kg: number | null;
  reps: number;
  sets: number;
  record: { name: string; weightKg: number; reps: number } | null;
  streakWeeks: number | null;
  /** dots of the current week: done / planned */ weekDone: number; weekTarget: number;
  /** only a nick (no first/last name); null = no signature */ nick: string | null;
}

export const STORY_W = 1080;
export const STORY_H = 1920;
const K = STORY_W / 390; // the mock-up is drawn at 390 px width
const nf = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");  // pl-PL does not group four digits; the mock-up does
const kgText = (n: number) => String(n).replace(".", ",");
const weeksWord = (n: number) => (n === 1 ? "tydzień" : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? "tygodnie" : "tygodni");

/** Texts that end up on the picture (also used by the privacy test). */
export function storyTexts(d: StoryData): string[] {
  const t = [`${d.weekday} · TRENING`, d.title, "Czas", `${d.minutes} min`, d.kg != null ? "Podniesione" : "Powtórzenia", d.kg != null ? `${nf(d.kg)} kg` : String(d.reps), "Serie", String(d.sets), "Optimatren"];
  if (d.record) t.push("NOWY REKORD", `${d.record.name} · ${kgText(d.record.weightKg)} kg × ${d.record.reps}`);
  const sig = [d.streakWeeks ? `${d.streakWeeks} ${weeksWord(d.streakWeeks)} z rzędu` : "", d.nick ? `@${d.nick}` : ""].filter(Boolean).join(" · ");
  if (sig) t.push(sig);
  return t;
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, weight: number, color: string) {
  let size = px;
  c.font = `${weight} ${size}px Manrope, system-ui, sans-serif`;
  while (c.measureText(text).width > maxW && size > 18) { size -= 2; c.font = `${weight} ${size}px Manrope, system-ui, sans-serif`; }
  c.fillStyle = color; c.fillText(text, x, y);
}

export function drawStory(c: CanvasRenderingContext2D, d: StoryData): void {
  const font = (px: number, w: number) => `${w} ${px * K}px Manrope, system-ui, sans-serif`;
  const pad = 28 * K;
  c.fillStyle = "#161210"; c.fillRect(0, 0, STORY_W, STORY_H);
  c.textBaseline = "alphabetic"; c.textAlign = "left";
  // logo
  c.fillStyle = "#C2410C"; rr(c, pad, 32 * K, 34 * K, 34 * K, 10 * K); c.fill();
  c.fillStyle = "#FFFFFF"; c.font = font(18, 800); c.fillText("O", pad + 10 * K, 32 * K + 25 * K);
  c.font = font(17, 800); c.fillText("Optimatren", pad + 46 * K, 32 * K + 24 * K);
  // heading
  let y = 32 * K + 34 * K + 24 * K + 16 * K;
  c.fillStyle = "#FDBA8C"; c.font = font(14, 700); c.fillText(`${d.weekday} · TRENING`, pad, y);
  y += 46 * K;
  fitText(c, d.title, pad, y, STORY_W - 2 * pad, 46 * K, 800, "#FFFFFF");
  // numbers
  y += 70 * K;
  c.fillStyle = "#A8A29E"; c.font = font(13, 500); c.fillText("Czas", pad, y);
  y += 42 * K;
  c.fillStyle = "#FFFFFF"; c.font = font(40, 800); c.fillText(`${d.minutes} min`, pad, y);
  y += 34 * K;
  const colW = (STORY_W - 2 * pad - 12 * K) / 2;
  const second = d.kg != null ? { label: "Podniesione", value: `${nf(d.kg)} kg` } : { label: "Powtórzenia", value: String(d.reps) };
  c.fillStyle = "#A8A29E"; c.font = font(13, 500); c.fillText(second.label, pad, y); c.fillText("Serie", pad + colW + 12 * K, y);
  y += 34 * K;
  c.fillStyle = "#FFFFFF"; c.font = font(30, 800); c.fillText(second.value, pad, y); c.fillText(String(d.sets), pad + colW + 12 * K, y);
  // record
  if (d.record) {
    y += 28 * K;
    const h = 66 * K;
    c.fillStyle = "#C2410C"; rr(c, pad, y, STORY_W - 2 * pad, h, 16 * K); c.fill();
    c.fillStyle = "#FFE4D4"; c.font = font(12, 800); c.fillText("NOWY REKORD", pad + 16 * K, y + 24 * K);
    fitText(c, `${d.record.name} · ${kgText(d.record.weightKg)} kg × ${d.record.reps}`, pad + 16 * K, y + 50 * K, STORY_W - 2 * pad - 32 * K, 17 * K, 800, "#FFFFFF");
  }
  // bottom: week dots + signature
  const bottom = STORY_H - 32 * K;
  const n = Math.max(0, Math.min(7, d.weekTarget));
  for (let i = 0; i < n; i++) {
    const cx = pad + 7 * K + i * 20 * K, cy = bottom - 8 * K;
    c.beginPath(); c.arc(cx, cy, 7 * K, 0, Math.PI * 2);
    if (i < d.weekDone) { c.fillStyle = "#C2410C"; c.fill(); } else { c.lineWidth = 2 * K; c.strokeStyle = "#C2410C"; c.stroke(); }
  }
  const sig = [d.streakWeeks ? `${d.streakWeeks} ${weeksWord(d.streakWeeks)} z rzędu` : "", d.nick ? `@${d.nick}` : ""].filter(Boolean).join(" · ");
  if (sig) { c.textAlign = "right"; c.fillStyle = "#D6D3D1"; c.font = font(14, 700); c.fillText(sig, STORY_W - pad, bottom); c.textAlign = "left"; }
}

export async function renderStoryBlob(d: StoryData): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W; canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawStory(ctx, d);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Web Share API with the file (phones → Instagram etc.); otherwise (or if it is refused) a download. Returns what happened. */
export async function shareStory(d: StoryData): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const blob = await renderStoryBlob(d);
  if (!blob) return "failed";
  const file = new File([blob], "optimatren-trening.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: "Optimatren" }); return "shared"; }
    catch (e) { if ((e as DOMException)?.name === "AbortError") return "cancelled"; /* otherwise fall back to the download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "optimatren-trening.png"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
