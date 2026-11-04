// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { fetchPortalFlags, shellEnabled } from "@/lib/shell/flags";
import { buildActivityGrid, MAP_WEEKS } from "@/lib/shell/activity";
import { ProgressScreen } from "./ProgressScreen";
import { BottomBar } from "./BottomBar";
import { SoloStart } from "./SoloStart";
import { YouScreen } from "./YouScreen";
import { RoleRows } from "./RoleRows";
import { LegalLinks } from "@/components/LegalLinks";
import { LEGAL_DOCUMENTS } from "@workspace/survey-config";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("flags: both off is the default and any failure means off", () => {
  it("reads both flags; a failing or 404 call counts as off", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("solo") ? json({ enabled: true }) : json({}, 404))));
    expect(await fetchPortalFlags()).toEqual({ solo: true, achievements: false, uiV2: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchPortalFlags()).toEqual({ solo: false, achievements: false, uiV2: false });
    expect(shellEnabled({ solo: false, achievements: false, uiV2: false })).toBe(false);
    expect(shellEnabled({ solo: true, achievements: false, uiV2: false })).toBe(true);
    expect(shellEnabled({ solo: false, achievements: true, uiV2: false })).toBe(true);
    expect(shellEnabled({ solo: false, achievements: false, uiV2: true })).toBe(true);
  });
});

describe("map of the year", () => {
  it("53 weeks × 7 days, Monday first, counts only past active days", () => {
    const { weeks, total } = buildActivityGrid(["2026-10-28", "2026-10-27", "2026-10-29", "2025-01-01", "2026-10-28"], "2026-10-28"); // Wed; 29th is the future
    expect(weeks).toHaveLength(MAP_WEEKS);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[MAP_WEEKS - 1]![0]!.date).toBe("2026-10-26");
    expect(total).toBe(2);
    expect(weeks[MAP_WEEKS - 1]!.find((c) => c.date === "2026-10-29")!.future).toBe(true);
  });
});

describe("Postępy: only what was earned", () => {
  const items = [
    { id: 1, kind: "record", title: "Nowy rekord: Przysiad", body: "60 kg × 8", earnedAt: "2026-10-20T10:00:00Z", seen: true },
    { id: 2, kind: "milestone", title: "10. trening", body: "Tak trzymaj", earnedAt: "2026-10-21T10:00:00Z", seen: false },
  ];
  it("shows streak, map, records and achievements; new ones are marked", () => {
    render(<ProgressScreen items={items} streakWeeks={3} activityDays={["2026-10-27"]} today="2026-10-28" />);
    expect(screen.getByTestId("streak-number").textContent).toBe("3");
    expect(screen.getByText("tygodnie z rzędu")).toBeTruthy();
    expect(screen.getByTestId("activity-map")).toBeTruthy();
    expect(screen.getByText("Przysiad")).toBeTruthy();
    expect(screen.getByText("Nowe")).toBeTruthy();
  });
  it("no streak: a warm sentence, never a loss or a comparison; empty states are encouraging", () => {
    const { container } = render(<ProgressScreen items={[]} streakWeeks={null} activityDays={[]} today="2026-10-28" />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const bad of ["strac", "utrac", "przerwan", "nie zdąż", "ranking", "inni", "innych", "najlepsz", "porówn"]) expect(text, bad).not.toContain(bad);
    expect(text).toContain("seria zaczyna się");
  });
  it("without ACHIEVEMENTS_ENABLED only the existing blocks are shown", () => {
    const { container } = render(<ProgressScreen items={items} streakWeeks={3} activityDays={[]} today="2026-10-28" showAchievements={false} steps={<p>kroki</p>} />);
    expect(container.textContent).not.toContain("Regularność");
    expect(container.textContent).not.toContain("Osiągnięcia");
    expect(container.textContent).toContain("kroki");
  });
});

describe("bottom bar and screens", () => {
  it("four tabs, each at least 56 px high, the current one marked", () => {
    const onChange = vi.fn();
    render(<BottomBar tab="postepy" onChange={onChange} />);
    const tabs = screen.getAllByRole("button");
    expect(tabs.map((b) => b.textContent)).toEqual(["Dziś", "Plan", "Postępy", "Ty"]);
    for (const b of tabs) expect(b.className).toContain("min-h-14");
    expect(tabs[2]!.getAttribute("aria-current")).toBe("page");
    fireEvent.click(tabs[3]!);
    expect(onChange).toHaveBeenCalledWith("ty");
  });
  it("Solo start: the button needs a name; with no interview yet it says so instead of a dead button", () => {
    const onStart = vi.fn();
    const { rerender } = render(<SoloStart onStart={onStart} interviewReady={false} />);
    expect((screen.getByRole("button", { name: "Zaczynamy" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Jak masz na imię?"), { target: { value: " Ola " } });
    fireEvent.click(screen.getByRole("button", { name: "Zaczynamy" }));
    expect(onStart).toHaveBeenCalledWith("Ola");
    rerender(<SoloStart onStart={onStart} interviewReady={false} created />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("wkrótce");
  });
  it("Ty: bez trenera wiersz „Mój trener — Wpisz kod trenera” rozwija się i łączy kodem; z trenerem wiersz pokazuje jego imię; wylogowanie jest", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ isTrainer: false, isClient: true, application: null }) })));
    const onJoin = vi.fn(); const onSignOut = vi.fn();
    const base = { firstName: "Anna", lastName: "T", email: "a@b.pl", settings: null, legal: null, onSignOut };
    const { rerender } = render(<YouScreen {...base} accountRows={<RoleRows trainerName={null} onJoin={onJoin} />} />);
    expect(screen.getByText("Mój trener")).toBeTruthy();
    expect(screen.queryByLabelText("Kod trenera")).toBeNull(); // dyskretnie: pole dopiero po kliknięciu wiersza
    fireEvent.click(screen.getByText("Mój trener"));
    fireEvent.change(screen.getByLabelText("Kod trenera"), { target: { value: "abcde-fghij" } });
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(onJoin).toHaveBeenCalledWith("/join/ABCDEFGHIJ");
    fireEvent.click(screen.getByRole("button", { name: /Wyloguj/ }));
    expect(onSignOut).toHaveBeenCalled();
    rerender(<YouScreen {...base} accountRows={<RoleRows trainerName="Marek" onJoin={onJoin} />} />);
    expect(screen.queryByLabelText("Kod trenera")).toBeNull();
    expect(screen.getByText("Marek")).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it("Ty: „Prowadzę podopiecznych” to zwykły wiersz (raz, bez karty), a po wniosku w tym samym wierszu jest „Wniosek wysłany — odpowiemy zwykle w ciągu 24 godzin”; linki do dokumentów mają min. 44 px", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ isTrainer: false, isClient: true, application: { status: "pending", canApply: false } }) })));
    const { container } = render(<YouScreen firstName="A" lastName="B" email="" settings={null} accountRows={<RoleRows trainerName="M" onJoin={() => {}} />} legal={<LegalLinks className="justify-start" />} onSignOut={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("row-apply").textContent).toContain("Wniosek wysłany — odpowiemy zwykle w ciągu 24 godzin"));
    expect((container.textContent ?? "").split("Prowadzę podopiecznych").length - 1).toBe(1);
    expect(container.querySelector('[data-testid="row-apply"] button')).toBeNull(); // nic do kliknięcia, gdy wniosek czeka
    const links = [...container.querySelectorAll('[data-testid="legal-links"] a')];
    expect(links).toHaveLength(LEGAL_DOCUMENTS.length);
    for (const a of links) expect(a.className).toContain("min-h-11");
    vi.unstubAllGlobals();
  });
});
