/**
 * Dev-only visual-verification page for the client-portal navigation
 * (nav + account menu + badge). Mounted only when import.meta.env.DEV —
 * see App.tsx. Use /portal-preview?mockBooking=1 so booking/history calls
 * are served by the in-page mock (no auth, no real data).
 *
 * Add &online=1 to simulate an online-only client (no Kalendarz item).
 */
import { useState } from "react";
import { PlanView } from "./plan";
import { ClientPortalNav, type PortalNavTarget } from "@/components/ClientPortalNav";

const ONLINE = new URLSearchParams(window.location.search).has("online");

const mockClient = { id: 1, firstName: "Anna", lastName: "Testowa" };

const mockPlan = {
  id: 1,
  clientId: 1,
  title: "Plan siłowy 3 dni",
  goal: "Budowa siły i masy mięśniowej",
  description: null,
  startDate: null,
  endDate: null,
  status: "active",
  updatedAt: new Date().toISOString(),
  cardioRecommendation: null,
  days: [
    {
      id: 1,
      planId: 1,
      dayOrder: 1,
      dayName: "Dzień A",
      subtitle: "Góra ciała",
      description: null,
      estimatedDurationMinutes: 55,
      exercises: [],
    },
    {
      id: 2,
      planId: 1,
      dayOrder: 2,
      dayName: "Dzień B",
      subtitle: "Dół ciała",
      description: null,
      estimatedDurationMinutes: 60,
      exercises: [],
    },
  ],
};

export default function PortalPreviewPage() {
  const [note, setNote] = useState<string | null>(null);

  const handleNavigate = (target: PortalNavTarget) => {
    setNote(`nav → ${target}`);
    requestAnimationFrame(() => {
      if (target === "plan") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const id = target === "history" ? "historia" : "rezerwacje";
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <ClientPortalNav
        firstName={mockClient.firstName}
        lastName={mockClient.lastName}
        showCalendar={!ONLINE}
        onNavigate={handleNavigate}
      />
      {note && (
        <p data-testid="nav-note" className="sr-only">
          {note}
        </p>
      )}
      <PlanView client={mockClient} plan={mockPlan} onSelectDay={() => setNote("select-day")} />
    </>
  );
}
