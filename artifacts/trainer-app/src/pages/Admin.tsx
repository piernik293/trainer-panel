/** Panel administratora (blok 3): Błędy · Wnioski · Trenerzy · Solo · Abonamenty i limity · Uwagi · Maile · Byczki · Dziennik dostępu. Tylko dla administratora z listy w .env. */
import { useState } from "react";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import {
  AUTO_ACCEPT_CONFIRM, BLOCK_CONFIRM, FEEDBACK_CATEGORY_LABEL, useAdminFeedback, useFeedbackRead, SOURCE_LABEL, useApplicationActions, useAutoAccept, useTrainerApplications, useAccessLog, useAdminAction, useAdminErrors, useAdminMails, useAdminMailPreview, useAdminMailTest, useAdminBulls, useBullActions, useAdminRoadmap, useRoadmapActions, useAdminSolo, useAdminSubscriptions, useAdminTrainers, useIsAdmin,
} from "@/lib/adminApi";
import { useAdminProposals, useProposalActions } from "@/lib/libraryApi";
import { useAdminAnimations, useAnimationActions } from "@/lib/animationsApi";
import { ExerciseAnimation } from "@workspace/design-tokens/brand";

type Tab = "errors" | "applications" | "trainers" | "solo" | "subs" | "feedback" | "mails" | "bulls" | "roadmap" | "proposals" | "animations" | "log";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "errors", label: "Błędy" }, { id: "applications", label: "Wnioski" }, { id: "trainers", label: "Trenerzy" }, { id: "solo", label: "Solo" },
  { id: "subs", label: "Abonamenty i limity" }, { id: "feedback", label: "Uwagi" }, { id: "mails", label: "Maile" }, { id: "bulls", label: "Byczki" }, { id: "roadmap", label: "Wkrótce" }, { id: "proposals", label: "Propozycje ćwiczeń" }, { id: "animations", label: "Animacje" }, { id: "log", label: "Dziennik dostępu" },
];
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "—");
/** Wnioskodawca: imię i e-mail (gdy znane), inaczej „(bez imienia)”. */
export const applicantLabel = (a: { name: string | null; email: string | null }) => [a.name, a.email].filter(Boolean).join(" · ") || "(bez imienia)";
const lim = (n: number | null) => (n === null ? "bez limitu" : String(n));

function Errors() {
  const [filter, setFilter] = useState<"new" | "reviewed" | "all">("new");
  const { data, isLoading } = useAdminErrors(filter);
  const { review } = useAdminAction();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["new", "reviewed", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "new" ? "Nowe" : f === "reviewed" ? "Przejrzane" : "Wszystkie"}</Button>
        ))}
      </div>
      {isLoading ? <div className="h-16 bg-muted animate-pulse rounded" /> : !data?.errors.length ? <p className="text-sm text-muted-foreground">Brak błędów.</p> : (
        <ul className="divide-y rounded-md border">
          {data.errors.map((e) => (
            <li key={e.id} className="p-3 space-y-1" data-testid="admin-error">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{SOURCE_LABEL[e.source]} · {e.place}</span>
                <span className="text-xs text-muted-foreground">{e.occurrences}× · {e.users} os. · ostatnio {fmt(e.lastSeen)}</span>
              </div>
              <p className="text-sm text-muted-foreground break-words">{e.message}</p>
              {e.status === "new" && <Button size="sm" variant="outline" onClick={() => review.mutate(e.id)}>Oznacz jako przejrzany</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Feedback() {
  const [filter, setFilter] = useState<"new" | "read" | "all">("new");
  const { data, isLoading, isError } = useAdminFeedback(filter, true);
  const read = useFeedbackRead();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["new", "read", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "new" ? "Nowe" : f === "read" ? "Przeczytane" : "Wszystkie"}</Button>
        ))}
      </div>
      {isLoading ? <div className="h-16 bg-muted animate-pulse rounded" /> : isError ? <p className="text-sm text-muted-foreground">Uwagi są wyłączone. Włącz je na serwerze (FEEDBACK_ENABLED=1).</p> : !data?.feedback.length ? <p className="text-sm text-muted-foreground">Brak uwag.</p> : (
        <ul className="divide-y rounded-md border">
          {data.feedback.map((f) => (
            <li key={f.id} className="p-3 space-y-1" data-testid="admin-feedback">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{FEEDBACK_CATEGORY_LABEL[f.category]} · {f.source === "panel" ? "Panel" : "Portal"} · {f.role}</span>
                <span className="text-xs text-muted-foreground">{fmt(f.createdAt)} · {f.page} · wersja {f.appVersion}</span>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{f.message}</p>
              {f.status === "new" && <Button size="sm" variant="outline" onClick={() => read.mutate(f.id)}>Oznacz jako przeczytane</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Applications() {
  const { toast } = useToast();
  const { data } = useTrainerApplications();
  const auto = useAutoAccept();
  const { decide, setAutoAccept } = useApplicationActions();
  const onErr = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  const pending = (data?.applications ?? []).filter((a) => a.status === "pending");
  const decided = (data?.applications ?? []).filter((a) => a.status !== "pending").slice(0, 10);
  const on = auto.data?.autoAccept ?? false;
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} aria-label="Przyjmuj wnioski automatycznie"
          onChange={() => { if (on || window.confirm(AUTO_ACCEPT_CONFIRM)) setAutoAccept.mutate(!on, { onError: onErr }); }} />
        Przyjmuj wnioski automatycznie {on ? "(włączone)" : "(wyłączone)"}
      </label>
      <div>
        <p className="text-sm font-medium mb-2">Oczekujące ({pending.length})</p>
        {pending.length === 0 ? <p className="text-sm text-muted-foreground">Brak wniosków.</p> : (
          <ul className="divide-y rounded-md border">
            {pending.map((a) => (
              <li key={a.id} className="p-3 space-y-1" data-testid="admin-application">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{applicantLabel(a)}</span>
                  <span className="text-xs text-muted-foreground">{fmt(a.createdAt)}</span>
                </div>
                {a.note && <p className="text-sm text-muted-foreground break-words">{a.note}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: a.id, accept: false }, { onError: onErr })}>Odrzuć</Button>
                  <Button size="sm" onClick={() => decide.mutate({ id: a.id, accept: true }, { onError: onErr })}>Akceptuj</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {decided.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {decided.map((a) => <li key={a.id}>{applicantLabel(a)} — {a.status === "accepted" ? "przyjęty" : "odrzucony"} {fmt(a.decidedAt)}</li>)}
        </ul>
      )}
    </div>
  );
}

function Trainers() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminTrainers();
  const { setPlan, block, extendTrial } = useAdminAction();
  if (isLoading || !data) return <div className="h-16 bg-muted animate-pulse rounded" />;
  const onErr = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {data.trainers.map((t) => (
          <li key={t.id} className="p-3 space-y-2" data-testid="admin-trainer">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t.label}{t.isAdmin ? " · administrator" : ""}{t.blocked ? " · zablokowane" : ""}</span>
              <span className="text-xs text-muted-foreground">{t.email ?? "brak e-maila"}</span>
            </div>
            <p className="text-xs text-muted-foreground">Podopieczni: {t.clients} · ostatnia aktywność: {fmt(t.lastActivity)} · założone: {fmt(t.createdAt)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs">Ustaw pakiet:
                <select className="ml-1 rounded border bg-background px-1 py-0.5 text-sm" value={t.planCode} aria-label={`Pakiet trenera ${t.id}`}
                  onChange={(e) => setPlan.mutate({ id: t.id, planCode: e.target.value }, { onError: onErr })}>
                  <option value="FREE">Free</option><option value="PRO">Pro</option><option value="UNLIMITED">Unlimited</option>
                </select>
              </label>
              <span className="text-xs text-muted-foreground" data-testid="admin-trial-end">
                Okres próbny do: {t.trialEndsAt ? fmt(t.trialEndsAt) : "—"}{t.trial?.state === "ended" ? " (minął)" : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => extendTrial.mutate(t.id, { onError: onErr })}>Przedłuż o 14 dni</Button>
              {!t.isAdmin && (
                <Button size="sm" variant="outline" className={t.blocked ? "" : "text-destructive"}
                  onClick={() => { if (t.blocked || window.confirm(BLOCK_CONFIRM)) block.mutate({ id: t.id, blocked: !t.blocked }, { onError: onErr }); }}>
                  {t.blocked ? "Odblokuj" : "Zablokuj konto"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{data.howToAddTrainer}</p>
    </div>
  );
}

function Solo() {
  const { data } = useAdminSolo();
  return (
    <div className="space-y-2">
      <p className="text-sm">Konta bez trenera: <b>{data?.total ?? "…"}</b></p>
      <ul className="divide-y rounded-md border">
        {(data?.accounts ?? []).map((a) => <li key={a.id} className="p-2 text-sm flex justify-between"><span>{a.firstName}</span><span className="text-xs text-muted-foreground">{fmt(a.createdAt)}</span></li>)}
      </ul>
    </div>
  );
}

function Subs() {
  const { data } = useAdminSubscriptions();
  if (!data) return <div className="h-16 bg-muted animate-pulse rounded" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {data.plans.map((p) => (
          <div key={p.code} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{p.name}{p.monthlyPricePln != null ? ` · ${p.monthlyPricePln} zł/mies.` : ""}</p>
            <p className="text-xs text-muted-foreground">Klienci: {lim(p.limits.clients)} · własne ćwiczenia: {lim(p.limits.customExercises)} · plany z generatora / mies.: {lim(p.limits.planGenerations)}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y rounded-md border">
        {data.usage.map((u) => (
          <li key={u.trainerId} className="p-3 text-sm">
            <span className="font-medium">{u.name ?? u.email ?? `Trener ${u.trainerId}`}</span> ({u.planCode}) — klienci {u.used.clients}/{lim(u.limits.clients)} · ćwiczenia {u.used.customExercises}/{lim(u.limits.customExercises)} · plany {u.used.planGenerations}/{lim(u.limits.planGenerations)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Log() {
  const { toast } = useToast();
  const { data } = useAccessLog();
  const { access } = useAdminAction();
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const submit = () => access.mutate({ clientId: Number(clientId), reason }, {
    onSuccess: (r) => setResult(r), onError: (e) => toast({ title: humanizeError(e), variant: "destructive" }),
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Szczegółowy wgląd w osobę</CardTitle>
          <CardDescription>Domyślnie nie widzisz danych zdrowotnych. Wgląd wymaga powodu i zostaje zapisany w dzienniku (nie da się go usunąć).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Numer osoby" inputMode="numeric" aria-label="Numer osoby" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód (co najmniej 10 znaków)" aria-label="Powód wglądu" maxLength={300} />
          <Button size="sm" disabled={!Number(clientId) || reason.trim().length < 10 || access.isPending} onClick={submit}>Pokaż dane</Button>
          {result && <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>}
        </CardContent>
      </Card>
      <ul className="divide-y rounded-md border">
        {(data?.entries ?? []).map((e) => (
          <li key={e.id} className="p-2 text-sm">
            <span className="text-xs text-muted-foreground">{fmt(e.at)} · admin …{e.admin}</span>
            <p>Osoba #{e.clientId} — {e.reason}</p>
          </li>
        ))}
        {data?.entries.length === 0 && <li className="p-2 text-sm text-muted-foreground">Brak wpisów.</li>}
      </ul>
    </div>
  );
}

/** „Maile”: lista szablonów, podgląd (z danymi przykładowymi) i „Wyślij test do mnie” na adres właściciela. */
function Mails() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminMails();
  const [open, setOpen] = useState<string | null>(null);
  const preview = useAdminMailPreview(open);
  const test = useAdminMailTest();
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  return (
    <div className="space-y-3">
      {data && !data.ownerAddressSet && <p className="text-sm text-muted-foreground">Ustaw OWNER_NOTIFY_EMAIL w .env, żeby wysyłać testy do siebie.</p>}
      <ul className="divide-y rounded-md border" data-testid="admin-mails">
        {(data?.mails ?? []).map((m) => (
          <li key={m.id} className="p-3 space-y-2" data-testid="admin-mail">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-medium">{m.label}</p><p className="text-xs text-muted-foreground">Do: {m.audience} · {m.when}</p></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? "Zwiń podgląd" : "Podgląd"}</Button>
                <Button size="sm" variant="outline" disabled={test.isPending || !data?.ownerAddressSet} onClick={() => test.mutate(m.id, {
                  onSuccess: () => toast({ title: "Test wysłany na Twój adres." }), onError: (e) => toast({ title: humanizeError(e), variant: "destructive" }),
                })}>Wyślij test do mnie</Button>
              </div>
            </div>
            {open === m.id && (preview.data
              ? <div className="space-y-2"><p className="text-sm"><b>Temat:</b> {preview.data.subject}</p><iframe title={`Podgląd: ${m.label}`} sandbox="" srcDoc={preview.data.html} className="h-[520px] w-full rounded border bg-white" /></div>
              : <div className="h-16 bg-muted animate-pulse rounded" />)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** „Animacje”: podgląd każdej animacji obok opisu i wskazówek, [Zatwierdź] / [Do poprawy] (z uwagą). W aplikacji widać wyłącznie zatwierdzone (flaga EXERCISE_ANIMATIONS_ENABLED). */
export function Animations() {
  const { toast } = useToast();
  const { data, isLoading, error } = useAdminAnimations();
  const { seed, approve, needsWork } = useAnimationActions();
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  const err = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  const label = { draft: "Szkic", review: "Do sprawdzenia", approved: "Zatwierdzona" } as const;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Oceniasz tu animacje przed włączeniem flagi (EXERCISE_ANIMATIONS_ENABLED); użytkownicy zobaczą wyłącznie zatwierdzone, i to dopiero po jej włączeniu.</p>{error ? <p className="text-sm text-destructive">Nie udało się wczytać animacji.</p> : null}
      <Button size="sm" variant="outline" disabled={seed.isPending} onClick={() => seed.mutate(undefined, { onSuccess: (r) => toast({ title: `Dodano: ${r.added.length}, pominięto: ${r.skipped.length}` }), onError: err })}>Wstaw animacje z biblioteki</Button>
      <ul className="space-y-3" data-testid="admin-animations">
        {(data?.items ?? []).map((a) => (
          <li key={a.exerciseId} className="space-y-2 rounded-md border p-3" data-testid="admin-animation">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{a.name}</span>
              <span className="text-xs text-muted-foreground">{label[a.status]}{a.approvedAt ? ` · ${fmt(a.approvedAt)}` : ""}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
              <ExerciseAnimation spec={a.spec} label={a.name} />
              <div className="space-y-1 text-sm">
                {a.description && <p>{a.description}</p>}
                {a.executionInstructions && <p className="text-muted-foreground"><b>Wykonanie:</b> {a.executionInstructions}</p>}
                {a.coachingTips && <p className="text-muted-foreground"><b>Wskazówki:</b> {a.coachingTips}</p>}
                {a.commonMistakes && <p className="text-muted-foreground"><b>Częste błędy:</b> {a.commonMistakes}</p>}
                {a.spec.note && <p className="text-xs text-muted-foreground">{a.spec.note}</p>}
                {a.problems.length > 0 && <p className="text-xs text-destructive" role="alert">Błędy danych: {a.problems.join("; ")}</p>}
                {a.reviewNote && <p className="text-xs text-amber-700">Uwaga do poprawy: {a.reviewNote}</p>}
                <p className="text-xs text-muted-foreground">Sprawdź: kolana w linii stóp, neutralne plecy, pełny zakres ruchu.</p>
              </div>
            </div>
            {noteFor === a.exerciseId ? (
              <div className="space-y-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Co poprawić?" aria-label="Uwaga do poprawy" maxLength={300} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setNoteFor(null); setNote(""); }}>Anuluj</Button>
                  <Button size="sm" disabled={note.trim().length < 3 || needsWork.isPending} onClick={() => needsWork.mutate({ id: a.exerciseId, note }, { onSuccess: () => { setNoteFor(null); setNote(""); toast({ title: "Oznaczono do poprawy" }); }, onError: err })}>Zapisz uwagę</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" disabled={approve.isPending || a.status === "approved" || a.problems.length > 0} onClick={() => approve.mutate(a.exerciseId, { onSuccess: () => toast({ title: "Zatwierdzono" }), onError: err })}>Zatwierdź</Button>
                <Button size="sm" variant="outline" onClick={() => setNoteFor(a.exerciseId)}>Do poprawy</Button>
              </div>
            )}
          </li>
        ))}
        {(data?.items ?? []).length === 0 && !error && <li className="text-sm text-muted-foreground">Brak animacji — użyj „Wstaw animacje z biblioteki”.</li>}
      </ul>
    </div>
  );
}

/** „Propozycje ćwiczeń”: ćwiczenia trenerów ze zgodą na wspólną bibliotekę — podgląd, ostrzeżenie o duplikatach, [Dodaj do wspólnej] (kopia „do weryfikacji”) / [Odrzuć] (z powodem). */
function Proposals() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminProposals();
  const { add, reject } = useProposalActions();
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  const err = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  const label: Record<string, string> = { proposed: "Do rozpatrzenia", added: "Dodane (kopia do weryfikacji)", rejected: "Odrzucone" };
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border" data-testid="admin-proposals">
        {(data?.items ?? []).map((p) => (
          <li key={p.id} className="space-y-2 p-3" data-testid="admin-proposal">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{p.name} · {p.author}</span>
              <span className="text-xs text-muted-foreground">{label[p.status]}{p.consentAt ? ` · zgoda ${fmt(p.consentAt)}` : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground">{[p.mainMuscleGroup, p.movementPattern, p.difficultyLevel, (p.equipment ?? []).join(", "), p.jointStress ? `stawy: ${p.jointStress}${p.jointStressAreas?.length ? ` (${p.jointStressAreas.join(", ")})` : ""}` : null].filter(Boolean).join(" · ")}</p>
            {p.description && <p className="text-sm">{p.description}</p>}
            {p.executionInstructions && <p className="text-xs text-muted-foreground">Wykonanie: {p.executionInstructions}</p>}
            {p.similar.length > 0 && <p className="text-sm text-amber-700" role="note" data-testid="proposal-similar">Podobne w katalogu: {p.similar.map((s) => s.name).join(", ")}</p>}
            {p.status === "rejected" && p.rejectReason && <p className="text-xs text-muted-foreground">Powód: {p.rejectReason}</p>}
            {p.status === "proposed" && (rejecting === p.id ? (
              <div className="space-y-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód odrzucenia (co najmniej 5 znaków)" aria-label="Powód odrzucenia" maxLength={300} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setRejecting(null); setReason(""); }}>Anuluj</Button>
                  <Button size="sm" disabled={reason.trim().length < 5 || reject.isPending} onClick={() => reject.mutate({ id: p.id, reason }, { onSuccess: () => { setRejecting(null); setReason(""); toast({ title: "Odrzucono" }); }, onError: err })}>Odrzuć</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" disabled={add.isPending} onClick={() => add.mutate(p.id, { onSuccess: () => toast({ title: "Dodano jako kopię do weryfikacji" }), onError: err })}>Dodaj do wspólnej</Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(p.id)}>Odrzuć</Button>
              </div>
            ))}
          </li>
        ))}
        {(data?.items ?? []).length === 0 && <li className="p-3 text-sm text-muted-foreground">Brak propozycji.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Kopia trafia do katalogu jako nieaktywna, „do weryfikacji” — nie jest używana w planach, dopóki nie przejdzie przeglądu katalogu. Oryginał zostaje u trenera.</p>
    </div>
  );
}

/** „Wkrótce”: pozycje karty z głosowaniem „Chcę to” — wyniki z podziałem trener/Solo/podopieczny, dodawanie, ukrywanie, „Gotowe”. */
function Roadmap() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminRoadmap();
  const { add, patch } = useRoadmapActions();
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  const err = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  return (
    <div className="space-y-4">
      {data && !data.enabled && <p className="text-sm text-muted-foreground">Karta „Wkrótce” jest wyłączona (ROADMAP_ENABLED w .env) — użytkownicy jej nie widzą.</p>}
      <ul className="divide-y rounded-md border" data-testid="admin-roadmap">
        {(data?.items ?? []).map((i) => (
          <li key={i.id} className="space-y-1 p-3" data-testid="admin-roadmap-item">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{i.title}{i.hidden ? " · ukryta" : ""}{i.status === "done" ? " · gotowe" : ""}</span>
              <span className="text-xs text-muted-foreground" data-testid="admin-roadmap-votes">Głosy: {i.votes.total} (trenerzy {i.votes.trener} · Solo {i.votes.solo} · podopieczni {i.votes.podopieczny})</span>
            </div>
            <p className="text-xs text-muted-foreground">{i.blurb}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: i.id, hidden: !i.hidden }, { onError: err })}>{i.hidden ? "Pokaż" : "Ukryj"}</Button>
              <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: i.id, status: i.status === "done" ? "soon" : "done" }, { onError: err })}>{i.status === "done" ? "Cofnij „Gotowe”" : "Oznacz „Gotowe”"}</Button>
            </div>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader><CardTitle className="text-base">Dodaj pozycję</CardTitle><CardDescription>Krótko, bez dat i obietnic.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nazwa (3–80 znaków)" aria-label="Nazwa pozycji" maxLength={80} />
          <Input value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Jedno zdanie opisu" aria-label="Opis pozycji" maxLength={200} />
          <Button size="sm" disabled={title.trim().length < 3 || blurb.trim().length < 3 || add.isPending} onClick={() => add.mutate({ title, blurb }, { onSuccess: () => { setTitle(""); setBlurb(""); toast({ title: "Dodano" }); }, onError: err })}>Dodaj</Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** „Byczki”: lista Złotych Byczków (kto, numer, kiedy), ręczne przyznanie i odebranie — zawsze z powodem. */
function Bulls() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminBulls();
  const { grant, revoke } = useBullActions();
  const [kind, setKind] = useState<"trainer" | "solo">("trainer");
  const [id, setId] = useState("");
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  const active = (k: string) => (data?.bulls ?? []).filter((b) => b.kind === k && !b.revoked).length;
  const err = (e: unknown) => toast({ title: humanizeError(e), variant: "destructive" });
  return (
    <div className="space-y-4">
      {data && !data.enabled && <p className="text-sm text-muted-foreground">Kampania jest wyłączona (GOLDEN_BULLS_ENABLED w .env) — odznaki nie są przyznawane automatycznie.</p>}
      <p className="text-sm" data-testid="bulls-counts">Trenerzy: {active("trainer")} z {data?.pools.trainer ?? 0} · Solo: {active("solo")} z {data?.pools.solo ?? 0}</p>
      <Card>
        <CardHeader><CardTitle className="text-base">Przyznaj ręcznie</CardTitle><CardDescription>Wpisz numer trenera (z listy „Trenerzy”) albo osoby Solo i powód. Konto testowe: najpierw odbierz odznakę z powodem.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2" role="radiogroup" aria-label="Rodzaj">
            {(["trainer", "solo"] as const).map((k) => <Button key={k} size="sm" role="radio" aria-checked={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "trainer" ? "Trener" : "Solo"}</Button>)}
          </div>
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="Numer konta" inputMode="numeric" aria-label="Numer konta" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód (co najmniej 5 znaków)" aria-label="Powód przyznania" maxLength={300} />
          <Button size="sm" disabled={!Number(id) || reason.trim().length < 5 || grant.isPending} onClick={() => grant.mutate({ kind, id: Number(id), reason }, { onSuccess: (r) => { toast({ title: `Przyznano: #${r.number}` }); setId(""); setReason(""); }, onError: err })}>Przyznaj</Button>
        </CardContent>
      </Card>
      <ul className="divide-y rounded-md border" data-testid="admin-bulls">
        {(data?.bulls ?? []).map((b) => (
          <li key={b.id} className="space-y-1 p-3" data-testid="admin-bull">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{b.kind === "trainer" ? "Trener" : "Solo"} #{b.number} · {b.who}{b.revoked ? " · odebrany" : ""}</span>
              <span className="text-xs text-muted-foreground">{fmt(b.grantedAt)} · {b.grantedBy}</span>
            </div>
            {b.reason && <p className="text-xs text-muted-foreground">Powód: {b.reason}</p>}
            {b.revoked && <p className="text-xs text-muted-foreground">Odebrany: {b.revokedReason}</p>}
            {!b.revoked && (revoking === b.id ? (
              <div className="flex flex-wrap gap-2">
                <Input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Powód odebrania" aria-label="Powód odebrania" maxLength={300} className="max-w-xs" />
                <Button size="sm" variant="outline" disabled={revokeReason.trim().length < 5 || revoke.isPending} onClick={() => revoke.mutate({ id: b.id, reason: revokeReason }, { onSuccess: () => { setRevoking(null); setRevokeReason(""); }, onError: err })}>Odbierz</Button>
                <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>Anuluj</Button>
              </div>
            ) : <Button size="sm" variant="outline" onClick={() => setRevoking(b.id)}>Odbierz…</Button>)}
          </li>
        ))}
        {data?.bulls.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nikt jeszcze nie dostał odznaki.</li>}
      </ul>
    </div>
  );
}

/** Etykieta karty z licznikiem nowych wniosków („Wnioski (2)”). */
export const tabLabel = (t: { id: Tab; label: string }, pendingApplications: number) => (t.id === "applications" && pendingApplications > 0 ? `${t.label} (${pendingApplications})` : t.label);

export default function Admin() {
  const { data, isLoading } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("errors");
  const [tabPicked, setTabPicked] = useState(false);
  const apps = useTrainerApplications();
  const pendingApplications = (apps.data?.applications ?? []).filter((a) => a.status === "pending").length;
  // Po wejściu od razu widać nowe wnioski: gdy są, zaczynamy od karty „Wnioski”, dopóki ktoś nie wybierze innej.
  const activeTab: Tab = !tabPicked && pendingApplications > 0 ? "applications" : tab;
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  if (!data?.isAdmin) return <Redirect to="/" />;
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Panel administratora</h1>
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => <Button key={t.id} role="tab" aria-selected={activeTab === t.id} size="sm" variant={activeTab === t.id ? "default" : "outline"} onClick={() => { setTabPicked(true); setTab(t.id); }}>{tabLabel(t, pendingApplications)}</Button>)}
      </div>
      {activeTab === "errors" && <Errors />}
      {activeTab === "applications" && <Applications />}
      {activeTab === "trainers" && <Trainers />}
      {activeTab === "solo" && <Solo />}
      {activeTab === "subs" && <Subs />}
      {activeTab === "feedback" && <Feedback />}
      {activeTab === "mails" && <Mails />}
      {activeTab === "bulls" && <Bulls />}
      {activeTab === "roadmap" && <Roadmap />}
      {activeTab === "proposals" && <Proposals />}
      {activeTab === "animations" && <Animations />}
      {activeTab === "log" && <Log />}
    </div>
  );
}
