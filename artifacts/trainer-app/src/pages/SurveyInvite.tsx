import { useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import {
  ArrowLeft, Copy, Check, Link2, Plus, Loader2, Mail, ChevronDown, ChevronUp, Archive,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import { humanizeError } from "@/lib/userError";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((body as { error?: string }).error ?? res.statusText), {
      status: res.status,
    });
  }
  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

interface Invite {
  id: number;
  intendedEmail: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface CreatedInvite extends Invite {
  token: string;
  email?: { requested: boolean; sent: boolean; code?: string; message?: string };
}

function inviteStatus(invite: Invite): "used" | "revoked" | "expired" | "active" {
  if (invite.usedAt) return "used";
  if (invite.revokedAt) return "revoked";
  if (new Date(invite.expiresAt) < new Date()) return "expired";
  return "active";
}

const STATUS_LABEL: Record<string, string> = {
  used: "Użyte",
  revoked: "Odwołane",
  expired: "Wygasłe",
  active: "Aktywne",
};
const STATUS_CLASS: Record<string, string> = {
  used:    "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-600",
  expired: "bg-yellow-100 text-yellow-700",
  active:  "bg-green-100 text-green-700",
};

function buildInviteUrl(token: string): string {
  return `${window.location.origin}/client-landing/survey/${token}`;
}

const HISTORY_INITIAL_COUNT = 3;

export default function SurveyInvite() {
  const { toast } = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [intendedEmail, setIntendedEmail] = useState("");
  const [lastCreated, setLastCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data: invites = [], isLoading, isError, error, refetch } = useQuery<Invite[]>({
    queryKey: ["survey-invites"],
    queryFn: () => fetchJson<Invite[]>("/survey-invites"),
  });

  const createMutation = useMutation({
    mutationFn: (sendEmail: boolean) =>
      fetchJson<CreatedInvite>("/survey-invites", {
        method: "POST",
        body: JSON.stringify({
          intendedEmail: intendedEmail.trim() || null,
          sendEmail,
          trainerName: user?.fullName ?? user?.firstName ?? null,
        }),
      }),
    onSuccess: (invite) => {
      setLastCreated(invite);
      setIntendedEmail("");
      queryClient.invalidateQueries({ queryKey: ["survey-invites"] });
    },
    onError: (err) => {
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/survey-invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-invites"] });
      toast({ title: "Zaproszenie odwołane" });
    },
    onError: (err) => {
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/survey-invites/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-invites"] });
    },
    onError: (err) => {
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Split into active vs history
  const activeInvites  = invites.filter((inv) => inviteStatus(inv) === "active");
  const historyInvites = invites.filter((inv) => inviteStatus(inv) !== "active");
  const visibleHistory = historyExpanded
    ? historyInvites
    : historyInvites.slice(0, HISTORY_INITIAL_COUNT);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <Link
        href="/clients"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={16} />
        Powrót do listy klientów
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Zaproś klienta
        </h1>
        <p className="text-muted-foreground mt-1">
          Wygeneruj jednorazowy link zaproszeniowy do wywiadu treningowego.
          Link jest ważny przez 7 dni i może zostać użyty tylko raz.
        </p>
      </div>

      {/* ── Generate section ─────────────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus size={16} />
            Nowe zaproszenie
          </CardTitle>
          <CardDescription>
            Opcjonalnie podaj adres e-mail klienta — zostanie wstępnie wypełniony w formularzu. Z adresem możesz też wysłać zaproszenie e-mailem; link zawsze pozostaje do skopiowania.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="email-hint" className="flex items-center gap-1.5">
                <Mail size={13} />
                E-mail klienta (opcjonalnie)
              </Label>
              <Input
                id="email-hint"
                type="email"
                placeholder="jan.kowalski@example.com"
                value={intendedEmail}
                onChange={(e) => setIntendedEmail(e.target.value)}
              />
            </div>
            <Button
              onClick={() => createMutation.mutate(false)}
              disabled={createMutation.isPending}
              variant={intendedEmail.trim() ? "outline" : "default"}
              className="gap-2 min-h-11"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link2 size={14} />
              )}
              Wygeneruj link
            </Button>
            {intendedEmail.trim() && (
              <Button
                onClick={() => createMutation.mutate(true)}
                disabled={createMutation.isPending}
                className="gap-2 min-h-11"
                data-testid="send-invite-email"
              >
                <Mail size={14} />
                Wyślij e-mailem
              </Button>
            )}
          </div>

          {lastCreated?.email?.requested && (
            lastCreated.email.sent ? (
              <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900" data-testid="email-sent">
                Wysłano zaproszenie na adres {lastCreated.intendedEmail}.
              </p>
            ) : (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="email-not-sent">
                {lastCreated.email.message ?? "Nie udało się wysłać e-maila."}
              </p>
            )
          )}

          {lastCreated && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">
                Link zaproszeniowy gotowy — skopiuj go teraz, nie będzie wyświetlany ponownie.
              </p>
              <div className="flex gap-2 items-center">
                <Input
                  readOnly
                  value={buildInviteUrl(lastCreated.token)}
                  className="font-mono text-xs bg-white"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(buildInviteUrl(lastCreated.token))}
                  className="gap-1.5 shrink-0"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Skopiowano" : "Kopiuj"}
                </Button>
              </div>
              <p className="text-xs text-green-700">
                Wygasa: {new Date(lastCreated.expiresAt).toLocaleDateString("pl-PL")}
                {lastCreated.intendedEmail && ` · ${lastCreated.intendedEmail}`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Active invitations ───────────────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle className="text-base">Aktywne zaproszenia</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6">
              <ErrorState
                title="Nie udało się wczytać zaproszeń"
                message={humanizeError(error)}
                onRetry={() => void refetch()}
              />
            </div>
          ) : activeInvites.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Brak aktywnych zaproszeń.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {activeInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS.active}`}>
                        {STATUS_LABEL.active}
                      </span>
                      <span className="text-sm text-foreground">
                        {invite.intendedEmail ?? (
                          <span className="text-muted-foreground italic">Bez podanego e-maila</span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Utworzono: {new Date(invite.createdAt).toLocaleDateString("pl-PL")}
                      {" · "}
                      Wygasa: {new Date(invite.expiresAt).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive text-xs"
                    onClick={() => revokeMutation.mutate(invite.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Odwołaj
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── History ──────────────────────────────────────────────────── */}
      {(historyInvites.length > 0 || isLoading) && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle className="text-base">Historia zaproszeń</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <>
                <div className="divide-y divide-border/50">
                  {visibleHistory.map((invite) => {
                    const status = inviteStatus(invite);
                    return (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[status]}`}>
                              {STATUS_LABEL[status]}
                            </span>
                            <span className="text-sm text-foreground">
                              {invite.intendedEmail ?? (
                                <span className="text-muted-foreground italic">Bez podanego e-maila</span>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Utworzono: {new Date(invite.createdAt).toLocaleDateString("pl-PL")}
                            {invite.usedAt && ` · Użyto: ${new Date(invite.usedAt).toLocaleDateString("pl-PL")}`}
                            {invite.revokedAt && ` · Odwołano: ${new Date(invite.revokedAt).toLocaleDateString("pl-PL")}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground text-xs gap-1.5"
                          onClick={() => archiveMutation.mutate(invite.id)}
                          disabled={archiveMutation.isPending}
                        >
                          <Archive size={13} />
                          Usuń z widoku
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Expand / collapse */}
                {historyInvites.length > HISTORY_INITIAL_COUNT && (
                  <div className="border-t border-border/50 px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground gap-1.5 w-full justify-center"
                      onClick={() => setHistoryExpanded((v) => !v)}
                    >
                      {historyExpanded ? (
                        <>
                          <ChevronUp size={13} />
                          Pokaż mniej
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} />
                          Pokaż wszystkie ({historyInvites.length})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
