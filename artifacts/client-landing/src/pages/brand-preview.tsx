/** Dev-only podgląd marki v1 (docs/screens/marka-v1/): logo, byczek w 6 stanach, odznaka, ładowanie, błąd, puste stany. Bez Clerk i bez API. */
import { Logo, Maskotka, MASKOTKA_STANY, GoldenBullBadge, GoldenBullsCounter, ErrorState, EmptyState, setBrandV1ForTests } from "@workspace/design-tokens/brand";

export const isBrandPreviewPath = () => import.meta.env.DEV && typeof window !== "undefined" && window.location.pathname.endsWith("/brand-preview");
if (isBrandPreviewPath()) {
  setBrandV1ForTests(true);
  const realFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url).split("?")[0]!;
    if (url === "/api/golden-bulls/status") return new Response(JSON.stringify({ enabled: true, trainer: { pool: 10, left: 7 }, solo: { pool: 100, left: 64 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/")) return new Response("{}", { status: 404 });
    return realFetch(input, init);
  }) as typeof window.fetch;
}

export default function BrandPreviewPage() {
  const only = new URLSearchParams(window.location.search).get("sekcja");
  const show = (k: string) => !only || only === k;
  return (
    <div className="mx-auto max-w-lg space-y-8 bg-background px-4 py-6 text-foreground">
      {show("logo") && (
        <section aria-label="Logo" className="space-y-3">
          <h2 className="section-label">Logo A „Rogate O”</h2>
          <div className="rounded-xl border border-border bg-card p-4"><Logo size={44} /></div>
          <div className="rounded-xl bg-stone-900 p-4"><Logo variant="white" size={44} /></div>
          <div className="flex items-center gap-4"><Logo variant="icon" size={48} /><GoldenBullBadge size={64} /></div>
        </section>
      )}
      {show("stany") && (
        <section aria-label="Byczek" className="space-y-3">
          <h2 className="section-label">Byczek: 6 stanów</h2>
          <div className="grid grid-cols-3 gap-3">
            {MASKOTKA_STANY.map((s) => (
              <div key={s} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2"><Maskotka stan={s} rozmiar="s" /><span className="text-xs text-muted-foreground">{s}</span></div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4"><Maskotka stan="idle" rozmiar="s" /><Maskotka stan="idle" rozmiar="m" /><Maskotka stan="idle" rozmiar="l" /></div>
        </section>
      )}
      {show("licznik") && (
        <section aria-label="Złote Byczki" className="space-y-3">
          <h2 className="section-label">Złote Byczki: licznik i odznaka</h2>
          <div className="space-y-2 rounded-xl border border-border bg-card p-4"><GoldenBullsCounter kind="solo" /><br /><GoldenBullsCounter kind="trainer" /></div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><GoldenBullBadge size={64} /><div><p className="text-xl font-extrabold">Złoty Byczek #12</p><p className="text-sm text-muted-foreground">Dziękujemy, że jesteś z nami od początku.</p></div></div>
        </section>
      )}
      {show("stany-ekranow") && (
        <section aria-label="Stany ekranów" className="space-y-3">
          <h2 className="section-label">Błąd i pusty stan</h2>
          <div className="rounded-xl border border-border bg-card"><ErrorState title="Brak połączenia" message="Sprawdź sieć i spróbuj ponownie." onRetry={() => {}} /></div>
          <div className="rounded-xl border border-border bg-card"><EmptyState title="Brak podopiecznych" message="Zaproś pierwszą osobę linkiem." /></div>
        </section>
      )}
    </div>
  );
}
