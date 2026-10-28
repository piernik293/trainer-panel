/** Panel administratora (blok 3): Błędy · Trenerzy · Solo · Abonamenty i limity · Dziennik dostępu. Tylko dla administratora z listy w .env. */
import { useState } from "react";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/userError";
import {
  AUTO_ACCEPT_CONFIRM, BLOCK_CONFIRM, SOURCE_LABEL, useApplicationActions, useAutoAccept, useTrainerApplications, useAccessLog, useAdminAction, useAdminErrors, useAdminSolo, useAdminSubscriptions, useAdminTrainers, useIsAdmin,
} from "@/lib/adminApi";

type Tab = "errors" | "applications" | "trainers" | "solo" | "subs" | "log";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "errors", label: "Błędy" }, { id: "applications", label: "Wnioski" }, { id: "trainers", label: "Trenerzy" }, { id: "solo", label: "Solo" },
  { id: "subs", label: "Abonamenty i limity" }, { id: "log", label: "Dziennik dostępu" },
];
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "—");
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
                  <span className="text-sm font-medium">{a.name ?? "(bez imienia)"}</span>
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
          {decided.map((a) => <li key={a.id}>{a.name ?? "(bez imienia)"} — {a.status === "accepted" ? "przyjęty" : "odrzucony"} {fmt(a.decidedAt)}</li>)}
        </ul>
      )}
    </div>
  );
}

function Trainers() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminTrainers();
  const { setPlan, block } = useAdminAction();
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
              <label className="text-xs">Pakiet:
                <select className="ml-1 rounded border bg-background px-1 py-0.5 text-sm" value={t.planCode} aria-label={`Pakiet trenera ${t.id}`}
                  onChange={(e) => setPlan.mutate({ id: t.id, planCode: e.target.value }, { onError: onErr })}>
                  <option value="FREE">Free</option><option value="PRO">Pro</option><option value="UNLIMITED">Unlimited</option>
                </select>
              </label>
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

export default function Admin() {
  const { data, isLoading } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("errors");
  if (isLoading) return <div className="h-16 bg-muted animate-pulse rounded" />;
  if (!data?.isAdmin) return <Redirect to="/" />;
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Panel administratora</h1>
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => <Button key={t.id} role="tab" aria-selected={tab === t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>{t.label}</Button>)}
      </div>
      {tab === "errors" && <Errors />}
      {tab === "applications" && <Applications />}
      {tab === "trainers" && <Trainers />}
      {tab === "solo" && <Solo />}
      {tab === "subs" && <Subs />}
      {tab === "log" && <Log />}
    </div>
  );
}
