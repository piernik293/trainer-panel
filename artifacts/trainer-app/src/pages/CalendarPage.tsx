/**
 * Kalendarz (Stage 4 MVP) — trainer booking calendar.
 *
 * Two simple sections (no complex visual calendar):
 *  - Dostępność: weekly availability rows with a compact editor.
 *  - Nadchodzące rezerwacje: upcoming active bookings with actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2, Plus, Trash2, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getMonthGrid,
  addMonths,
  monthLabelPl,
  monthRange,
  todayWarsaw,
  WARSAW_TZ,
} from "@/lib/monthGrid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { humanizeError, NETWORK_ERROR_MESSAGE, statusMessage } from "@/lib/userError";
import {
  getDayStatus,
  dayStatusText,
  DAY_STATUS_META,
  isSelectable,
  toggleDay,
  selectRange,
  summarizeDates,
  pluralPl,
  type DayStatus,
} from "@/lib/calendarDayStatus";

// ─── API helpers (same pattern as other pages) ───────────────────────────────

/** Dev-only visual-verification mode: /calendar-preview?mockCalendar=1. */
const CALENDAR_MOCK =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("mockCalendar");

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  if (CALENDAR_MOCK) return mockApi<T>(url, options);
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
  } catch (cause) {
    console.error("apiFetch network error:", url, cause);
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { cause });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const serverMsg = typeof (data as { error?: unknown })?.error === "string"
      ? (data as { error: string }).error
      : null;
    throw Object.assign(new Error(serverMsg && res.status < 500 ? serverMsg : statusMessage(res.status)), {
      status: res.status,
    });
  }
  return data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvailabilityRow {
  id: number;
  weekday: number;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  sessionMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

interface UpcomingBooking {
  id: number;
  clientId: number;
  startsAt: string;
  durationMinutes: number;
  status: string;
  clientFirstName: string;
  clientLastName: string;
}

const WEEKDAYS = [
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
  "Niedziela",
];

const hhmm = (t: string) => t.slice(0, 5);

// Booking times are Warsaw wall times — format explicitly in that zone so the
// list is correct even when the trainer's device is set to another timezone.
const BOOKING_TIME_ZONE = "Europe/Warsaw";

function formatBookingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    timeZone: BOOKING_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatBookingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", {
    timeZone: BOOKING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Availability section ─────────────────────────────────────────────────────

function AvailabilitySection() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AvailabilityRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    weekday: "0",
    startTime: "16:00",
    endTime: "20:00",
    sessionMinutes: "60",
    bufferMinutes: "0",
  });

  useEffect(() => {
    setLoadError(null);
    apiFetch<AvailabilityRow[]>("/availability")
      .then(setRows)
      .catch((err: unknown) => setLoadError(humanizeError(err)));
  }, [retry]);

  const addRange = useCallback(async () => {
    setSaving(true);
    try {
      const row = await apiFetch<AvailabilityRow>("/availability", {
        method: "POST",
        body: JSON.stringify({
          weekday: Number(form.weekday),
          startTime: form.startTime,
          endTime: form.endTime,
          sessionMinutes: Number(form.sessionMinutes),
          bufferMinutes: Number(form.bufferMinutes) || 0,
        }),
      });
      setRows((prev) => [...(prev ?? []), row].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)));
      setShowForm(false);
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  const removeRange = useCallback(async (id: number) => {
    try {
      await apiFetch<{ ok: boolean }>(`/availability/${id}`, { method: "DELETE" });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    }
  }, [toast]);

  const toggleActive = useCallback(async (id: number, isActive: boolean) => {
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, isActive } : r)));
    try {
      await apiFetch<AvailabilityRow>(`/availability/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
    } catch (err) {
      setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, isActive: !isActive } : r)));
      toast({ variant: "destructive", description: humanizeError(err) });
    }
  }, [toast]);

  return (
    <section className="border rounded-lg">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="font-semibold">Dostępność</h2>
          <p className="text-sm text-muted-foreground">
            Tygodniowe zakresy godzin, w których klienci mogą rezerwować treningi.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" />
          Dodaj zakres
        </Button>
      </div>

      {showForm && (
        <div className="px-5 py-4 border-b bg-muted/30 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dzień tygodnia</label>
            <Select value={form.weekday} onValueChange={(v) => setForm((f) => ({ ...f, weekday: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Od</label>
            <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Do</label>
            <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sesja (min)</label>
            <Input type="number" min={15} max={240} step={5} value={form.sessionMinutes} onChange={(e) => setForm((f) => ({ ...f, sessionMinutes: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Przerwa (min)</label>
            <div className="flex gap-2">
              <Input type="number" min={0} max={120} step={5} value={form.bufferMinutes} onChange={(e) => setForm((f) => ({ ...f, bufferMinutes: e.target.value }))} />
              <Button onClick={() => void addRange()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Zapisz"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loadError ? (
        <div role="alert" className="px-5 py-6 text-sm text-muted-foreground">
          {loadError}{" "}
          <button className="underline font-medium" onClick={() => setRetry((c) => c + 1)}>
            Spróbuj ponownie
          </button>
        </div>
      ) : rows === null ? (
        <div className="px-5 py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Brak zakresów dostępności. Dodaj pierwszy zakres, aby klienci mogli rezerwować treningi.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className={r.isActive ? "" : "opacity-50"}>
                <p className="font-medium text-sm">{WEEKDAYS[r.weekday]}</p>
                <p className="text-sm text-muted-foreground">
                  {hhmm(r.startTime)}–{hhmm(r.endTime)} · Sesja: {r.sessionMinutes} min
                  {r.bufferMinutes > 0 ? ` · Przerwa: ${r.bufferMinutes} min` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={r.isActive}
                  onCheckedChange={(v) => void toggleActive(r.id, v)}
                  aria-label={r.isActive ? "Dezaktywuj zakres" : "Aktywuj zakres"}
                />
                <Button variant="ghost" size="icon" aria-label="Usuń" onClick={() => void removeRange(r.id)}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Upcoming bookings section ────────────────────────────────────────────────

function UpcomingBookingsSection() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<UpcomingBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    setLoadError(null);
    apiFetch<UpcomingBooking[]>("/bookings/upcoming")
      .then(setBookings)
      .catch((err: unknown) => setLoadError(humanizeError(err)));
  }, [retry]);

  const cancelBooking = useCallback(async (id: number) => {
    setCancellingId(id);
    try {
      await apiFetch(`/bookings/${id}/cancel`, { method: "PATCH" });
      setBookings((prev) => (prev ?? []).filter((b) => b.id !== id));
      toast({ description: "Rezerwacja została anulowana." });
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    } finally {
      setCancellingId(null);
    }
  }, [toast]);

  return (
    <section className="border rounded-lg">
      <div className="px-5 py-4 border-b">
        <h2 className="font-semibold">Nadchodzące rezerwacje</h2>
        <p className="text-sm text-muted-foreground">Zarezerwowane treningi Twoich klientów.</p>
      </div>
      {loadError ? (
        <div role="alert" className="px-5 py-6 text-sm text-muted-foreground">
          {loadError}{" "}
          <button className="underline font-medium" onClick={() => setRetry((c) => c + 1)}>
            Spróbuj ponownie
          </button>
        </div>
      ) : bookings === null ? (
        <div className="px-5 py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : bookings.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Brak nadchodzących rezerwacji.</p>
      ) : (
        <ul className="divide-y">
          {bookings.map((b) => (
            <li key={b.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">
                  {b.clientFirstName} {b.clientLastName}
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  {formatBookingDate(b.startsAt)}, {formatBookingTime(b.startsAt)} · {b.durationMinutes} min
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/clients/${b.clientId}`}>Otwórz profil klienta</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/clients/${b.clientId}/trainer-session`}>Rozpocznij trening</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancellingId === b.id}
                  onClick={() => void cancelBooking(b.id)}
                >
                  {cancellingId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anuluj"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Month calendar (Stage 4.1B) ─────────────────────────────────────────────

interface CalendarSlot {
  start: string;
  end: string;
  status: "free" | "booked";
  bookingId?: number;
  clientId?: number;
  clientName?: string;
}
interface CalendarException {
  id: number;
  type: "blocked_day" | "blocked_range" | "extra_range";
  startTime: string | null;
  endTime: string | null;
}
interface CalendarDay {
  date: string;
  totalSlots: number;
  freeSlots: number;
  bookedSlots: number;
  isBlockedDay: boolean;
  hasAvailability: boolean;
  slots: CalendarSlot[];
  exceptions: CalendarException[];
}

const WEEKDAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];

// ─── Dev-only mock backend for /calendar-preview?mockCalendar=1 ──────────────
// Never runs in production (CALENDAR_MOCK requires import.meta.env.DEV).

interface MockBooking {
  id: number;
  clientId: number;
  clientName: string;
  date: string;
  startMin: number;
  cancelled: boolean;
}
interface MockException extends CalendarException {
  date: string;
  sessionDurationMinutes?: number;
  breakMinutes?: number;
}

const mockState = (() => {
  const today = todayWarsaw();
  const shift = (days: number) => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
  };
  return {
    nextId: 1000,
    bookings: [
      { id: 1, clientId: 1, clientName: "Anna Kowalska", date: shift(2), startMin: 17 * 60, cancelled: false },
      { id: 2, clientId: 2, clientName: "Piotr Nowak", date: shift(5), startMin: 18 * 60, cancelled: false },
      { id: 3, clientId: 3, clientName: "Ewa Wiśniewska", date: shift(-3), startMin: 16 * 60, cancelled: false },
    ] as MockBooking[],
    exceptions: [
      { id: 101, type: "blocked_day", startTime: null, endTime: null, date: shift(7) },
      { id: 102, type: "blocked_range", startTime: "18:00", endTime: "20:00", date: shift(3) },
    ] as MockException[],
  };
})();

const minToHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const hhmmToMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
// August/dev mock only — fixed CEST offset is fine for visual verification.
const mockIso = (date: string, min: number) => `${date}T${minToHHMM(min)}:00+02:00`;

function buildMockDay(date: string): CalendarDay {
  const today = todayWarsaw();
  const [y, m, d] = date.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const exceptions = mockState.exceptions.filter((e) => e.date === date);
  const isBlockedDay = exceptions.some((e) => e.type === "blocked_day");
  const isPast = date < today;
  const weeklyDay = weekday <= 4; // Mon–Fri 16:00–20:00, 60-min sessions
  const bookings = mockState.bookings.filter((b) => b.date === date && !b.cancelled);

  let freeStarts: number[] = [];
  if (weeklyDay && !isPast) {
    for (let t = 16 * 60; t < 20 * 60; t += 60) freeStarts.push(t);
  }
  for (const ex of exceptions) {
    if (ex.type === "extra_range" && !isPast) {
      const step = (ex.sessionDurationMinutes ?? 60) + (ex.breakMinutes ?? 0);
      for (let t = hhmmToMin(ex.startTime!); t + (ex.sessionDurationMinutes ?? 60) <= hhmmToMin(ex.endTime!); t += step) {
        freeStarts.push(t);
      }
    }
  }
  for (const ex of exceptions) {
    if (ex.type === "blocked_range") {
      const s = hhmmToMin(ex.startTime!);
      const e = hhmmToMin(ex.endTime!);
      freeStarts = freeStarts.filter((t) => !(t < e && t + 60 > s));
    }
  }
  if (isBlockedDay) freeStarts = [];
  freeStarts = [...new Set(freeStarts)]
    .filter((t) => !bookings.some((b) => b.startMin === t))
    .sort((a, b) => a - b);

  const slots: CalendarSlot[] = [
    ...freeStarts.map((t) => ({ start: mockIso(date, t), end: mockIso(date, t + 60), status: "free" as const })),
    ...bookings.map((b) => ({
      start: mockIso(date, b.startMin),
      end: mockIso(date, b.startMin + 60),
      status: "booked" as const,
      bookingId: b.id,
      clientId: b.clientId,
      clientName: b.clientName,
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return {
    date,
    totalSlots: slots.length,
    freeSlots: freeStarts.length,
    bookedSlots: bookings.length,
    isBlockedDay,
    hasAvailability: weeklyDay || exceptions.some((e) => e.type === "extra_range"),
    slots,
    exceptions: exceptions.map(({ id, type, startTime, endTime }) => ({ id, type, startTime, endTime })),
  };
}

async function mockApi<T>(url: string, options?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 150));
  const method = (options?.method ?? "GET").toUpperCase();
  const [path, query] = url.split("?");
  if (method === "GET" && path === "/availability/calendar") {
    const params = new URLSearchParams(query);
    const from = params.get("from")!;
    const to = params.get("to")!;
    const days: CalendarDay[] = [];
    const [fy, fm, fd] = from.split("-").map(Number);
    for (let i = 0; ; i++) {
      const date = new Date(Date.UTC(fy, fm - 1, fd + i, 12)).toISOString().slice(0, 10);
      days.push(buildMockDay(date));
      if (date === to || i > 62) break;
    }
    return { from, to, days } as T;
  }
  if (method === "POST" && path === "/availability/exceptions") {
    const body = JSON.parse(String(options?.body ?? "{}"));
    const id = mockState.nextId++;
    mockState.exceptions.push({
      id,
      type: body.type,
      date: body.date,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      sessionDurationMinutes: body.sessionDurationMinutes,
      breakMinutes: body.breakMinutes,
    });
    return { id } as T;
  }
  if (method === "DELETE" && path.startsWith("/availability/exceptions/")) {
    const id = Number(path.split("/").pop());
    mockState.exceptions = mockState.exceptions.filter((e) => e.id !== id);
    return undefined as T;
  }
  if (method === "PATCH" && /^\/bookings\/\d+\/cancel$/.test(path)) {
    const id = Number(path.split("/")[2]);
    const b = mockState.bookings.find((x) => x.id === id);
    if (b) b.cancelled = true;
    return { id, status: "cancelled" } as T;
  }
  if (method === "POST" && path === "/availability/exceptions/batch") {
    const body = JSON.parse(String(options?.body ?? "{}"));
    const dates: string[] = [...new Set(body.dates as string[])];
    let created = 0;
    let removed = 0;
    let skipped = 0;
    if (body.action === "clear_exceptions") {
      const before = mockState.exceptions.length;
      mockState.exceptions = mockState.exceptions.filter((e) => !dates.includes(e.date));
      removed = before - mockState.exceptions.length;
    } else if (body.action === "block_days") {
      for (const date of dates) {
        if (mockState.exceptions.some((e) => e.date === date && e.type === "blocked_day")) {
          skipped++;
        } else {
          mockState.exceptions.push({ id: mockState.nextId++, type: "blocked_day", startTime: null, endTime: null, date });
          created++;
        }
      }
    } else if (body.action === "add_extra_range") {
      for (const date of dates) {
        const identical = mockState.exceptions.some(
          (e) => e.date === date && e.type === "extra_range" && e.startTime === body.startTime && e.endTime === body.endTime,
        );
        if (identical) {
          skipped++;
        } else {
          mockState.exceptions.push({
            id: mockState.nextId++,
            type: "extra_range",
            startTime: body.startTime,
            endTime: body.endTime,
            date,
            sessionDurationMinutes: body.sessionDurationMinutes,
            breakMinutes: body.breakMinutes,
          });
          created++;
        }
      }
    }
    return { created, removed, skipped } as T;
  }
  throw Object.assign(new Error("Ta funkcja nie jest dostępna w podglądzie."), { status: 501 });
}

function fullDatePl(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pl-PL", {
    timeZone: WARSAW_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function daySummaryText(day: CalendarDay | undefined, isPast: boolean): string[] {
  if (!day) return [];
  const lines: string[] = [];
  if (day.isBlockedDay) lines.push("Dzień zablokowany");
  if (day.bookedSlots > 0) lines.push(plural(day.bookedSlots, "rezerwacja", "rezerwacje", "rezerwacji"));
  if (!day.isBlockedDay) {
    if (day.freeSlots > 0 && !isPast) lines.push(plural(day.freeSlots, "wolny", "wolne", "wolnych"));
    else if (day.hasAvailability && !isPast) lines.push("Brak wolnych terminów");
    else if (!day.hasAvailability && day.bookedSlots === 0) lines.push("Brak dostępności");
  }
  return lines;
}

const EXCEPTION_LABELS: Record<CalendarException["type"], string> = {
  blocked_day: "Blokada całego dnia",
  blocked_range: "Blokada zakresu godzin",
  extra_range: "Dodatkowa dostępność",
};

// ─── Day details panel ───────────────────────────────────────────────────────

function DayDetails({
  day,
  date,
  isPast,
  onClose,
  onChanged,
}: {
  day: CalendarDay | undefined;
  date: string;
  isPast: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmBlockDay, setConfirmBlockDay] = useState(false);
  const [openForm, setOpenForm] = useState<"blocked_range" | "extra_range" | null>(null);
  const [rangeForm, setRangeForm] = useState({ startTime: "10:00", endTime: "12:00", sessionDurationMinutes: "60", breakMinutes: "0" });

  const bookings = day?.slots.filter((s) => s.status === "booked") ?? [];
  const freeSlots = day?.slots.filter((s) => s.status === "free") ?? [];

  const createException = useCallback(async (body: Record<string, unknown>, successMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/availability/exceptions", { method: "POST", body: JSON.stringify(body) });
      toast({ description: successMsg });
      setOpenForm(null);
      setConfirmBlockDay(false);
      onChanged();
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    } finally {
      setBusy(false);
    }
  }, [busy, toast, onChanged]);

  const deleteException = useCallback(async (id: number, successMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/availability/exceptions/${id}`, { method: "DELETE" });
      toast({ description: successMsg });
      onChanged();
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    } finally {
      setBusy(false);
    }
  }, [busy, toast, onChanged]);

  const cancelBooking = useCallback(async (id: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/bookings/${id}/cancel`, { method: "PATCH" });
      toast({ description: "Rezerwacja została anulowana." });
      onChanged();
    } catch (err) {
      toast({ variant: "destructive", description: humanizeError(err) });
    } finally {
      setBusy(false);
    }
  }, [busy, toast, onChanged]);

  // blocked_range overlap warning (client-side info only; backend never cancels bookings).
  const rangeOverlapsBooking = useMemo(() => {
    if (openForm !== "blocked_range") return false;
    const [sh, sm] = rangeForm.startTime.split(":").map(Number);
    const [eh, em] = rangeForm.endTime.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return bookings.some((b) => {
      const t = new Date(b.start);
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: WARSAW_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(t);
      const [bh, bm] = parts.split(":").map(Number);
      const bs = bh * 60 + bm;
      const be = bs + (new Date(b.end).getTime() - t.getTime()) / 60_000;
      return bs < e && be > s;
    });
  }, [openForm, rangeForm.startTime, rangeForm.endTime, bookings]);

  const timeRange = (s: CalendarSlot) =>
    `${formatBookingTime(s.start)}–${formatBookingTime(s.end)}`;
  const durationMin = (s: CalendarSlot) =>
    Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b">
        <div>
          <h3 className="font-semibold capitalize">{fullDatePl(date)}</h3>
          <p className="text-xs text-muted-foreground">
            {day ? daySummaryText(day, isPast).join(" · ") || "Brak danych" : "Brak danych"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Zamknij szczegóły dnia" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Bookings */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Rezerwacje</h4>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak rezerwacji.</p>
          ) : (
            <ul className="space-y-3">
              {bookings.map((b) => (
                <li key={b.bookingId} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{b.clientName}</p>
                    <p className="text-sm text-muted-foreground">{timeRange(b)} · {durationMin(b)} min</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/clients/${b.clientId}`}>Otwórz profil klienta</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/clients/${b.clientId}/trainer-session`}>Rozpocznij trening</Link>
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void cancelBooking(b.bookingId!)}>
                      Anuluj
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Free slots */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Wolne terminy</h4>
          {freeSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {day?.isBlockedDay ? "Dzień zablokowany." : "Brak wolnych terminów."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {freeSlots.map((s) => (
                <li key={s.start} className="text-sm border rounded-md px-2.5 py-1.5 text-muted-foreground">
                  {timeRange(s)} · {durationMin(s)} min
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Exceptions */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Wyjątki</h4>
          {(day?.exceptions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wyjątków dla tego dnia.</p>
          ) : (
            <ul className="space-y-2">
              {day!.exceptions.map((ex) => (
                <li key={ex.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                  <div className="text-sm">
                    <p className="font-medium">{EXCEPTION_LABELS[ex.type]}</p>
                    {ex.startTime && ex.endTime && (
                      <p className="text-muted-foreground">{ex.startTime}–{ex.endTime}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void deleteException(
                        ex.id,
                        ex.type === "extra_range" ? "Dodatkowa dostępność została usunięta." : "Blokada została usunięta.",
                      )
                    }
                  >
                    {ex.type === "extra_range" ? "Usuń dodatkową dostępność" : "Usuń blokadę"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add exception actions (future days only) */}
        {!isPast ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Zarządzaj dniem</h4>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy || day?.isBlockedDay} onClick={() => setConfirmBlockDay(true)}>
                Zablokuj cały dzień
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpenForm(openForm === "blocked_range" ? null : "blocked_range")}>
                Zablokuj zakres godzin
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpenForm(openForm === "extra_range" ? null : "extra_range")}>
                Dodaj dodatkową dostępność
              </Button>
            </div>

            {openForm && (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">
                  {openForm === "blocked_range" ? "Zablokuj zakres godzin" : "Dodaj dodatkową dostępność"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="ex-start">Od</label>
                    <Input id="ex-start" type="time" value={rangeForm.startTime} onChange={(e) => setRangeForm((f) => ({ ...f, startTime: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="ex-end">Do</label>
                    <Input id="ex-end" type="time" value={rangeForm.endTime} onChange={(e) => setRangeForm((f) => ({ ...f, endTime: e.target.value }))} />
                  </div>
                  {openForm === "extra_range" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="ex-session">Sesja (min)</label>
                        <Input id="ex-session" type="number" min={15} max={240} step={5} value={rangeForm.sessionDurationMinutes} onChange={(e) => setRangeForm((f) => ({ ...f, sessionDurationMinutes: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="ex-break">Przerwa (min)</label>
                        <Input id="ex-break" type="number" min={0} max={120} step={5} value={rangeForm.breakMinutes} onChange={(e) => setRangeForm((f) => ({ ...f, breakMinutes: e.target.value }))} />
                      </div>
                    </>
                  )}
                </div>
                {rangeForm.endTime <= rangeForm.startTime && (
                  <p className="text-sm text-destructive" role="alert">
                    Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.
                  </p>
                )}
                {openForm === "blocked_range" && rangeOverlapsBooking && (
                  <p className="text-sm text-amber-600" role="alert">
                    Uwaga: zakres nachodzi na istniejącą rezerwację. Rezerwacja nie zostanie anulowana.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || rangeForm.endTime <= rangeForm.startTime}
                    onClick={() => {
                      if (openForm === "blocked_range") {
                        void createException(
                          { type: "blocked_range", date, startTime: rangeForm.startTime, endTime: rangeForm.endTime },
                          "Zakres godzin został zablokowany.",
                        );
                      } else {
                        void createException(
                          {
                            type: "extra_range",
                            date,
                            startTime: rangeForm.startTime,
                            endTime: rangeForm.endTime,
                            sessionDurationMinutes: Number(rangeForm.sessionDurationMinutes),
                            breakMinutes: Number(rangeForm.breakMinutes) || 0,
                          },
                          "Dodatkowa dostępność została dodana.",
                        );
                      }
                    }}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Zapisz"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setOpenForm(null)}>Anuluj</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Dzień przeszły — nie można dodawać wyjątków.</p>
        )}
      </div>

      <AlertDialog open={confirmBlockDay} onOpenChange={setConfirmBlockDay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zablokować cały dzień?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="capitalize">{fullDatePl(date)}</span>. Klienci nie będą mogli rezerwować
              treningów w tym dniu. Istniejące rezerwacje nie zostaną automatycznie anulowane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void createException({ type: "blocked_day", date }, "Dzień został zablokowany.")}
            >
              Zablokuj dzień
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Month section ───────────────────────────────────────────────────────────

/** Tracks the lg breakpoint so the mobile Sheet never mounts on desktop (and vice versa). */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

// ─── Status legend (Stage 4.1B.1) ────────────────────────────────────────────

const LEGEND_STATUSES: DayStatus[] = [
  "AVAILABLE",
  "PARTIALLY_BOOKED",
  "FULLY_BOOKED",
  "BLOCKED",
  "NO_AVAILABILITY",
];

function StatusLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-3 sm:px-4 py-2 border-t">
      {/* Mobile: collapsible; desktop: always visible */}
      <button
        type="button"
        className="sm:hidden text-xs font-medium text-muted-foreground underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Ukryj legendę" : "Pokaż legendę"}
      </button>
      <ul className={`${open ? "flex" : "hidden"} sm:flex flex-wrap gap-x-4 gap-y-1 mt-2 sm:mt-0`}>
        {LEGEND_STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${DAY_STATUS_META[s].dotClass}`} />
            {DAY_STATUS_META[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Bulk edit types ─────────────────────────────────────────────────────────

type BulkAction = "block" | "extra" | "clear";

interface BatchSummary {
  created: number;
  removed: number;
  skipped: number;
}

function MonthSection() {
  const isDesktop = useIsDesktop();
  const { toast } = useToast();
  const today = todayWarsaw();
  const [ty, tm] = today.split("-").map(Number);
  const [view, setView] = useState({ year: ty, month: tm });
  const [days, setDays] = useState<Map<string, CalendarDay> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // Remembers the last opened day so the mobile sheet can restore focus to its
  // grid cell after closing (selected is already null by then).
  const lastSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selected) lastSelectedRef.current = selected;
  }, [selected]);

  // ── Bulk edit state (Stage 4.1B.1) ──
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [mobileActions, setMobileActions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extraForm, setExtraForm] = useState({ startTime: "16:00", endTime: "20:00", sessionDurationMinutes: "60", breakMinutes: "0" });
  const anchorRef = useRef<string | null>(null);
  // Mouse drag selection (never native HTML5 DnD, never touch — scrolling stays free).
  const dragRef = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });
  // A mouse pointerdown already handled selection; the browser still fires a
  // click afterwards — suppress it or the day would toggle right back off.
  const suppressClickRef = useRef(false);

  const { from, to } = monthRange(view.year, view.month);

  useEffect(() => {
    let stale = false;
    setLoadError(null);
    setDays(null);
    apiFetch<{ days: CalendarDay[] }>(`/availability/calendar?from=${from}&to=${to}`)
      .then((data) => {
        if (stale) return;
        setDays(new Map(data.days.map((d) => [d.date, d])));
      })
      .catch((err: unknown) => {
        if (!stale) setLoadError(humanizeError(err));
      });
    return () => {
      stale = true;
    };
  }, [from, to, reload]);

  const refresh = useCallback(() => setReload((c) => c + 1), []);
  const grid = useMemo(() => getMonthGrid(view.year, view.month), [view]);
  const gridDates = useMemo(
    () => grid.flat().map((c) => c.date).filter((d): d is string => d !== null),
    [grid],
  );

  const go = (delta: number) => {
    setView((v) => addMonths(v.year, v.month, delta));
    setSelected(null);
    // Bulk selection is per-visible-month; navigating away clears it.
    setSelectedDays(new Set());
    anchorRef.current = null;
  };

  // ── Bulk selection handlers ──
  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedDays(new Set());
    setMobileActions(false);
    anchorRef.current = null;
  }, []);

  const applyDay = useCallback((date: string, mode: "add" | "remove") => {
    setSelectedDays((prev) => {
      if (mode === "add" ? prev.has(date) : !prev.has(date)) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(date);
      else next.delete(date);
      return next;
    });
  }, []);

  const bulkSelect = useCallback(
    (date: string, shiftKey: boolean) => {
      if (!isSelectable(date, today)) return;
      if (shiftKey && anchorRef.current) {
        setSelectedDays((prev) => selectRange(prev, gridDates, anchorRef.current!, date, today));
      } else {
        setSelectedDays((prev) => toggleDay(prev, date));
      }
      anchorRef.current = date;
    },
    [gridDates, today],
  );

  // Escape clears the whole selection (only when no dialog is open — dialogs
  // own their Escape).
  useEffect(() => {
    if (!bulkMode || pendingAction || mobileActions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedDays.size > 0) {
        setSelectedDays(new Set());
        anchorRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkMode, pendingAction, mobileActions, selectedDays.size]);

  // End a mouse drag anywhere on the page.
  useEffect(() => {
    const end = () => {
      dragRef.current.active = false;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  // ── Batch operation runner (single request, atomic on the server) ──
  const runBatch = useCallback(
    async (payload: Record<string, unknown>, successMsg: (s: BatchSummary) => string) => {
      if (busy) return; // double-click guard
      setBusy(true);
      try {
        const summary = await apiFetch<BatchSummary>("/availability/exceptions/batch", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ description: successMsg(summary) });
        setPendingAction(null);
        setMobileActions(false);
        setSelectedDays(new Set());
        anchorRef.current = null;
        refresh(); // keeps the currently open month (view unchanged)
      } catch (err) {
        toast({ variant: "destructive", description: humanizeError(err) });
      } finally {
        setBusy(false);
      }
    },
    [busy, toast, refresh],
  );

  const selectedList = useMemo(() => [...selectedDays].sort(), [selectedDays]);
  const selectedWithBookings = useMemo(
    () => selectedList.filter((d) => (days?.get(d)?.bookedSlots ?? 0) > 0),
    [selectedList, days],
  );
  const extraFormInvalid =
    extraForm.endTime <= extraForm.startTime ||
    !Number(extraForm.sessionDurationMinutes) ||
    Number(extraForm.sessionDurationMinutes) < 15 ||
    Number(extraForm.sessionDurationMinutes) > 240 ||
    Number(extraForm.breakMinutes) < 0 ||
    Number(extraForm.breakMinutes) > 120 ||
    (hhmmToMin(extraForm.endTime) - hhmmToMin(extraForm.startTime)) < Number(extraForm.sessionDurationMinutes);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start">
      <section className="border rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b gap-2">
          <Button variant="outline" size="icon" aria-label="Poprzedni miesiąc" onClick={() => go(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-semibold truncate">{monthLabelPl(view.year, view.month)}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setView({ year: ty, month: tm });
                setSelected(today);
              }}
            >
              Dzisiaj
            </Button>
          </div>
          <Button variant="outline" size="icon" aria-label="Następny miesiąc" onClick={() => go(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Bulk edit toggle + toolbar */}
        <div className="px-3 sm:px-4 py-2 border-b flex flex-wrap items-center gap-2">
          <Button
            variant={bulkMode ? "secondary" : "outline"}
            size="sm"
            aria-pressed={bulkMode}
            onClick={() => {
              if (bulkMode) {
                exitBulkMode();
              } else {
                setBulkMode(true);
                setSelected(null); // bulk mode never opens the details panel
              }
            }}
          >
            {bulkMode ? "Zakończ edycję" : (
              <>
                <span className="sm:hidden">Zaznacz wiele dni</span>
                <span className="hidden sm:inline">Edytuj wiele dni</span>
              </>
            )}
          </Button>
          {bulkMode && (
            <>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                {selectedDays.size > 0 ? `Wybrano ${pluralPl(selectedDays.size, "dzień", "dni", "dni")}` : "Zaznacz dni w kalendarzu"}
              </span>
              {/* Desktop/tablet inline toolbar; mobile uses the fixed bottom bar */}
              <div className="hidden sm:flex flex-wrap gap-2 ml-auto">
                <Button size="sm" variant="outline" disabled={selectedDays.size === 0} onClick={() => setPendingAction("block")}>
                  Zablokuj dni
                </Button>
                <Button size="sm" variant="outline" disabled={selectedDays.size === 0} onClick={() => setPendingAction("extra")}>
                  Dodaj dostępność
                </Button>
                <Button size="sm" variant="outline" disabled={selectedDays.size === 0} onClick={() => setPendingAction("clear")}>
                  Usuń zmiany dni
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={selectedDays.size === 0}
                  onClick={() => { setSelectedDays(new Set()); anchorRef.current = null; }}
                >
                  Anuluj zaznaczenie
                </Button>
              </div>
            </>
          )}
        </div>

        {loadError ? (
          <div role="alert" className="px-5 py-8 text-sm text-muted-foreground">
            {loadError}{" "}
            <button className="underline font-medium" onClick={refresh}>Spróbuj ponownie</button>
          </div>
        ) : days === null ? (
          <div className="px-5 py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-2 sm:p-3">
            <div className="grid grid-cols-7 mb-1" role="row">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.flat().map((cell, i) =>
                cell.date === null ? (
                  <div key={`blank-${i}`} aria-hidden="true" />
                ) : (
                  (() => {
                    const date = cell.date; // narrowed to string for deferred handlers
                    const day = days.get(date);
                    const isPast = cell.date < today;
                    const isToday = cell.date === today;
                    const isDetailsOpen = !bulkMode && selected === cell.date;
                    const isBulkSelected = bulkMode && selectedDays.has(cell.date);
                    const status = getDayStatus(day, isPast);
                    const meta = DAY_STATUS_META[status];
                    const statusLines = dayStatusText(status, day);
                    // Bookings on a blocked/past day stay visible in text.
                    if (status === "BLOCKED" && (day?.bookedSlots ?? 0) > 0) {
                      statusLines.push(pluralPl(day!.bookedSlots, "rezerwacja", "rezerwacje", "rezerwacji"));
                    }
                    const selectable = isSelectable(cell.date, today);
                    const ariaState = isBulkSelected ? ", zaznaczony" : "";
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        data-date={cell.date}
                        disabled={bulkMode && !selectable}
                        onClick={(e) => {
                          if (!bulkMode) {
                            setSelected(cell.date);
                            return;
                          }
                          // Mouse selection is handled in pointerdown (drag support);
                          // click handles keyboard + touch only.
                          if (suppressClickRef.current) {
                            suppressClickRef.current = false;
                            return;
                          }
                          bulkSelect(date, e.shiftKey);
                        }}
                        onPointerDown={(e) => {
                          if (!bulkMode || e.pointerType !== "mouse" || !selectable) return;
                          e.preventDefault(); // no text selection while dragging
                          suppressClickRef.current = true;
                          if (e.shiftKey) {
                            bulkSelect(date, true);
                            return;
                          }
                          const mode = selectedDays.has(date) ? "remove" : "add";
                          dragRef.current = { active: true, mode };
                          applyDay(date, mode);
                          anchorRef.current = date;
                        }}
                        onPointerEnter={(e) => {
                          if (!bulkMode || !dragRef.current.active || e.pointerType !== "mouse" || !selectable) return;
                          applyDay(date, dragRef.current.mode);
                          anchorRef.current = date;
                        }}
                        aria-label={`${fullDatePl(cell.date)}: ${statusLines.length ? statusLines.join(", ") : meta.label}${ariaState}`}
                        aria-pressed={bulkMode ? isBulkSelected : isDetailsOpen}
                        className={[
                          "min-h-14 sm:min-h-20 rounded-md border p-1 sm:p-1.5 text-left flex flex-col gap-0.5 select-none",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          meta.cellClass,
                          isPast ? "opacity-45" : "",
                          bulkMode && !selectable ? "cursor-not-allowed" : "",
                          isDetailsOpen ? "ring-2 ring-primary border-primary" : "",
                          // Selection state is independent of the status color.
                          isBulkSelected ? "ring-2 ring-primary border-primary shadow-[inset_0_0_0_2px_var(--accent)]" : "",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-1 self-start">
                          <span
                            className={[
                              "text-xs sm:text-sm font-medium rounded-full w-6 h-6 flex items-center justify-center",
                              isToday ? "bg-primary text-primary-foreground" : "",
                            ].join(" ")}
                          >
                            {Number(cell.date.slice(8))}
                          </span>
                          {isBulkSelected && (
                            <span aria-hidden="true" className="text-[10px] font-bold text-primary">✓</span>
                          )}
                          <span aria-hidden="true" className={`sm:hidden w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                        </span>
                        <span className="hidden sm:flex flex-col gap-0.5">
                          {statusLines.map((line) => (
                            <span key={line} className="text-[11px] leading-tight text-muted-foreground">{line}</span>
                          ))}
                        </span>
                        {/* Mobile: compact counters, meaning also carried by aria-label + details panel */}
                        <span className="sm:hidden text-[10px] leading-tight text-muted-foreground">
                          {day?.isBlockedDay
                            ? "Zabl."
                            : status === "NO_AVAILABILITY"
                              ? "—"
                              : [
                                  day && day.freeSlots > 0 && !isPast ? `${day.freeSlots} wol.` : null,
                                  day && day.bookedSlots > 0 ? `${day.bookedSlots} rez.` : null,
                                  day && !isPast && day.freeSlots === 0 && day.bookedSlots === 0 && day.hasAvailability ? "Pełny" : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                        </span>
                      </button>
                    );
                  })()
                ),
              )}
            </div>
          </div>
        )}
        <StatusLegend />
      </section>

      {/* Mobile: fixed bottom bar with selection count + actions (Stage 4.1B.1) */}
      {bulkMode && !isDesktop && <div aria-hidden="true" className="sm:hidden h-16" />}
      {bulkMode && !isDesktop && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <span aria-live="polite" className="text-sm font-medium">
            {selectedDays.size > 0 ? `Wybrano ${pluralPl(selectedDays.size, "dzień", "dni", "dni")}` : "Zaznacz dni"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={selectedDays.size === 0} onClick={() => { setSelectedDays(new Set()); anchorRef.current = null; }}>
              Wyczyść
            </Button>
            <Button size="sm" disabled={selectedDays.size === 0} onClick={() => setMobileActions(true)}>
              Dalej
            </Button>
          </div>
        </div>
      )}

      {/* Mobile action chooser */}
      <Sheet open={mobileActions} onOpenChange={setMobileActions}>
        <SheetContent side="bottom" aria-describedby={undefined} className="p-4 space-y-2">
          <SheetTitle>
            {`Wybrano ${pluralPl(selectedDays.size, "dzień", "dni", "dni")}`}
          </SheetTitle>
          <div className="flex flex-col gap-2 pt-1">
            <Button variant="outline" onClick={() => { setMobileActions(false); setPendingAction("block"); }}>
              Zablokuj dni
            </Button>
            <Button variant="outline" onClick={() => { setMobileActions(false); setPendingAction("extra"); }}>
              Dodaj dostępność
            </Button>
            <Button variant="outline" onClick={() => { setMobileActions(false); setPendingAction("clear"); }}>
              Usuń zmiany dni
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setMobileActions(false); setSelectedDays(new Set()); anchorRef.current = null; }}
            >
              Anuluj zaznaczenie
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk: block days confirmation */}
      <AlertDialog open={pendingAction === "block"} onOpenChange={(o) => { if (!o) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zablokować wybrane dni?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Liczba dni: {selectedList.length}. Daty: {summarizeDates(selectedList)}.
                </p>
                {selectedWithBookings.length > 0 && (
                  <p className="text-amber-600 font-medium">
                    Uwaga: {pluralPl(selectedWithBookings.length, "zaznaczony dzień ma", "zaznaczone dni mają", "zaznaczonych dni ma")} aktywne rezerwacje.
                    Rezerwacje pozostaną aktualne — blokada wyłącza tylko nowe rezerwacje.
                  </p>
                )}
                <p>Istniejące rezerwacje nie zostaną automatycznie anulowane.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault(); // keep dialog open until the request settles
                void runBatch(
                  { action: "block_days", dates: selectedList },
                  (s) =>
                    `Zablokowano ${pluralPl(s.created, "dzień", "dni", "dni")}.` +
                    (s.skipped > 0 ? ` ${pluralPl(s.skipped, "dzień był", "dni były", "dni było")} już zablokowane.` : ""),
                );
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Potwierdź zablokowanie"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk: add extra availability */}
      <AlertDialog open={pendingAction === "extra"} onOpenChange={(o) => { if (!o) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dodaj dostępność w wybranych dniach</AlertDialogTitle>
            <AlertDialogDescription>
              Jeden zakres godzin zostanie dodany do wszystkich zaznaczonych dni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-start">Od</label>
              <Input id="bulk-start" type="time" value={extraForm.startTime} onChange={(e) => setExtraForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-end">Do</label>
              <Input id="bulk-end" type="time" value={extraForm.endTime} onChange={(e) => setExtraForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-session">Sesja (min)</label>
              <Input id="bulk-session" type="number" min={15} max={240} step={5} value={extraForm.sessionDurationMinutes} onChange={(e) => setExtraForm((f) => ({ ...f, sessionDurationMinutes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-break">Przerwa (min)</label>
              <Input id="bulk-break" type="number" min={0} max={120} step={5} value={extraForm.breakMinutes} onChange={(e) => setExtraForm((f) => ({ ...f, breakMinutes: e.target.value }))} />
            </div>
          </div>
          {extraForm.endTime <= extraForm.startTime ? (
            <p className="text-sm text-destructive" role="alert">
              Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.
            </p>
          ) : extraFormInvalid ? (
            <p className="text-sm text-destructive" role="alert">
              Sprawdź długość sesji (15–240 min) i przerwę (0–120 min) — zakres musi pomieścić co najmniej jedną sesję.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dodasz dostępność {extraForm.startTime}–{extraForm.endTime} w {pluralPl(selectedList.length, "dniu", "dniach", "dniach")}.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || extraFormInvalid}
              onClick={(e) => {
                e.preventDefault();
                void runBatch(
                  {
                    action: "add_extra_range",
                    dates: selectedList,
                    startTime: extraForm.startTime,
                    endTime: extraForm.endTime,
                    sessionDurationMinutes: Number(extraForm.sessionDurationMinutes),
                    breakMinutes: Number(extraForm.breakMinutes) || 0,
                  },
                  (s) =>
                    `Dodano dostępność w ${pluralPl(s.created, "dniu", "dniach", "dniach")}.` +
                    (s.skipped > 0 ? ` Pominięto ${pluralPl(s.skipped, "dzień z identycznym zakresem", "dni z identycznym zakresem", "dni z identycznym zakresem")}.` : ""),
                );
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Dodaj dostępność"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk: clear one-off exceptions */}
      <AlertDialog open={pendingAction === "clear"} onOpenChange={(o) => { if (!o) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć zmiany wybranych dni?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Liczba dni: {selectedList.length}. Daty: {summarizeDates(selectedList)}.
                </p>
                <p>
                  Usunięte zostaną jednorazowe wyjątki (blokady dni, blokady godzin, dodatkowa dostępność).
                  Dni wrócą do regularnego grafiku tygodniowego — regularna dostępność nie zostanie usunięta.
                  Rezerwacje pozostaną bez zmian.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void runBatch(
                  { action: "clear_exceptions", dates: selectedList },
                  (s) => (s.removed > 0 ? `Usunięto ${pluralPl(s.removed, "wyjątek", "wyjątki", "wyjątków")}.` : "Wybrane dni nie miały zmian do usunięcia."),
                );
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Usuń zmiany"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details: inline side panel on desktop, accessible bottom sheet on mobile.
          Radix Sheet provides focus trap, Escape-to-close, background scroll lock,
          dialog role and focus restore to the previously focused day cell. */}
      {selected && isDesktop && (
        <div className="hidden lg:block border rounded-lg sticky top-6 max-h-[80vh] overflow-hidden">
          <DayDetails
            day={days?.get(selected)}
            date={selected}
            isPast={selected < today}
            onClose={() => setSelected(null)}
            onChanged={refresh}
          />
        </div>
      )}
      {!isDesktop && (
        <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <SheetContent
            side="bottom"
            aria-describedby={undefined}
            onEscapeKeyDown={() => setSelected(null)}
            onCloseAutoFocus={(e) => {
              // Restore focus to the day cell that opened the sheet (Radix has
              // no Trigger here, so do it explicitly).
              e.preventDefault();
              const date = lastSelectedRef.current;
              if (date) {
                document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)?.focus();
              }
            }}
            className="h-[88dvh] p-0 rounded-t-xl overflow-hidden flex flex-col [&>button.absolute]:hidden"
          >
            <SheetTitle className="sr-only">
              {selected ? `Szczegóły dnia: ${fullDatePl(selected)}` : "Szczegóły dnia"}
            </SheetTitle>
            {selected && (
              <DayDetails
                day={days?.get(selected)}
                date={selected}
                isPast={selected < today}
                onClose={() => setSelected(null)}
                onChanged={refresh}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kalendarz</h1>
          <p className="text-sm text-muted-foreground">
            Dostępność i rezerwacje treningów stacjonarnych.
          </p>
        </div>
      </div>
      <Tabs defaultValue="month">
        <TabsList>
          <TabsTrigger value="month">Miesiąc</TabsTrigger>
          <TabsTrigger value="availability">Dostępność</TabsTrigger>
        </TabsList>
        <TabsContent value="month" className="mt-4">
          <MonthSection />
        </TabsContent>
        <TabsContent value="availability" className="mt-4 space-y-6">
          <AvailabilitySection />
          <UpcomingBookingsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
