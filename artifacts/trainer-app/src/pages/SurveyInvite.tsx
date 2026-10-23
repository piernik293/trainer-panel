import { useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { ArrowLeft, Check, Copy, Loader2, Mail, MoreHorizontal, Share2, Link2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { ErrorState } from "@/components/ErrorState";
import { StepHint } from "@/components/dashboard/StepHint";
import { getInitials } from "@/components/layout/AccountMenu";
import { humanizeError } from "@/lib/userError";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAME_MAX = 80;
const MESSAGE_MAX = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ApiError = Error & { status?: number; data?: Record<string, unknown> };

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as Record<string, unknown>;
    throw Object.assign(new Error((body.error as string | undefined) ?? res.statusText), {
      status: res.status,
      data: body,
    }) as ApiError;
  }
  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export type InviteStatus = "sent" | "opened" | "completed" | "expired" | "revoked";

export interface Invite {
  id: number;
  clientName: string | null;
  intendedEmail: string | null;
  channel: "email" | "link";
  status: InviteStatus;
  clientId: number | null;
  expiresAt: string;
  createdAt: string;
  lastSentAt: string | null;
  openedAt: string | null;
}

interface EmailOutcome {
  requested: boolean;
  sent: boolean;
  code?: string;
  message?: string;
}

interface CreatedInvite {
  id: number;
  token: string;
  clientName: string | null;
  intendedEmail: string | null;
  email: EmailOutcome;
}

interface Duplicate {
  clientName: string | null;
  createdAt: string;
  sendEmail: boolean;
}

// Status is always a text pill; colour only reinforces it.
export const STATUS_LABEL: Record<InviteStatus, string> = {
  sent: "Wysłane",
  opened: "Otwarte",
  completed: "Wypełniony",
  expired: "Wygasło",
  revoked: "Odwołane",
};
const STATUS_CLASS: Record<InviteStatus, string> = {
  sent: "bg-muted text-foreground",
  opened: "bg-brand-soft text-primary",
  completed: "bg-success-soft text-success",
  expired: "bg-warning-soft text-warning",
  revoked: "bg-muted text-muted-foreground",
};

function buildInviteUrl(token: string): string {
  return `${window.location.origin}/client-landing/survey/${token}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// ─── Result: one message replaces the old two boxes ─────────────────────────

function InviteResult({ name, token, email }: { name: string; token: string; email: EmailOutcome }) {
  const [copied, setCopied] = useState(false);
  const url = buildInviteUrl(token);
  const sent = email.requested && email.sent;
  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div role="status" className="space-y-3 rounded-lg border border-success/30 bg-success-soft p-4" data-testid="invite-result">
      <p className="flex items-center gap-2 font-semibold text-success">
        <Check className="h-4 w-4" aria-hidden="true" />
        {sent ? `Zaproszenie wysłane do ${name}` : `Link gotowy dla ${name}`}
      </p>
      {email.requested && !email.sent && (
        <p className="text-sm text-warning" data-testid="email-not-sent">
          {email.message ?? "Nie udało się wysłać e-maila."}
        </p>
      )}
      <p className="text-sm text-foreground">Wolisz Messengera albo WhatsAppa? Wyślij ten sam link:</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copy} data-testid="copy-link">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Skopiowano" : "Kopiuj link"}
        </Button>
        {canShare() && (
          <Button
            variant="outline"
            onClick={() => void navigator.share({ title: "Wywiad treningowy", text: `Cześć ${name}, oto link do wywiadu treningowego:`, url }).catch(() => {})}
          >
            <Share2 className="h-4 w-4" />
            Udostępnij…
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Live e-mail preview ─────────────────────────────────────────────────────

function EmailPreview({ trainerName, clientName, message }: { trainerName: string; clientName: string; message: string }) {
  const expiry = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Card className="border-border/50" data-testid="email-preview">
      <CardHeader className="pb-2">
        <p className="section-label">Tak zobaczy to klient</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 rounded-lg border border-border bg-background p-4 text-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted font-bold" aria-hidden="true">
              {getInitials(trainerName)}
            </span>
            <div>
              <p className="font-bold">{trainerName}</p>
              <p className="text-muted-foreground">Trener personalny</p>
            </div>
          </div>
          <p className="font-bold">Cześć {clientName.trim() || "…"},</p>
          {message.trim() && (
            <p className="whitespace-pre-line border-l-[3px] border-primary pl-3" data-testid="preview-message">
              {message.trim()}
            </p>
          )}
          <p>
            Zapraszam Cię do wypełnienia wywiadu treningowego. Na podstawie Twoich odpowiedzi przygotuję plan
            dopasowany do Ciebie. Wypełnienie zajmuje zwykle kilka minut.
          </p>
          <span className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 font-bold text-primary-foreground" aria-hidden="true">
            Wypełnij wywiad
          </span>
          <p className="text-muted-foreground">Link jest jednorazowy i ważny do {expiry}.</p>
          <p className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-[11px] font-extrabold text-primary-foreground" aria-hidden="true">
              O
            </span>
            Wysłano przez Optimatren
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SurveyInvite() {
  const { toast } = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const trainerName = user?.fullName ?? user?.firstName ?? "Twój trener";

  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [result, setResult] = useState<{ name: string; token: string; email: EmailOutcome } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);

  const trimmedName = clientName.trim();
  const trimmedEmail = email.trim();
  const nameError = touched && !trimmedName ? "Podaj imię klienta." : null;
  const emailError = trimmedEmail && !EMAIL_RE.test(trimmedEmail) ? "Sprawdź adres e-mail." : null;
  const canEmail = !!trimmedName && !!trimmedEmail && !emailError;

  const { data: invites = [], isLoading, isError, error, refetch } = useQuery<Invite[]>({
    queryKey: ["survey-invites"],
    queryFn: () => fetchJson<Invite[]>("/survey-invites"),
  });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["survey-invites"] });

  const createMutation = useMutation({
    mutationFn: (v: { sendEmail: boolean; replaceExisting?: boolean; name?: string; email?: string | null; message?: string | null }) =>
      fetchJson<CreatedInvite>("/survey-invites", {
        method: "POST",
        body: JSON.stringify({
          clientName: v.name ?? trimmedName,
          intendedEmail: v.email !== undefined ? v.email : trimmedEmail || null,
          trainerMessage: v.message !== undefined ? v.message : message.trim() || null,
          sendEmail: v.sendEmail,
          replaceExisting: v.replaceExisting ?? false,
          trainerName,
        }),
      }),
    onSuccess: (invite) => {
      setDuplicate(null);
      setResult({ name: invite.clientName ?? trimmedName, token: invite.token, email: invite.email });
      setClientName("");
      setEmail("");
      setMessage("");
      setTouched(false);
      refreshList();
    },
    onError: (err: ApiError, v) => {
      if (err.status === 409 && err.data?.code === "DUPLICATE_ACTIVE_INVITE") {
        const existing = err.data.existing as { clientName: string | null; createdAt: string };
        setDuplicate({ clientName: existing.clientName, createdAt: existing.createdAt, sendEmail: v.sendEmail });
        return;
      }
      toast({ title: humanizeError(err), variant: "destructive" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ invite, action }: { invite: Invite; action: "resend" | "remind" }) =>
      fetchJson<{ token: string; email: EmailOutcome }>(`/survey-invites/${invite.id}/${action}`, { method: "POST" }),
    onSuccess: (res, { invite, action }) => {
      refreshList();
      const name = invite.clientName ?? invite.intendedEmail ?? "klienta";
      if (res.email.sent) {
        toast({ title: action === "remind" ? `Wysłano przypomnienie do ${name}` : `Wysłano ponownie do ${name}` });
      } else {
        setResult({ name, token: res.token, email: res.email });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    onError: (err: ApiError) => {
      const msg = (err.data?.error as string | undefined) ?? humanizeError(err);
      toast({ title: msg, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => fetchJson(`/survey-invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshList();
      toast({ title: "Zaproszenie odwołane" });
    },
    onError: (err) => toast({ title: humanizeError(err), variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => fetchJson(`/survey-invites/${id}/archive`, { method: "PATCH" }),
    onSuccess: refreshList,
    onError: (err) => toast({ title: humanizeError(err), variant: "destructive" }),
  });

  const submit = (sendEmail: boolean) => {
    setTouched(true);
    if (!trimmedName || emailError || (sendEmail && !canEmail)) return;
    setResult(null);
    createMutation.mutate({ sendEmail });
  };

  const sendNewFor = (invite: Invite) => {
    setResult(null);
    createMutation.mutate({
      sendEmail: invite.channel === "email" && !!invite.intendedEmail,
      name: invite.clientName ?? "",
      email: invite.intendedEmail,
      message: null,
    });
  };

  const busy = createMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-2">
        <Link href="/clients" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" />
          Klienci
        </Link>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Zaproś klienta</h1>
        <p className="text-muted-foreground">
          Klient dostanie link do wywiadu. Po wypełnieniu zobaczysz jego odpowiedzi i przygotujesz plan.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        {/* ── New invitation ─────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Nowe zaproszenie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StepHint step={2}>
              Wpisz imię klienta i jego e-mail, a potem kliknij „Wyślij e-mailem” albo „Utwórz link do skopiowania”.
            </StepHint>

            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Imię klienta</Label>
              <Input
                id="invite-name"
                value={clientName}
                maxLength={NAME_MAX}
                onChange={(e) => setClientName(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "invite-name-error" : undefined}
                placeholder="np. Marta"
                autoComplete="off"
              />
              {nameError && <p id="invite-name-error" className="text-sm text-danger">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail (opcjonalnie)</Label>
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "invite-email-error" : undefined}
                placeholder="marta@example.com"
                autoComplete="off"
              />
              {emailError && <p id="invite-email-error" className="text-sm text-danger">{emailError}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="invite-message">Wiadomość dla klienta (opcjonalnie)</Label>
                <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="message-counter">
                  {message.length}/{MESSAGE_MAX}
                </span>
              </div>
              <Textarea
                id="invite-message"
                value={message}
                maxLength={MESSAGE_MAX}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="np. Cieszę się, że zaczynamy! Wypełnij wywiad przed naszym pierwszym spotkaniem."
                className="min-h-[96px]"
              />
            </div>

            {duplicate && (
              <div role="alert" className="space-y-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning" data-testid="duplicate-warning">
                <p className="font-semibold">
                  {(duplicate.clientName ?? "Ten klient")} ma już aktywne zaproszenie z {formatDate(duplicate.createdAt)}. Wysłać nowe?
                  Poprzednie zostanie odwołane.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => createMutation.mutate({ sendEmail: duplicate.sendEmail, replaceExisting: true })} disabled={busy}>
                    Wyślij nowe
                  </Button>
                  <Button variant="outline" onClick={() => setDuplicate(null)}>
                    Anuluj
                  </Button>
                </div>
              </div>
            )}

            {!duplicate && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => submit(true)} disabled={busy || !canEmail} data-testid="send-invite-email">
                  {busy && createMutation.variables?.sendEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Wyślij e-mailem
                </Button>
                <Button variant="outline" onClick={() => submit(false)} disabled={busy} data-testid="create-link">
                  {busy && !createMutation.variables?.sendEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Utwórz link do skopiowania
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Link jest jednorazowy i ważny 7 dni.</p>

            {result && <InviteResult name={result.name} token={result.token} email={result.email} />}
          </CardContent>
        </Card>

        <EmailPreview trainerName={trainerName} clientName={clientName} message={message} />
      </div>

      {/* ── Sent invitations ───────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-lg">Wysłane zaproszenia</CardTitle>
          <p className="text-sm text-muted-foreground">Ostatnie 30 dni.</p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6">
              <ErrorState title="Nie udało się wczytać zaproszeń" message={humanizeError(error)} onRetry={() => void refetch()} />
            </div>
          ) : invites.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Brak zaproszeń z ostatnich 30 dni.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="invite-list">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">Klient</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Wysłane</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <InviteRow
                      key={inv.id}
                      invite={inv}
                      busy={actionMutation.isPending || createMutation.isPending}
                      onResend={() => actionMutation.mutate({ invite: inv, action: "resend" })}
                      onRemind={() => actionMutation.mutate({ invite: inv, action: "remind" })}
                      onSendNew={() => sendNewFor(inv)}
                      onRevoke={() => setRevokeTarget(inv)}
                      onArchive={() => archiveMutation.mutate(inv.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odwołać zaproszenie?</AlertDialogTitle>
            <AlertDialogDescription>
              Link dla {revokeTarget?.clientName ?? revokeTarget?.intendedEmail ?? "klienta"} przestanie działać. Zaproszenie zostanie na
              liście jako „Odwołane”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:opacity-90"
              onClick={() => {
                if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
                setRevokeTarget(null);
              }}
            >
              Odwołaj
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InviteRow({
  invite,
  busy,
  onResend,
  onRemind,
  onSendNew,
  onRevoke,
  onArchive,
}: {
  invite: Invite;
  busy: boolean;
  onResend: () => void;
  onRemind: () => void;
  onSendNew: () => void;
  onRevoke: () => void;
  onArchive: () => void;
}) {
  const name = invite.clientName ?? invite.intendedEmail ?? "Bez imienia";
  const channel = invite.channel === "email" && invite.intendedEmail ? `e-mail · ${invite.intendedEmail}` : "link";
  const active = invite.status === "sent" || invite.status === "opened";
  const byEmail = invite.channel === "email" && !!invite.intendedEmail;

  let primary: React.ReactNode = null;
  if (invite.status === "sent") {
    primary = (
      <Button size="sm" variant="outline" onClick={onResend} disabled={busy}>
        {byEmail ? "Wyślij ponownie" : "Nowy link"}
      </Button>
    );
  } else if (invite.status === "opened") {
    primary = (
      <Button size="sm" variant="outline" onClick={byEmail ? onRemind : onResend} disabled={busy}>
        {byEmail ? "Przypomnij" : "Nowy link"}
      </Button>
    );
  } else if (invite.status === "completed" && invite.clientId) {
    primary = (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/clients/${invite.clientId}`}>Zobacz odpowiedzi</Link>
      </Button>
    );
  } else if (invite.status === "expired") {
    primary = (
      <Button size="sm" variant="outline" onClick={onSendNew} disabled={busy}>
        Wyślij nowe
      </Button>
    );
  }

  return (
    <tr className="border-b border-border last:border-0" data-testid="invite-row">
      <td className="px-4 py-3">
        <p className="font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{channel}</p>
      </td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold", STATUS_CLASS[invite.status])}>
          {STATUS_LABEL[invite.status]}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(invite.lastSentAt ?? invite.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {primary}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`Więcej akcji — ${name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {active ? (
                <DropdownMenuItem onSelect={onRevoke} className="text-danger focus:text-danger">
                  Odwołaj
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onArchive}>Usuń z widoku</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
