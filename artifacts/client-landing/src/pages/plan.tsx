import { useState, useEffect, useCallback } from "react";
import { useUser, SignIn } from "@clerk/react";
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Dumbbell, Activity, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TodayCard } from "@/components/training/TodayCard";
import { StepsTile } from "@/components/StepsTile";
import { TrainingFlow } from "@/components/training/TrainingFlow";
import { RampFlow } from "@/components/training/RampFlow";
import type { RampKind } from "@/lib/training/ramp";
import type { RampItem, TrainingDay } from "@/lib/training/types";
import { ClientPortalNav, type PortalNavTarget } from "@/components/ClientPortalNav";
import { cn } from "@/lib/utils";
import {
  humanizeError,
  statusMessage,
  NETWORK_ERROR_MESSAGE,
  PLAN_LOAD_ERROR_MESSAGE,
} from "@/lib/userError";
import {
  getMonthGrid,
  todayWarsaw,
  bookingWindow,
  windowMonths,
  monthLabelPl,
  groupSlotsByDay,
  freeCountLabel,
  shiftDay,
} from "@/lib/bookingCalendar";

// ─── API helpers ─────────────────────────────────────────────────────────────

// Absolute /api/... path — no BASE_URL prefix.
// The Replit proxy routes /api/* → API server for all artifacts on the same
// domain.  Using BASE_URL would produce /client-landing/api/..., which the
// proxy routes to the Vite dev server instead.
//
// credentials: "include" is required here: Clerk's __session cookie must be
// sent for the API to authenticate the client-portal caller.
/** Dev-only visual-verification mode: /booking-preview?mockBooking=1. */
const BOOKING_MOCK =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("mockBooking");

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  if (BOOKING_MOCK && path.startsWith("/client-portal/booking")) {
    return mockBookingApi<T>(path, opts);
  }
  // Portal preview (dev): serve one synthetic history entry so the section
  // (and nav scroll target) renders with content.
  if (BOOKING_MOCK && path.startsWith("/client-portal/history")) {
    return {
      items: [
        {
          id: 1,
          planId: 1,
          planDayId: 1,
          sessionDate: "2026-07-28",
          completedAt: "2026-07-28T18:30:00.000Z",
          dayName: "Dzień A",
          daySubtitle: "Góra ciała",
          dayOrder: 1,
          planTitle: "Plan siłowy 3 dni",
          completedExercises: 5,
          completedSets: 15,
        },
      ],
      hasMore: false,
      offset: 0,
      limit: 12,
    } as T;
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch (cause) {
    // Network-level failure — user-safe message; detail stays in console.
    console.error("apiFetch network error:", path, cause);
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { cause });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 4xx bodies from our API carry user-safe Polish text; for 5xx (or a
    // missing body) fall back to a safe status-mapped message.
    const serverMsg = typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;
    const err = new Error(serverMsg && res.status < 500 ? serverMsg : statusMessage(res.status));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: number;
  dayId: number;
  exerciseId: number;
  exerciseName: string;
  mainMuscleGroup: string;
  orderInDay: number;
  workingSets: number;
  warmUpSets: number;
  repType: string | null;
  repsExact: number | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  repTimeSeconds: number | null;
  repOpenInstruction: string | null;
  loadType: string | null;
  loadValue: string | null;
  loadInstruction: string | null;
  rir: number | null;
  rpe: string | null;
  tempo: string | null;
  restSeconds: number | null;
  clientInstructions: string | null;
}

interface PlanDay {
  id: number;
  planId: number;
  dayOrder: number;
  dayName: string | null;
  subtitle: string | null;
  description: string | null;
  estimatedDurationMinutes: number | null;
  exercises: PlanExercise[];
}

interface Plan {
  id: number;
  clientId: number;
  title: string;
  goal: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  updatedAt: string | null;
  /** Trainer-authored cardio prescription — JSON string or null (no cardio saved). */
  cardioRecommendation: string | null;
  days: PlanDay[];
}

/** Shape of the trainer-saved cardio JSON (mirrors trainer-app cardioGenerator). */
interface CardioData {
  activity: string;
  sessionsPerWeek: number;
  sessions: Array<{ durationMinutes: number; metric: string }>;
  progressionText: string;
  executionInstruction: string;
  preSessionNote: string;
  hasHealthLimitation: boolean;
}

function parseCardioData(raw: string | null): CardioData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<CardioData> | null;
    if (
      !data ||
      typeof data !== "object" ||
      typeof data.activity !== "string" ||
      typeof data.sessionsPerWeek !== "number" ||
      !Array.isArray(data.sessions)
    ) {
      return null;
    }
    // Every session must be a well-formed object — malformed persisted data
    // must degrade to the neutral empty state, never crash the plan view.
    const sessions = data.sessions.filter(
      (s): s is CardioData["sessions"][number] =>
        !!s && typeof s === "object" &&
        typeof s.durationMinutes === "number" &&
        typeof s.metric === "string",
    );
    if (sessions.length === 0) return null;
    return {
      activity: data.activity,
      sessionsPerWeek: data.sessionsPerWeek,
      sessions,
      progressionText: typeof data.progressionText === "string" ? data.progressionText : "",
      executionInstruction: typeof data.executionInstruction === "string" ? data.executionInstruction : "",
      preSessionNote: typeof data.preSessionNote === "string" ? data.preSessionNote : "",
      hasHealthLimitation: data.hasHealthLimitation === true,
    };
  } catch {
    return null;
  }
}

interface ClientInfo {
  id: number;
  firstName: string;
  lastName: string;
}

interface Session {
  id: number;
  clientId: number;
  planId: number;
  planDayId: number;
  sessionDate: string;
  isCompleted: boolean;
  notes: string | null;
  completedAt: string | null;
  difficultyRating: number | null;
  hadPain: boolean | null;
  energyLevel: "low" | "medium" | "high" | null;
  /** 'client' | 'trainer' — who recorded the results (trainer-led sessions). */
  performedBy?: "client" | "trainer";
  /** 'self_directed' | 'in_person' */
  sessionMode?: "self_directed" | "in_person";
  logs: ExerciseLog[];
}

interface ExerciseLog {
  id: number;
  sessionId: number;
  planExerciseId: number;
  setsCompleted: number | null;
  repsCompleted: number | null;
  weightKg: string | null;
  rir: number | null;
  note: string | null;
  isCompleted: boolean;
  /** Present on session-detail responses (snapshot or current name). */
  exerciseName?: string | null;
}

type ProgressionSuggestion = "increase" | "maintain" | "repeat_or_reduce";

interface PrevResult {
  weightKg: string | null;
  repsCompleted: number | null;
  setsCompleted: number | null;
  rir: number | null;
  completedAt: string | null;
  suggestion: ProgressionSuggestion | null;
}

interface OpenSessionResponse {
  session: Session;
  previous: Record<number, PrevResult>;
}

interface HistoryItem {
  id: number;
  planId: number;
  planDayId: number;
  sessionDate: string;
  completedAt: string | null;
  dayName: string | null;
  daySubtitle: string | null;
  dayOrder: number | null;
  planTitle: string | null;
  completedExercises: number;
  completedSets: number;
  performedBy?: "client" | "trainer";
  sessionMode?: "self_directed" | "in_person";
}

interface HistoryResponse {
  items: HistoryItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

const SUGGESTION_LABELS: Record<ProgressionSuggestion, string> = {
  increase: "Sugestia: zwiększ ciężar przy kolejnym treningu",
  maintain: "Sugestia: utrzymaj ciężar",
  repeat_or_reduce: "Sugestia: powtórz lub zmniejsz ciężar",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) +
    ", " + d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatPrescription(ex: PlanExercise): string {
  const sets = ex.workingSets;
  let reps = "";
  if (ex.repType === "exact" && ex.repsExact) reps = `${ex.repsExact} pow.`;
  else if (ex.repRangeMin && ex.repRangeMax) reps = `${ex.repRangeMin}–${ex.repRangeMax} pow.`;
  else if (ex.repRangeMin) reps = `${ex.repRangeMin}+ pow.`;
  else if (ex.repType === "time" && ex.repTimeSeconds) reps = `${ex.repTimeSeconds}s`;
  else if (ex.repType === "open") reps = ex.repOpenInstruction ?? "AMRAP";
  const rir = ex.rir != null ? ` · RIR ${ex.rir}` : "";
  const rest = ex.restSeconds ? ` · ${ex.restSeconds < 120 ? `${ex.restSeconds}s` : `${Math.round(ex.restSeconds / 60)} min`} przerwy` : "";
  return `${sets} serie${reps ? ` × ${reps}` : ""}${rir}${rest}`;
}


// ─── SignInGate ────────────────────────────────────────────────────────────────
// Shown when the client is not signed in. Uses Clerk's embedded sign-in
// component so clients authenticate before their plan is fetched.

function SignInGate() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal klienta</h1>
          <p className="text-sm text-muted-foreground">Zaloguj się, aby zobaczyć swój plan treningowy.</p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}

// ─── DayPreview (read-only) ───────────────────────────────────────────────────
// The plan screen only shows the plan. Results are logged in the "Trening" flow
// (components/training), never here.

function DayPreview({ day, onBack }: { day: PlanDay; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background pb-16 text-foreground">
      <div className="mx-auto max-w-2xl space-y-5 px-4 pt-8">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Plan
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{day.dayName ?? `Dzień ${day.dayOrder}`}</h1>
          {day.subtitle && <p className="text-sm text-muted-foreground">{day.subtitle}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Podgląd planu. Trening zaczniesz na ekranie „Dziś”.</p>
        </div>
        <ol className="space-y-2">
          {day.exercises.map((ex, i) => (
            <li key={ex.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="font-semibold">{i + 1}. {ex.exerciseName}</p>
              <p className="text-sm text-muted-foreground">{formatPrescription(ex)}</p>
              {ex.clientInstructions && <p className="mt-1 text-sm text-foreground/90">{ex.clientInstructions}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── SessionDetailReadOnly ────────────────────────────────────────────────────
// Read-only view of a (usually completed) session — used by the post-workout
// summary and by history items. Editing happens only via the existing
// "Cofnij zakończenie treningu" action on the session itself.

function SessionDetailReadOnly({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setDetail(await apiFetch<Session>(`/client-portal/sessions/${sessionId}`));
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">Podsumowanie treningu</p>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Zamknij
        </button>
      </div>
      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !detail ? (
        <p className="text-sm text-muted-foreground px-4 py-6">Nie udało się załadować podsumowania.</p>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {detail.completedAt && (
            <p className="text-xs text-muted-foreground">Ukończono: {formatDateTime(detail.completedAt)}</p>
          )}
          {detail.performedBy === "trainer" && (
            <p className="text-xs text-blue-400">
              Trening stacjonarny z trenerem · Wyniki zapisane przez trenera
            </p>
          )}
          {detail.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanych ćwiczeń w tej sesji.</p>
          ) : (
            <div className="space-y-2">
              {detail.logs.map((log) => (
                <div key={log.id} className="border border-border rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm font-medium", log.isCompleted && "text-foreground")}>
                      {log.exerciseName ?? "Ćwiczenie"}
                    </p>
                    {log.isCompleted && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-primary shrink-0">Wykonane</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {[
                      log.weightKg != null && log.weightKg !== "" ? `${parseFloat(log.weightKg)} kg` : null,
                      log.repsCompleted != null ? `${log.repsCompleted} powt.` : null,
                      log.setsCompleted != null ? `${log.setsCompleted} serii` : null,
                      log.rir != null ? `RIR ${log.rir}` : null,
                    ].filter(Boolean).join(" × ") || "Brak danych"}
                  </p>
                  {log.note && <p className="text-xs text-muted-foreground mt-1 italic">{log.note}</p>}
                </div>
              ))}
            </div>
          )}
          {detail.notes && (
            <p className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-2">Notatka: {detail.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HistorySection ───────────────────────────────────────────────────────────
// "Historia treningów" — completed sessions, newest first, 12 per page.

// ─── Booking (Stage 4 MVP) ────────────────────────────────────────────────────

interface BookingInfo {
  id: number;
  startsAt: string;
  durationMinutes: number;
  status: string;
}

interface BookingSlot {
  startsAt: string;
  durationMinutes: number;
}

// ─── Dev-only mock backend for /booking-preview?mockBooking=1 ────────────────
// Never runs in production (BOOKING_MOCK requires import.meta.env.DEV).
// Synthetic data only. Simulates: free slots for the 30-day window, one
// pre-armed 409 conflict (first slot of the 3rd available day), booking and
// cancellation.

const mockBookingState: {
  slots: BookingSlot[] | null;
  booking: BookingInfo | null;
  conflictSlot: string | null;
  nextId: number;
} = { slots: null, booking: null, conflictSlot: null, nextId: 1 };

function buildMockSlots(): BookingSlot[] {
  const today = todayWarsaw();
  const out: BookingSlot[] = [];
  for (let i = 1; i < 30; i++) {
    const date = shiftDay(today, i);
    const [y, m, d] = date.split("-").map(Number);
    const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    if (weekday > 4) continue; // Mon–Fri only
    if (weekday === 3) continue; // pretend Thursdays are fully blocked
    for (let h = 16; h < 20; h++) {
      if (weekday === 1 && h >= 18) continue; // pretend Tuesday 18–20 blocked_range
      // Fixed CEST offset — dev visual verification only.
      out.push({ startsAt: `${date}T${String(h).padStart(2, "0")}:00:00+02:00`, durationMinutes: 60 });
    }
  }
  return out;
}

async function mockBookingApi<T>(path: string, opts?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 150));
  const method = (opts?.method ?? "GET").toUpperCase();
  if (mockBookingState.slots === null) {
    mockBookingState.slots = buildMockSlots();
    const days = [...groupSlotsByDay(mockBookingState.slots).values()];
    mockBookingState.conflictSlot = days[2]?.[0]?.startsAt ?? null;
  }
  if (method === "GET" && path === "/client-portal/booking") {
    return { bookable: true, booking: mockBookingState.booking } as T;
  }
  if (method === "GET" && path === "/client-portal/booking/slots") {
    return { slots: mockBookingState.slots } as T;
  }
  if (method === "POST" && path === "/client-portal/booking") {
    const { startsAt } = JSON.parse(String(opts?.body ?? "{}"));
    if (startsAt === mockBookingState.conflictSlot) {
      // Simulate another client having just taken this slot.
      mockBookingState.slots = mockBookingState.slots.filter((s) => s.startsAt !== startsAt);
      mockBookingState.conflictSlot = null;
      throw Object.assign(new Error("Ten termin został właśnie zarezerwowany. Wybierz inny."), { status: 409 });
    }
    const slot = mockBookingState.slots.find((s) => s.startsAt === startsAt);
    mockBookingState.slots = mockBookingState.slots.filter((s) => s.startsAt !== startsAt);
    mockBookingState.booking = {
      id: mockBookingState.nextId++,
      startsAt,
      durationMinutes: slot?.durationMinutes ?? 60,
      status: "booked",
    };
    return mockBookingState.booking as T;
  }
  if (method === "PATCH" && /^\/client-portal\/booking\/\d+\/cancel$/.test(path)) {
    if (mockBookingState.booking) {
      // Freed slot becomes available again (still inside the window).
      mockBookingState.slots.push({
        startsAt: mockBookingState.booking.startsAt,
        durationMinutes: mockBookingState.booking.durationMinutes,
      });
      mockBookingState.slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      mockBookingState.booking = null;
    }
    return { ok: true } as T;
  }
  throw Object.assign(new Error("Ta funkcja nie jest dostępna w podglądzie."), { status: 501 });
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  booked: "Zarezerwowany",
  completed: "Zakończony",
  cancelled_by_client: "Anulowany",
  cancelled_by_trainer: "Anulowany przez trenera",
};

// All booking times are the trainer's wall time in Europe/Warsaw — format
// explicitly in that zone so a client abroad sees the same time the trainer
// scheduled, not their device's local shift.
const BOOKING_TIME_ZONE = "Europe/Warsaw";

function formatSlotDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    timeZone: BOOKING_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", {
    timeZone: BOOKING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Warsaw calendar-day key for grouping slots (en-CA gives YYYY-MM-DD). */
function slotDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: BOOKING_TIME_ZONE });
}

/**
 * Mobile-first booking screen: date → time → confirmation → done.
 * Never books on first tap — confirmation step is always shown.
 */
function BookingScreen({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLoadError(null);
    apiFetch<{ slots: BookingSlot[] }>("/client-portal/booking/slots")
      .then((r) => setSlots(r.slots))
      .catch((err: unknown) => {
        console.error("Slot load failed:", err);
        setLoadError(humanizeError(err));
      });
  }, [retry]);

  // Pure regrouping of the backend free-slot list — availability itself is
  // decided exclusively by the backend (shared generator).
  const byDay = groupSlotsByDay(slots ?? []);
  const today = todayWarsaw();
  const { first: windowFirst, last: windowLast } = bookingWindow(today);
  const months = windowMonths(today);
  const [monthIdx, setMonthIdx] = useState(0);
  const view = months[Math.min(monthIdx, months.length - 1)];
  const activeDay =
    selectedDay && byDay.has(selectedDay)
      ? { key: selectedDay, label: formatSlotDate(byDay.get(selectedDay)![0].startsAt), slots: byDay.get(selectedDay)! }
      : null;

  // After a conflict-triggered refetch, the chosen day may have lost its last
  // free hour — clear the selection so the day shows as unavailable.
  useEffect(() => {
    if (slots !== null && selectedDay && !byDay.has(selectedDay)) {
      setSelectedDay(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, selectedDay]);

  const confirmBooking = async () => {
    if (!selectedSlot) return;
    setConfirming(true);
    setBookError(null);
    try {
      await apiFetch("/client-portal/booking", {
        method: "POST",
        body: JSON.stringify({ startsAt: selectedSlot.startsAt }),
      });
      setDone(true);
      onBooked();
    } catch (err) {
      console.error("Booking failed:", err);
      setBookError(humanizeError(err));
      // Conflict → slot list is stale; refresh it and go back to time choice.
      if ((err as { status?: number }).status === 409) {
        setSelectedSlot(null);
        setRetry((c) => c + 1);
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (selectedSlot) setSelectedSlot(null);
              else if (selectedDay) setSelectedDay(null);
              else onClose();
            }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Wróć"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight">Umów trening</h1>
        </div>

        {done ? (
          <div className="text-center space-y-4 pt-10" role="status">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <p className="text-lg font-semibold">Trening został zarezerwowany.</p>
            <Button className="rounded-lg w-full h-12" onClick={onClose}>
              Wróć do planu
            </Button>
          </div>
        ) : loadError ? (
          <div role="alert" className="space-y-3 pt-6 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" className="rounded-lg" onClick={() => setRetry((c) => c + 1)}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : slots === null ? (
          <div className="flex justify-center pt-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : byDay.size === 0 ? (
          <p className="text-sm text-muted-foreground pt-6 text-center">
            Brak dostępnych terminów w najbliższych 30 dniach. Skontaktuj się ze swoim trenerem.
          </p>
        ) : selectedSlot ? (
          /* Step 3: confirmation summary */
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">Podsumowanie</p>
            <div className="border border-border rounded-lg bg-card px-5 py-4 space-y-1">
              <p className="font-semibold capitalize">{formatSlotDate(selectedSlot.startsAt)}</p>
              <p className="text-2xl font-bold">
                {formatSlotTime(selectedSlot.startsAt)}
                <span className="text-base font-semibold text-muted-foreground">
                  {" "}–{" "}
                  {formatSlotTime(new Date(new Date(selectedSlot.startsAt).getTime() + selectedSlot.durationMinutes * 60_000).toISOString())}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">Czas trwania: {selectedSlot.durationMinutes} min</p>
              <p className="text-sm text-muted-foreground">Trening stacjonarny z trenerem.</p>
            </div>
            {bookError && (
              <p role="alert" className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2">
                {bookError}
              </p>
            )}
            <Button className="rounded-lg w-full h-12 text-base" onClick={() => void confirmBooking()} disabled={confirming}>
              {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : "Potwierdź rezerwację"}
            </Button>
          </div>
        ) : activeDay ? (
          /* Step 2: choose one available time */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground capitalize">{activeDay.label}</p>
            {bookError && (
              <p role="alert" className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2">
                {bookError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {activeDay.slots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => setSelectedSlot(s)}
                  aria-selected={selectedSlot != null && (selectedSlot as BookingSlot).startsAt === s.startsAt}
                  className="border border-border rounded-lg bg-card hover:border-primary/50 hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary py-3.5 px-2 transition-colors"
                >
                  <span className="block text-base font-semibold">
                    {formatSlotTime(s.startsAt)}–{formatSlotTime(new Date(new Date(s.startsAt).getTime() + s.durationMinutes * 60_000).toISOString())}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{s.durationMinutes} min</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Step 1: choose date — monthly grid over the backend's free slots */
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">Wybierz datę</p>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Poprzedni miesiąc"
                onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
                disabled={monthIdx === 0}
                className="p-2.5 border border-border rounded-lg disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{monthLabelPl(view.year, view.month)}</p>
                <button
                  type="button"
                  onClick={() => setMonthIdx(0)}
                  className="text-xs underline text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1 py-0.5"
                >
                  Dzisiaj
                </button>
              </div>
              <button
                type="button"
                aria-label="Następny miesiąc"
                onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
                disabled={monthIdx >= months.length - 1}
                className="p-2.5 border border-border rounded-lg disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1" role="row">
              {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((d) => (
                <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {getMonthGrid(view.year, view.month).flat().map((cell, i) => {
                if (cell.date === null) return <div key={`b-${i}`} aria-hidden="true" />;
                const date = cell.date;
                const inWindow = date >= windowFirst && date <= windowLast;
                const daySlots = inWindow ? byDay.get(date) : undefined;
                const enabled = !!daySlots && daySlots.length > 0;
                const isToday = date === today;
                const label = formatSlotDate(daySlots?.[0]?.startsAt ?? `${date}T12:00:00+02:00`);
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!enabled}
                    onClick={() => { setSelectedDay(date); setBookError(null); }}
                    aria-label={enabled ? `${label}: ${freeCountLabel(daySlots!.length)}` : `${label}: niedostępny`}
                    aria-current={isToday ? "date" : undefined}
                    aria-selected={selectedDay === date}
                    className={cn(
                      "min-h-14 border p-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      enabled
                        ? "border-border bg-card hover:border-primary/50 hover:bg-card"
                        : "border-border text-muted-foreground",
                      !inWindow && "opacity-35",
                      isToday && "border-primary/60",
                    )}
                  >
                    <span className={cn("text-sm font-semibold", isToday && "text-primary")}>
                      {Number(date.slice(8))}
                    </span>
                    {enabled && (
                      <span className="text-[10px] leading-none text-muted-foreground">
                        {daySlots!.length} wol.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Aktywne są tylko dni z wolnymi terminami w najbliższych 30 dniach.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Nadchodzący trening" card on the plan page.
 * Rendered only for in_person / hybrid clients (backend decides via `bookable`).
 */
export function BookingSection() {
  const [bookable, setBookable] = useState(false);
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    apiFetch<{ bookable: boolean; booking: BookingInfo | null }>("/client-portal/booking")
      .then((r) => {
        setBookable(r.bookable);
        setBooking(r.booking);
      })
      .catch((err: unknown) => {
        // Card is auxiliary — on failure keep the plan usable, log detail.
        console.error("Booking info load failed:", err);
      })
      .finally(() => setLoaded(true));
  }, [refresh]);

  if (!loaded || !bookable) return null;

  const cancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await apiFetch(`/client-portal/booking/${booking.id}/cancel`, { method: "PATCH" });
      setBooking(null);
    } catch (err) {
      console.error("Booking cancel failed:", err);
      setCancelError(humanizeError(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <div className="border border-border rounded-lg bg-card px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">
            Nadchodzący trening
          </h2>
        </div>
        {booking ? (
          <div className="space-y-3">
            <div>
              <p className="font-semibold capitalize">{formatSlotDate(booking.startsAt)}</p>
              <p className="text-sm text-muted-foreground">
                {formatSlotTime(booking.startsAt)} · {booking.durationMinutes} min ·{" "}
                {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
              </p>
            </div>
            {cancelError && (
              <p role="alert" className="text-sm text-destructive">{cancelError}</p>
            )}
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => void cancelBooking()}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anuluj"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Nie masz zaplanowanego treningu.</p>
            <Button className="rounded-lg w-full sm:w-auto h-11" onClick={() => setShowBooking(true)}>
              Umów trening
            </Button>
          </div>
        )}
      </div>
      {showBooking && (
        <BookingScreen
          onClose={() => setShowBooking(false)}
          onBooked={() => setRefresh((c) => c + 1)}
        />
      )}
    </>
  );
}

function HistorySection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async (offset: number) => {
    const res = await apiFetch<HistoryResponse>(`/client-portal/history?limit=12&offset=${offset}`);
    setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
    setHasMore(res.hasMore);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load(0); } catch { /* empty */ } finally { setLoading(false); }
    })();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">Historia treningów</h2>
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  // Empty state (instead of hiding the section): the nav's "Historia
  // treningów" link needs a visible target even before the first workout.
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">Historia treningów</h2>
        <div className="border border-border rounded-lg px-5 py-6 text-center text-sm text-muted-foreground">
          Brak zapisanych treningów — historia pojawi się po ukończeniu pierwszej sesji.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">Historia treningów</h2>
      {selectedId != null && (
        <SessionDetailReadOnly sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
            className={cn(
              "w-full text-left border bg-card hover:bg-card transition-all px-4 py-3",
              item.id === selectedId ? "border-primary/40" : "border-border hover:border-primary/30",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {item.dayName ?? (item.dayOrder != null ? `Dzień ${item.dayOrder}` : item.planTitle ?? "Trening")}
                  </span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-primary">Ukończony</Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-1.5 py-0",
                      item.performedBy === "trainer"
                        ? "border-blue-400/40 text-blue-400"
                        : "border-input text-muted-foreground",
                    )}
                  >
                    {item.performedBy === "trainer" ? "Trening stacjonarny z trenerem" : "Trening samodzielny"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(item.completedAt)}
                  {` · ${item.completedExercises} ćwiczeń`}
                  {item.completedSets > 0 ? ` · ${item.completedSets} serii` : ""}
                </p>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", item.id === selectedId && "rotate-90")} />
            </div>
          </button>
        ))}
      </div>
      {hasMore && (
        <Button
          variant="outline"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            try { await load(items.length); } catch { /* empty */ } finally { setLoadingMore(false); }
          }}
          className="w-full h-9 rounded-lg text-sm"
        >
          {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pokaż starsze"}
        </Button>
      )}
    </div>
  );
}

// ─── CardioSection (display-only) ────────────────────────────────────────────
// Renders the trainer-saved cardio prescription. Never generated client-side:
// null/invalid JSON → compact neutral state.

function CardioCard({ cardio }: { cardio: CardioData | null }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">
        Cardio / aktywność dodatkowa
      </h2>
      {!cardio ? (
        <div className="border border-border rounded-lg bg-card px-5 py-4 text-sm text-muted-foreground">
          Brak dodatkowego cardio w planie.
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card px-5 py-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm">{cardio.activity}</span>
            <span className="text-sm text-muted-foreground">
              · {cardio.sessionsPerWeek} {cardio.sessionsPerWeek === 1 ? "sesja" : cardio.sessionsPerWeek <= 4 ? "sesje" : "sesji"} / tydzień
              {cardio.sessions[0] ? ` · ${cardio.sessions[0].durationMinutes} min` : ""}
            </span>
          </div>

          {cardio.preSessionNote && (
            <p className="text-xs text-muted-foreground">{cardio.preSessionNote}</p>
          )}

          <div className="space-y-2">
            {cardio.sessions.map((s, i) => (
              <div key={i} className="border border-border rounded-lg bg-white/[0.02] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Sesja {i + 1}
                </p>
                <p className="text-sm">
                  {s.durationMinutes} minut{s.metric ? `. ${s.metric}` : "."}
                </p>
              </div>
            ))}
          </div>

          {cardio.executionInstruction && (
            <p className="text-sm text-muted-foreground">{cardio.executionInstruction}</p>
          )}

          {cardio.progressionText && (
            <div className="border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">
                Progresja cardio
              </p>
              <p className="text-sm text-foreground/90">{cardio.progressionText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Strength progression guidance ───────────────────────────────────────────
// Generic, plan-agnostic guidance — the frontend never invents exercise-specific
// load increases; the trainer's plan remains authoritative.

function StrengthProgressionCard() {
  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">
        Jak progresować w treningu siłowym
      </h2>
      <div className="border border-border rounded-lg bg-card px-5 py-4 space-y-3">
        <ul className="space-y-2 text-sm text-foreground/90 list-disc pl-4">
          <li>Gdy wykonasz wszystkie zaplanowane serie w górnym zakresie powtórzeń, zachowując założony zapas (RIR), zwiększ lekko ciężar na kolejnym treningu.</li>
          <li>Jeśli nie osiągasz dolnego zakresu powtórzeń, zostań przy obecnym ciężarze lub delikatnie go zmniejsz.</li>
          <li>Nie zwiększaj ciężaru kosztem techniki.</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Obowiązuje zawsze aktualny plan od trenera — te wskazówki go nie zastępują.
        </p>
      </div>
    </div>
  );
}

// ─── PlanView ─────────────────────────────────────────────────────────────────

export function PlanView({
  client,
  plan,
  onSelectDay,
  today,
}: {
  client: ClientInfo;
  plan: Plan;
  onSelectDay: (day: PlanDay) => void;
  /** "Dziś" card — the start of the portal. */
  today?: React.ReactNode;
}) {
  const cardio = parseCardioData(plan.cardioRecommendation);
  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <div className="max-w-2xl mx-auto px-4 pt-10 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground mb-2">Plan treningowy</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{plan.title}</h1>
            {/* Informational only — never touches session state. */}
            <Badge variant="outline" className="border-input text-muted-foreground shrink-0">
              Plan w trakcie
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Cześć, {client.firstName}!</p>
          {plan.goal && (
            <p className="text-sm text-primary bg-primary/5 border border-primary/10 px-3 py-2 mt-3">
              Cel: {plan.goal}
            </p>
          )}
          {plan.updatedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Plan zaktualizowany: {formatDate(plan.updatedAt)}
            </p>
          )}
        </div>

        {today}

        <div id="rezerwacje" className="scroll-mt-20">
          <BookingSection />
        </div>

        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground font-semibold">Plan — podgląd dni</h2>
          {plan.days.length === 0 ? (
            <div className="border border-border rounded-lg px-5 py-10 text-center text-sm text-muted-foreground">
              <Dumbbell className="w-8 h-8 mx-auto mb-3 opacity-30" />
              Trener jeszcze nie dodał ćwiczeń do planu.
            </div>
          ) : (
            plan.days.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => onSelectDay(day)}
                className="w-full text-left border border-border rounded-lg bg-card hover:bg-card hover:border-primary/30 transition-all px-5 py-4 group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{day.dayName ?? `Dzień ${day.dayOrder}`}</span>
                      {day.subtitle && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-input text-muted-foreground">
                          {day.subtitle}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {day.exercises.length} ćwiczeń
                      {day.estimatedDurationMinutes ? ` · ok. ${day.estimatedDurationMinutes} min` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </button>
            ))
          )}
        </div>

        <CardioCard cardio={cardio} />

        <StrengthProgressionCard />

        <div id="historia" className="scroll-mt-20">
          <HistorySection />
        </div>
      </div>
    </div>
  );
}

// ─── Main Portal page ─────────────────────────────────────────────────────────

export default function PlanPortal() {
  const { isSignedIn, isLoaded } = useUser();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRetry, setPlanRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);
  const [training, setTraining] = useState<{ day: TrainingDay; firstName: string; week: { done: number; target: number } } | null>(null);
  const [ramp, setRamp] = useState<{ kind: RampKind; planDayId: number; items: RampItem[] } | null>(null);
  const [todayReload, setTodayReload] = useState(0);
  // Backend-decided calendar eligibility for the nav (in_person/hybrid only).
  const [navBookable, setNavBookable] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiFetch<{ bookable: boolean }>("/client-portal/booking")
      .then((r) => setNavBookable(r.bookable))
      .catch(() => setNavBookable(false)); // nav item simply stays hidden
  }, [isLoaded, isSignedIn]);

  // Nav navigation: always exits an open session view, then scrolls to the
  // requested plan-page section once it is rendered.
  const handleNavigate = useCallback((target: PortalNavTarget) => {
    setSelectedDay(null);
    requestAnimationFrame(() => {
      if (target === "plan") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const id = target === "history" ? "historia" : "rezerwacje";
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Once Clerk confirms the session, fetch the plan from the authenticated endpoint.
  // The route uses req.client.id — no email or clientId query param is needed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setPlanLoading(true);
    setPlanError(null);
    apiFetch<{ client: ClientInfo; plan: Plan }>("/client-portal/plan")
      .then(({ client: c, plan: p }) => {
        setClient(c);
        setPlan(p);
      })
      .catch((err: unknown) => {
        console.error("Plan load failed:", err);
        setPlanError(humanizeError(err, PLAN_LOAD_ERROR_MESSAGE));
      })
      .finally(() => setPlanLoading(false));
  }, [isLoaded, isSignedIn, planRetry]);

  // Clerk is still initializing.
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in — show Clerk sign-in form.
  if (!isSignedIn) {
    return <SignInGate />;
  }

  // Signed in but plan is still loading.
  if (planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Signed in but no active plan linked to this Clerk account.
  if (planError || !client || !plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-sm" role="alert">
          <Dumbbell className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <p className="font-semibold">{planError ?? "Brak aktywnego planu"}</p>
          <p className="text-sm text-muted-foreground">
            Skontaktuj się ze swoim trenerem — musi aktywować Twój plan i powiązać konto z Twoim profilem.
          </p>
          {planError && (
            <Button onClick={() => setPlanRetry((c) => c + 1)} className="rounded-lg mt-2">
              Spróbuj ponownie
            </Button>
          )}
          {/* Wrong-login-page recovery: a trainer who signed in through the
              client entry has no linked client account — offer the way back.
              Full page load (separate artifact), deliberately not auto-redirect
              so an unlinked client is never silently sent into the trainer app. */}
          <p className="text-sm text-muted-foreground pt-2">
            Jesteś trenerem?{" "}
            <a
              href="/"
              className="inline-block py-2 font-medium text-primary underline underline-offset-2"
            >
              Przejdź do Panelu Trenera
            </a>
          </p>
        </div>
      </div>
    );
  }

  const nav = (
    <ClientPortalNav
      firstName={client.firstName}
      lastName={client.lastName}
      showCalendar={navBookable}
      onNavigate={handleNavigate}
    />
  );

  if (ramp) {
    return (
      <RampFlow
        kind={ramp.kind}
        planDayId={ramp.planDayId}
        items={ramp.items}
        onExit={() => { setRamp(null); setTodayReload((n) => n + 1); window.scrollTo({ top: 0 }); }}
      />
    );
  }

  if (training) {
    return (
      <TrainingFlow
        day={training.day}
        firstName={training.firstName}
        week={training.week}
        onExit={() => { setTraining(null); setTodayReload((n) => n + 1); window.scrollTo({ top: 0 }); }}
      />
    );
  }

  if (selectedDay) {
    return (
      <>
        {nav}
        <DayPreview day={selectedDay} onBack={() => setSelectedDay(null)} />
      </>
    );
  }

  return (
    <>
      {nav}
      <PlanView
        client={client}
        plan={plan}
        onSelectDay={setSelectedDay}
        today={
          <>
            <TodayCard
              reloadKey={todayReload}
              onStart={(day, ctx) => setTraining({ day, firstName: ctx.client.firstName, week: ctx.week })}
              onRamp={(kind, planDayId, items) => setRamp({ kind, planDayId, items })}
            />
            <StepsTile />
          </>
        }
      />
    </>
  );
}
