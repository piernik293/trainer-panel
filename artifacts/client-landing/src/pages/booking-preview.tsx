/**
 * Dev-only visual-verification page for the client booking calendar
 * (Stage 4.1C). Mounted only when import.meta.env.DEV — see App.tsx.
 * Use with ?mockBooking=1 so all /client-portal/booking* calls are served by
 * the in-page synthetic mock (no auth, no real data).
 */
import { BookingSection } from "./plan";

export default function BookingPreviewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        <h1 className="text-lg font-bold tracking-tight">Podgląd rezerwacji (dev)</h1>
        <BookingSection />
      </div>
    </div>
  );
}
