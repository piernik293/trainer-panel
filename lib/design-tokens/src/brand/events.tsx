/**
 * MAPA ANIMACJI — JEDNO miejsce: zdarzenie → stan byczka → tekst → czas. Ekrany NIE wybierają stanu same, tylko wołają zdarzenie:
 * `<MascotEvent event="rest_timer" />` (pętla przy ekranie) albo `showMascot("streak_ended")` (krótka animacja nad ekranem).
 * Zasady: każda animacja krótka i pomijalna (dotknięcie), max jedna naraz (host pokazuje jedną), NIGDY w trakcie wykonywania serii
 * (`useMascotSuppressed(true)` na ekranie serii; po zapisaniu serii i w przerwie wolno), zdarzenia „raz” zapamiętują, że już były (localStorage).
 * Tę samą tabelę opisuje docs/MASKOTKA.md; test pokrycia: każdy z 19 stanów ma zdarzenie, żaden stan nie jest użyty poza tą mapą.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Maskotka, type MaskotkaRozmiar, type MaskotkaStan } from "./Maskotka";

export interface MascotEventDef {
  stan: MaskotkaStan;
  /** po `afterMs` przechodzi do kolejnego stanu (np. wave → idle) */
  then?: { stan: MaskotkaStan; afterMs: number };
  /** czas pokazania w ms; null = pętla do zamknięcia / końca ekranu */
  ms: number | null;
  /** pokaż tylko raz (zapamiętane); klucz zdarzenia może mieć sufiks (np. numer serii) */
  once?: boolean;
  text?: string;
  /** gdzie / kiedy (dokumentacja) */
  where: string;
}

export const MASCOT_EVENTS = {
  first_open: { stan: "wave", ms: null, where: "ekran powitalny przed rejestracją (pętla do kliknięcia)" },
  first_login: { stan: "wave", then: { stan: "idle", afterMs: 2000 }, ms: 2400, once: true, where: "pierwsze wejście po rejestracji (ok. 2 s, potem idle)" },
  login: { stan: "walk", ms: 1500, where: "sekwencja logowania (ok. 1,5 s, raz dziennie, pomijalna)" },
  home_idle: { stan: "idle", ms: null, where: "„Dziś” bez treningu, profil" },
  empty_state: { stan: "idle", ms: null, where: "puste listy i ekrany (brak planu, podopiecznych, osiągnięć)" },
  loading_long: { stan: "loading", ms: null, where: "dłuższe ładowanie danych (po 0,6 s), do końca ładowania" },
  workout_start: { stan: "lift", ms: 1500, once: true, where: "„Zaczynamy” po kliknięciu Start (ok. 1,5 s, raz dziennie)" },
  warmup_screen: { stan: "warmup", ms: null, where: "ekran rozgrzewki (pajacyki), do pominięcia" },
  rest_timer: { stan: "rest", ms: null, where: "przerwa między seriami, obok stopera, do końca przerwy" },
  set_pr: { stan: "flex", ms: 1500, where: "zapisana seria z NOWYM rekordem ciężaru (ok. 1,5 s, w przerwie)" },
  pain_report: { stan: "care", ms: null, text: "Przerwij to ćwiczenie, jeśli boli", where: "po zgłoszeniu „Coś boli?” (pętla, bez żartów)" },
  cooldown_screen: { stan: "stretch", ms: null, where: "ekran schłodzenia, do pominięcia" },
  workout_done: { stan: "success", ms: 2000, where: "koniec całego treningu (ok. 2 s)" },
  achievement_unlocked: { stan: "levelup", ms: 2000, where: "karta odblokowanego osiągnięcia (ok. 2 s)" },
  gold_bull: { stan: "levelup", ms: 2000, where: "przyznanie „Złotego Byczka” (ok. 2 s, + złota odznaka)" },
  streak_started: { stan: "streakstart", ms: 5000, once: true, where: "pierwszy tydzień nowej serii (raz na serię)" },
  streak_view: { stan: "streak", ms: null, where: "widok serii w „Postępach” i karta serii na „Dziś” (spokojnie, bez skakania)" },
  streak_ended: { stan: "streakout", ms: 5000, once: true, text: "Seria się skończyła. Zapal ją od nowa w tym tygodniu.", where: "seria naprawdę się skończyła (po ochronie serii), RAZ, bez zawstydzania" },
  plan_generating: { stan: "thinking", ms: null, where: "generator planu (trener i Solo), do końca; potem plan_ready" },
  plan_ready: { stan: "success", ms: 2000, text: "Plan gotowy", where: "plan ułożony (po plan_generating)" },
  inactive_client: { stan: "sleep", ms: null, where: "u trenera w „Wymaga uwagi”: 7+ dni bez treningu" },
  no_checkin: { stan: "sleep", ms: null, where: "u trenera w „Wymaga uwagi”: brak odpowiedzi na check-in" },
  long_break_return: { stan: "sleep", then: { stan: "wave", afterMs: 2000 }, ms: 4200, text: "Wróć, kiedy zechcesz — plan na Ciebie czeka", where: "klient po długiej przerwie (sleep → wave, ok. 2 s)" },
  offline: { stan: "offline", ms: null, text: "Brak internetu. Trening zapisze się, gdy wróci zasięg.", where: "brak internetu (osobno od błędu), do powrotu sieci" },
  app_error: { stan: "error", ms: null, where: "błąd aplikacji (nie brak sieci), do zamknięcia" },
} as const satisfies Record<string, MascotEventDef>;
export type MascotEventId = keyof typeof MASCOT_EVENTS;
export const mascotFor = (id: MascotEventId): MascotEventDef => MASCOT_EVENTS[id];

// ─── „raz” (pamięć pokazanych zdarzeń) ────────────────────────────────────────
const ONCE_KEY = "optimatren-mascot-once:v1";
const readOnce = (): Record<string, string> => { try { return JSON.parse(window.localStorage.getItem(ONCE_KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };
/** true = to zdarzenie (z kluczem, np. dniem) już było pokazane. */
export const wasShown = (id: MascotEventId, key = ""): boolean => readOnce()[`${id}:${key}`] === "1";
export function markShown(id: MascotEventId, key = ""): void { try { const o = readOnce(); o[`${id}:${key}`] = "1"; window.localStorage.setItem(ONCE_KEY, JSON.stringify(o)); } catch { /* bez pamięci: pokaże się ponownie */ } }
export function resetShownForTests(): void { try { window.localStorage.removeItem(ONCE_KEY); } catch { /* ignore */ } }

// ─── jedna animacja naraz, nigdy w trakcie serii ──────────────────────────────
interface Active { id: MascotEventId; seq: number }
let active: Active | null = null;
let suppressed = 0;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
/** Ekran serii wywołuje to z `true`, dopóki trwa wykonywanie serii: zdarzenia nie są wtedy pokazywane (nie są też kolejkowane). */
export function useMascotSuppressed(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    suppressed++; active = null; emit();
    return () => { suppressed = Math.max(0, suppressed - 1); emit(); };
  }, [on]);
}
/** Pokazuje zdarzenie nad ekranem (jedno naraz). `key` tylko dla zdarzeń „raz”. Zwraca, czy zostało pokazane. */
export function showMascot(id: MascotEventId, key = ""): boolean {
  const def = MASCOT_EVENTS[id] as MascotEventDef;
  if (suppressed > 0) return false;
  if (def.once && wasShown(id, key)) return false;
  if (def.once) markShown(id, key);
  active = { id, seq: ++seq }; emit();
  return true;
}
export function hideMascot(): void { active = null; emit(); }
export const currentMascot = (): MascotEventId | null => active?.id ?? null;
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export function resetMascotForTests(): void { active = null; suppressed = 0; seq = 0; subs.clear(); resetShownForTests(); }

/** Wspólne odtwarzanie definicji: stan, ewentualne przejście (wave → idle), koniec po `ms`. */
function usePlayback(def: MascotEventDef, onEnd?: () => void, settleToIdle = false): MaskotkaStan {
  const [stan, setStan] = useState<MaskotkaStan>(def.stan);
  useEffect(() => {
    setStan(def.stan);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (def.then) timers.push(setTimeout(() => setStan(def.then!.stan), def.then.afterMs));
    if (def.ms != null && onEnd) timers.push(setTimeout(onEnd, def.ms));
    // krótkie zdarzenia przy ekranie (np. koniec treningu, ok. 2 s) po czasie uspokajają się do „idle”, zamiast skakać w nieskończoność
    if (def.ms != null && settleToIdle && !def.then) timers.push(setTimeout(() => setStan("idle"), def.ms));
    return () => timers.forEach(clearTimeout);
  }, [def]); // eslint-disable-line react-hooks/exhaustive-deps
  return stan;
}

/** Byczek przy ekranie (pętla albo sekwencja zdarzenia). Nie sprawdza „raz” ani zawieszenia — to robi `showMascot`. */
export function MascotEvent({ event, rozmiar = "m", decorative = true, className, children }: { event: MascotEventId; rozmiar?: MaskotkaRozmiar; decorative?: boolean; className?: string; children?: ReactNode }) {
  const def = MASCOT_EVENTS[event] as MascotEventDef;
  const stan = usePlayback(def, undefined, true);
  return (
    <span className={`inline-flex flex-col items-center gap-2 text-center ${className ?? ""}`} data-testid="mascot-event" data-event={event}>
      <Maskotka stan={stan} rozmiar={rozmiar} decorative={decorative} />
      {def.text && <span className="max-w-xs text-sm font-semibold" data-testid="mascot-text">{def.text}</span>}
      {children}
    </span>
  );
}

/** Raz w korzeniu aplikacji: pokazuje zdarzenie wywołane przez `showMascot` (jedno naraz), da się pominąć dotknięciem. Nie blokuje ekranu pod spodem poza dotknięciem. */
export function MascotHost() {
  const cur = useSyncExternalStore(subscribe, () => active, () => null);
  if (!cur) return null;
  return <HostBody key={cur.seq} id={cur.id} />;
}
function HostBody({ id }: { id: MascotEventId }) {
  const def = MASCOT_EVENTS[id] as MascotEventDef;
  const stan = usePlayback(def, hideMascot);
  return (
    <button type="button" onClick={hideMascot} aria-label="Zamknij animację" data-testid="mascot-host" data-event={id}
      className="fixed inset-x-0 top-16 z-[65] mx-auto flex min-h-11 w-fit max-w-[90vw] flex-col items-center gap-2 rounded-2xl border border-border bg-card/95 px-6 py-3 shadow-lg backdrop-blur">
      <Maskotka stan={stan} rozmiar="m" decorative />
      {def.text && <span className="max-w-xs text-sm font-semibold text-foreground">{def.text}</span>}
    </button>
  );
}
