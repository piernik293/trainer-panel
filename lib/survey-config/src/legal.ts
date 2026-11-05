/**
 * Legal documents — SKELETONS ONLY (block 5c). Structure and places to fill in; no legal advice, no final wording.
 * Every placeholder is marked "DO UZUPEŁNIENIA PRZEZ PRAWNIKA". The lawyer replaces the text; the app only shows it.
 * The health-consent version (HEALTH_CONSENT_VERSION) is stored with each consent (block 5d) — bump it when the text changes.
 */
import { REGULAMIN_VERSION, REGULAMIN_SECTIONS } from "./regulamin";
export { REGULAMIN_VERSION } from "./regulamin";
export const LEGAL_PLACEHOLDER = "DO UZUPEŁNIENIA PRZEZ PRAWNIKA";

export interface LegalSection { heading: string; text: string }
/** `draft`: tekst jest projektem w trakcie weryfikacji prawnej (pasek „Wersja testowa”). */
export interface LegalDocument { draft?: boolean; slug: "polityka-prywatnosci" | "regulamin" | "zgoda-zdrowie"; title: string; version: string; sections: LegalSection[] }

const ph = (what: string) => `${LEGAL_PLACEHOLDER}: ${what}`;

export const HEALTH_CONSENT_VERSION = "szkielet-1";

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    slug: "polityka-prywatnosci", title: "Polityka prywatności", version: "szkielet-1",
    sections: [
      { heading: "1. Kto jest administratorem danych", text: ph("nazwa, adres, kontakt administratora; czy trener jest odrębnym administratorem") },
      { heading: "2. Jakie dane zbieramy", text: ph("lista kategorii danych (konto, wywiad, trening, kroki, dane o zdrowiu)") },
      { heading: "3. Cele i podstawy przetwarzania", text: ph("cele, podstawy prawne dla każdej kategorii danych") },
      { heading: "4. Komu przekazujemy dane", text: ph("odbiorcy, podmioty przetwarzające (logowanie, poczta, hosting), przekazywanie poza EOG") },
      { heading: "5. Jak długo przechowujemy dane", text: ph("okresy przechowywania, usuwanie konta") },
      { heading: "6. Twoje prawa", text: ph("dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie, sprzeciw, cofnięcie zgody, skarga do organu nadzorczego") },
      { heading: "7. Bezpieczeństwo", text: ph("opis środków bezpieczeństwa") },
      { heading: "8. Kontakt", text: ph("adres e-mail do spraw danych osobowych") },
    ],
  },
  { slug: "regulamin", title: "Regulamin", version: REGULAMIN_VERSION, draft: true, sections: REGULAMIN_SECTIONS },
  {
    slug: "zgoda-zdrowie", title: "Zgoda na przetwarzanie danych o zdrowiu", version: HEALTH_CONSENT_VERSION,
    sections: [
      { heading: "1. Czego dotyczy zgoda", text: ph("zakres: informacje o bólu, kontuzjach, ograniczeniach zdrowotnych podane w wywiadzie i podczas treningu") },
      { heading: "2. Do czego wykorzystujemy te dane", text: ph("dobór ćwiczeń i bezpieczeństwo planu; kto ma do nich dostęp (trener)") },
      { heading: "3. Dobrowolność i skutki braku zgody", text: ph("zgoda jest dobrowolna; bez niej wywiad działa, a plan jest przygotowywany z najostrożniejszymi ustawieniami") },
      { heading: "4. Cofnięcie zgody", text: ph("jak cofnąć zgodę (Ustawienia), skutki cofnięcia dla zapisanych danych") },
    ],
  },
];

export function legalDocument(slug: string | undefined): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
