/**
 * Katalog maili Optimatren: teksty (temat + treść) każdego maila w jednym miejscu — docs/MAILE.md jest ich kopią do akceptacji, a podgląd w panelu
 * administratora („Maile”) renderuje dokładnie te same funkcje. Zasady: do osoby po imieniu, 3–5 krótkich zdań, jeden przycisk, bez form zależnych
 * od płci i BEZ danych zdrowotnych (zgłoszenie bólu, wywiad — tylko „masz nowe zgłoszenie, zobacz w aplikacji”).
 */
import { renderMail, type MailContent } from "./layout";

export type MailId =
  | "invite" | "join_request" | "join_accepted" | "join_rejected" | "disconnected_by_trainer" | "disconnected_by_client" | "plan_ready"
  | "application_received" | "application_new" | "application_accepted" | "application_rejected"
  | "trial_ending" | "trial_ended" | "package_ending" | "pain_notice" | "owner_notice";

export interface MailData {
  name?: string | null;
  trainerName?: string | null;
  personName?: string | null;
  daysLeft?: number;
  sessionsLeft?: number;
  note?: string | null;
  email?: string | null;
  text?: string | null;
}
const appUrl = () => ((process.env["APP_PUBLIC_URL"] ?? "").trim() || "http://localhost:23889").replace(/\/+$/, "");
export const portalUrl = () => `${appUrl()}/client-landing/plan`;
export const panelUrl = (path = "/") => `${appUrl()}${path}`;
const sessions = (n: number) => (n === 0 ? "0 sesji" : n === 1 ? "1 sesja" : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? `${n} sesje` : `${n} sesji`);
const days = (n: number) => (n === 1 ? "1 dzień" : `${n} dni`);

export interface MailDef {
  id: MailId;
  /** nazwa w panelu administratora */
  label: string;
  audience: "osoba" | "trener" | "wnioskodawca" | "podopieczny" | "właściciel";
  /** kiedy wychodzi */
  when: string;
  sample: MailData;
  build: (d: MailData) => MailContent;
}

export const MAIL_CATALOGUE: Record<MailId, MailDef> = {
  invite: {
    id: "invite", label: "Zaproszenie od trenera", audience: "osoba", when: "Trener zaprasza osobę do wywiadu (e-mail albo link).",
    sample: { name: "Anna", trainerName: "Marek Nowak" },
    // Wysyłany własnym, wcześniejszym renderem (services/inviteEmail.ts — ten sam układ i kolory); tu tylko tekst do akceptacji.
    build: (d) => ({ name: d.name ?? null, subject: `${d.trainerName ?? "Trener"} zaprasza Cię do Optimatren — przygotuje Twój plan treningowy`, onBehalfOf: d.trainerName ?? null, reason: "trener zaprosił Cię do aplikacji",
      paragraphs: [`${d.trainerName ?? "Trener"}, Twój trener, zaprasza Cię do Optimatren — aplikacji, w której dostaniesz od niego plan i zapiszesz treningi. Dla Ciebie jest bezpłatna.`, "Zacznij od krótkiego wywiadu (ok. 5 minut). Na jego podstawie trener przygotuje Twój plan.", "Link jest ważny 7 dni. Jeśli nie znasz tej osoby, zignoruj tę wiadomość."],
      button: { label: "Wypełnij wywiad", url: `${appUrl()}/client-landing/survey/PRZYKLAD` } }),
  },
  join_request: {
    id: "join_request", label: "Prośba o dołączenie (do trenera)", audience: "trener", when: "Osoba wpisała kod albo użyła linku trenera.",
    sample: { name: "Marek", personName: "Anna" },
    build: (d) => ({ name: d.name ?? null, subject: "Nowa prośba o dołączenie", reason: "ktoś poprosił o dołączenie do Twoich podopiecznych",
      paragraphs: [`${d.personName ?? "Ktoś"} chce dołączyć do Twoich podopiecznych.`, "Zaakceptuj prośbę albo ją odrzuć — wystarczy jedno kliknięcie w aplikacji."],
      button: { label: "Zobacz prośbę", url: panelUrl("/settings#dolaczanie") } }),
  },
  join_accepted: {
    id: "join_accepted", label: "Akceptacja prośby (do podopiecznego)", audience: "podopieczny", when: "Trener zaakceptował prośbę o dołączenie.",
    sample: { name: "Anna", trainerName: "Marek Nowak" },
    build: (d) => ({ name: d.name ?? null, subject: "Trener przyjął Twoją prośbę", onBehalfOf: d.trainerName ?? null, reason: "z Twojego konta poproszono o dołączenie do trenera",
      paragraphs: [`Twoja prośba została przyjęta. Twoim trenerem jest ${d.trainerName ?? "wybrany trener"}.`, "Od teraz plan i treningi są w jednym miejscu. Wkrótce dostaniesz od trenera swój plan."],
      button: { label: "Otwórz aplikację", url: portalUrl() } }),
  },
  join_rejected: {
    id: "join_rejected", label: "Odrzucenie prośby (do osoby)", audience: "osoba", when: "Trener odrzucił prośbę o dołączenie.",
    sample: { name: "Anna", trainerName: "Marek Nowak" },
    build: (d) => ({ name: d.name ?? null, subject: "Prośba nie została przyjęta", reason: "z Twojego konta poproszono o dołączenie do trenera",
      paragraphs: ["Twoja prośba nie została tym razem przyjęta.", ...(d.trainerName ? [`Trener: ${d.trainerName}.`] : []), "Możesz poprosić innego trenera albo trenować samodzielnie w aplikacji."],
      button: { label: "Otwórz aplikację", url: portalUrl() } }),
  },
  disconnected_by_trainer: {
    id: "disconnected_by_trainer", label: "Odłączenie przez trenera (do podopiecznego)", audience: "podopieczny", when: "Trener odłączył podopiecznego.",
    sample: { name: "Anna", trainerName: "Marek Nowak" },
    build: (d) => ({ name: d.name ?? null, subject: "Zakończono współpracę z trenerem", onBehalfOf: d.trainerName ?? null, reason: "Twoje konto było połączone z trenerem",
      paragraphs: ["Twoje konto zostało odłączone od trenera.", ...(d.trainerName ? [`Trener: ${d.trainerName}.`] : []), "Twoja historia treningów zostaje u Ciebie. Możesz dalej trenować samodzielnie albo poprosić o dołączenie do trenera."],
      button: { label: "Otwórz aplikację", url: portalUrl() } }),
  },
  disconnected_by_client: {
    id: "disconnected_by_client", label: "Odłączenie przez podopiecznego (do trenera)", audience: "trener", when: "Podopieczny odłączył się od trenera.",
    sample: { name: "Marek", personName: "Anna" },
    build: (d) => ({ name: d.name ?? null, subject: "Podopieczny odłączył się", reason: "ktoś był Twoim podopiecznym",
      paragraphs: [`Podopieczny: ${d.personName ?? "(bez imienia)"}.`, "Współpraca została zakończona z inicjatywy tej osoby.", "Nie masz już dostępu do jej danych."],
      button: { label: "Otwórz panel", url: panelUrl("/") } }),
  },
  plan_ready: {
    id: "plan_ready", label: "Plan gotowy (do podopiecznego)", audience: "podopieczny", when: "Trener aktywował plan.",
    sample: { name: "Anna", trainerName: "Marek Nowak" },
    build: (d) => ({ name: d.name ?? null, subject: "Twój plan jest gotowy", onBehalfOf: d.trainerName ?? null, reason: "Twój plan został właśnie aktywowany",
      paragraphs: ["Twój plan jest gotowy — zacznij pierwszy trening.", "Wszystko znajdziesz w aplikacji: ćwiczenia, serie i podpowiedzi. Działa też bez internetu."],
      button: { label: "Zacznij pierwszy trening", url: portalUrl() } }),
  },
  application_received: {
    id: "application_received", label: "Wniosek o konto trenera — potwierdzenie przyjęcia", audience: "wnioskodawca", when: "Osoba wysłała wniosek o konto trenera.",
    sample: { name: "Anna" },
    build: (d) => ({ name: d.name ?? null, subject: "Dostaliśmy Twój wniosek o konto trenera", reason: "z Twojego konta złożono wniosek o konto trenera",
      paragraphs: ["Dostaliśmy Twój wniosek o konto trenera.", "Odpowiadamy zwykle w ciągu 24 godzin. Dostaniesz od nas wiadomość z decyzją."],
      button: { label: "Otwórz aplikację", url: portalUrl() } }),
  },
  application_new: {
    id: "application_new", label: "Nowy wniosek o konto trenera (do właściciela)", audience: "właściciel", when: "Ktoś złożył wniosek o konto trenera.",
    sample: { name: "Anna Test", email: "anna@poczta.pl", note: "Prowadzę klientów od 3 lat." },
    build: (d) => ({ name: null, subject: "Nowy wniosek o konto trenera", reason: "jesteś właścicielem Optimatren",
      paragraphs: ["Nowy wniosek o konto trenera.", `Osoba: ${d.name ?? "(bez imienia)"}${d.email ? ` · ${d.email}` : ""}`, ...(d.note ? [`Notatka: ${d.note}`] : []), "Rozpatrz go w panelu administratora (zakładka „Wnioski”)."],
      button: { label: "Rozpatrz wniosek", url: panelUrl("/admin") } }),
  },
  application_accepted: {
    id: "application_accepted", label: "Wniosek zaakceptowany", audience: "wnioskodawca", when: "Właściciel zaakceptował wniosek.",
    sample: { name: "Anna" },
    build: (d) => ({ name: d.name ?? null, subject: "Twoje konto trenera jest aktywne", reason: "z Twojego konta złożono wniosek o konto trenera",
      paragraphs: ["Twoje konto trenera jest aktywne — zaloguj się tym samym kontem, a panel trenera będzie dostępny.", "Masz 14 dni okresu próbnego z pełnym dostępem."],
      button: { label: "Otwórz panel trenera", url: panelUrl("/") } }),
  },
  application_rejected: {
    id: "application_rejected", label: "Wniosek odrzucony", audience: "wnioskodawca", when: "Właściciel odrzucił wniosek.",
    sample: { name: "Anna" },
    build: (d) => ({ name: d.name ?? null, subject: "Wniosek o konto trenera", reason: "z Twojego konta złożono wniosek o konto trenera",
      paragraphs: ["Twój wniosek o konto trenera nie został przyjęty.", "Możesz złożyć nowy za 14 dni. Do tego czasu możesz korzystać z aplikacji samodzielnie."],
      button: { label: "Otwórz aplikację", url: portalUrl() } }),
  },
  trial_ending: {
    id: "trial_ending", label: "Okres próbny kończy się za 3 dni (do trenera)", audience: "trener", when: "3 dni przed końcem okresu próbnego.",
    sample: { name: "Marek", daysLeft: 3 },
    build: (d) => ({ name: d.name ?? null, subject: `Okres próbny kończy się za ${days(d.daysLeft ?? 3)}`, reason: "masz konto trenera w okresie próbnym",
      paragraphs: [`Twój okres próbny kończy się za ${days(d.daysLeft ?? 3)}.`, "Po nim konto przechodzi na plan Free. Twoi podopieczni i ich dane zostają — limit Free dotyczy tylko dodawania nowych rzeczy ponad limit."],
      button: { label: "Zobacz swój plan", url: panelUrl("/settings") } }),
  },
  trial_ended: {
    id: "trial_ended", label: "Okres próbny się skończył (do trenera)", audience: "trener", when: "W dniu końca okresu próbnego.",
    sample: { name: "Marek" },
    build: (d) => ({ name: d.name ?? null, subject: "Okres próbny się skończył", reason: "masz konto trenera",
      paragraphs: ["Twój okres próbny się skończył — konto działa teraz w planie Free.", "Twoi podopieczni, plany i historia treningów zostają bez zmian."],
      button: { label: "Zobacz swój plan", url: panelUrl("/settings") } }),
  },
  package_ending: {
    id: "package_ending", label: "Pakiet sesji się kończy (do trenera)", audience: "trener", when: "W pakiecie podopiecznego zostały 2 sesje lub mniej.",
    sample: { name: "Marek", personName: "Anna", sessionsLeft: 2 },
    build: (d) => ({ name: d.name ?? null, subject: "Pakiet sesji się kończy", reason: "prowadzisz podopiecznego z pakietem sesji",
      paragraphs: [`Podopieczny: ${d.personName ?? "(bez imienia)"}.`, `W pakiecie pozostało: ${sessions(d.sessionsLeft ?? 2)}.`, "Możesz zaproponować nowy pakiet."],
      button: { label: "Zobacz podopiecznego", url: panelUrl("/clients") } }),
  },
  pain_notice: {
    id: "pain_notice", label: "Nowe zgłoszenie (do trenera)", audience: "trener", when: "Podopieczny wysłał zgłoszenie „Coś boli?”. Mail NIE zawiera szczegółów zdrowotnych.",
    sample: { name: "Marek" },
    build: (d) => ({ name: d.name ?? null, subject: "Masz nowe zgłoszenie", reason: "prowadzisz podopiecznych",
      paragraphs: ["Masz nowe zgłoszenie od podopiecznego.", "Szczegóły zobaczysz w aplikacji."],
      button: { label: "Zobacz w aplikacji", url: panelUrl("/") } }),
  },
  owner_notice: {
    id: "owner_notice", label: "Strażnik / administrator (do właściciela)", audience: "właściciel", when: "Awaria usługi, powrót usługi, zdarzenie techniczne.",
    sample: { text: "API nie odpowiada od 10 minut (sprawdzenia: 2)." },
    build: (d) => ({ name: null, subject: "Optimatren: komunikat techniczny", reason: "jesteś właścicielem Optimatren",
      paragraphs: [d.text ?? "Komunikat techniczny."], button: { label: "Otwórz panel", url: panelUrl("/admin") } }),
  },
};

export const MAIL_IDS = Object.keys(MAIL_CATALOGUE) as MailId[];
export function buildMail(id: MailId, data: MailData) { return renderMail(MAIL_CATALOGUE[id].build(data)); }

/** Gotowy tekst dla trenera do skopiowania (SMS / Instagram) z kodem i linkiem. */
export function trainerCodeShareText(trainerName: string, code: string, link: string): string {
  return `Cześć! Ćwiczymy razem w aplikacji Optimatren. Wpisz mój kod ${code} albo wejdź w ten link: ${link}\n— ${trainerName}`;
}
