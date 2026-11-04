/** Timer settings (sound, vibration): both on by default, kept in this browser, shared by the timer screen and "Ty". */
import { useSyncExternalStore } from "react";

export interface TimerSettings { sound: boolean; vibration: boolean }
const KEY = "optimatren-timer:v1";
const listeners = new Set<() => void>();
let cache: TimerSettings | null = null;

function read(): TimerSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<TimerSettings>) : {};
    return { sound: p.sound !== false, vibration: p.vibration !== false };
  } catch { return { sound: true, vibration: true }; }
}
export function getTimerSettings(): TimerSettings { return (cache ??= read()); }
export function setTimerSettings(patch: Partial<TimerSettings>): void {
  cache = { ...getTimerSettings(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode: lasts until reload */ }
  listeners.forEach((l) => l());
}
export function useTimerSettings(): TimerSettings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getTimerSettings, getTimerSettings);
}
/** Tests only. */
export function resetTimerSettingsForTests(): void { cache = null; listeners.clear(); }
