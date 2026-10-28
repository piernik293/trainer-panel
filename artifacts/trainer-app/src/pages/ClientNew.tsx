import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { VALIDATION_MESSAGE, statusMessage, humanizeError } from "@/lib/userError";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateClient, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle, Copy, AlertCircle, Mail, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscriptionSummary } from "@/lib/use-subscription-summary";
import { toCreateClientPayload } from "@/lib/clientPayload";

const clientSchema = z.object({
  firstName: z.string().min(1, "Imię jest wymagane"),
  lastName: z.string().min(1, "Nazwisko jest wymagane"),
  email: z.string().email("Niepoprawny format email").optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional()
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface InviteResult {
  clientId: number;
  token: string;
  url: string;
  expiresAt: string;
  emailSent: boolean;
  emailError?: string;
  clientEmail?: string;
}

type CreationState =
  | { phase: "form" }
  | { phase: "result"; invite: InviteResult }
  | { phase: "invite-failed"; clientId: number; inviteError: string };

export default function ClientNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createClient = useCreateClient();
  const [state, setState] = useState<CreationState>({ phase: "form" });
  const [copied, setCopied] = useState(false);
  const { data: subscription } = useSubscriptionSummary();
  const clientLimitReached = subscription?.usage.clients.atLimit ?? false;

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", notes: "" }
  });

  // Mutation for creating the survey invite after client creation.
  const createInvite = useMutation({
    mutationFn: async ({ clientId }: { clientId: number }) => {
      const res = await fetch(`/api/clients/${clientId}/survey-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const serverMsg = (body as { error?: string }).error;
        throw new Error(serverMsg && res.status < 500 && !/HTTP \d{3}/.test(serverMsg) ? serverMsg : statusMessage(res.status));
      }
      return res.json() as Promise<{
        token: string; url: string; expiresAt: string;
        emailSent: boolean; emailError?: string;
      }>;
    },
  });

  // Mutation for resending the invite email.
  const resendInvite = useMutation({
    mutationFn: async ({ clientId }: { clientId: number }) => {
      const res = await fetch(`/api/clients/${clientId}/survey-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const serverMsg = (body as { error?: string }).error;
        throw new Error(serverMsg && res.status < 500 && !/HTTP \d{3}/.test(serverMsg) ? serverMsg : statusMessage(res.status));
      }
      return res.json() as Promise<{
        token: string; url: string; expiresAt: string;
        emailSent: boolean; emailError?: string;
      }>;
    },
  });

  const { toast } = useToast();
  const onInvalidSubmit = () => {
    // react-hook-form focuses the first invalid field automatically.
    toast({ title: VALIDATION_MESSAGE, variant: "destructive" });
  };

  const onSubmit = (data: ClientFormValues) => {
    createClient.mutate({ data: toCreateClientPayload(data) }, {
      onSuccess: async (newClient) => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        try {
          const invite = await createInvite.mutateAsync({ clientId: newClient.id });
          setState({
            phase: "result",
            invite: {
              clientId: newClient.id,
              token: invite.token,
              url: invite.url,
              expiresAt: invite.expiresAt,
              emailSent: invite.emailSent,
              emailError: invite.emailError,
              clientEmail: data.email || undefined,
            },
          });
        } catch (err) {
          setState({
            phase: "invite-failed",
            clientId: newClient.id,
            inviteError: humanizeError(err, "Nie udało się wysłać zaproszenia. Spróbuj ponownie."),
          });
        }
      },
    });
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — just select text
    }
  };

  const handleResend = async (clientId: number) => {
    try {
      const invite = await resendInvite.mutateAsync({ clientId });
      setState((prev) => {
        if (prev.phase !== "result") return prev;
        return {
          ...prev,
          invite: {
            ...prev.invite,
            token: invite.token,
            url: invite.url,
            expiresAt: invite.expiresAt,
            emailSent: invite.emailSent,
            emailError: invite.emailError,
          },
        };
      });
    } catch {
      // error shown via resendInvite.isError
    }
  };

  // ── Result screen ──────────────────────────────────────────────────────────

  if (state.phase === "result") {
    const { invite } = state;
    const emailFailed = !invite.emailSent && invite.clientEmail;
    const noEmail = !invite.clientEmail;

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <Link href="/clients" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft size={16} />
          Powrót do listy
        </Link>

        <div className="flex items-center gap-3">
          <CheckCircle className="text-green-600" size={28} />
          <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
            Klient dodany
          </h1>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6 space-y-5">
            {/* Case A — success + email sent */}
            {invite.emailSent && invite.clientEmail && (
              <Alert className="border-green-200 bg-green-50">
                <Mail className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Klient został dodany, a link do wywiadu wysłano na adres:{" "}
                  <strong>{invite.clientEmail}</strong>
                </AlertDescription>
              </Alert>
            )}

            {/* Case B — client + invite OK, email failed */}
            {emailFailed && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  Klient został dodany, ale nie udało się wysłać wiadomości e-mail.
                  {invite.emailError && (
                    <span className="block text-xs mt-1 opacity-70">
                      Powód: {invite.emailError}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Case C — no email provided */}
            {noEmail && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-blue-800">
                  Klient został dodany. Skopiuj link do wywiadu i wyślij go klientowi samodzielnie.
                </AlertDescription>
              </Alert>
            )}

            {/* Survey link */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Link do wywiadu</p>
              <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border/50">
                <code className="flex-1 text-xs text-muted-foreground break-all">{invite.url}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Link jest jednorazowy. Wygasa:{" "}
                {new Date(invite.expiresAt).toLocaleDateString("pl-PL", {
                  day: "numeric", month: "long", year: "numeric"
                })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="default"
                onClick={() => handleCopy(invite.url)}
                className="gap-2"
              >
                <Copy size={16} />
                {copied ? "Skopiowano!" : "Skopiuj link"}
              </Button>

              {(emailFailed || noEmail) && invite.clientEmail && (
                <Button
                  variant="outline"
                  onClick={() => handleResend(invite.clientId)}
                  disabled={resendInvite.isPending}
                  className="gap-2"
                >
                  <RefreshCw size={16} className={resendInvite.isPending ? "animate-spin" : ""} />
                  {resendInvite.isPending ? "Wysyłanie…" : "Wyślij ponownie"}
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setLocation(`/clients/${invite.clientId}`)}
                className="gap-2"
              >
                <ExternalLink size={16} />
                Przejdź do klienta
              </Button>
            </div>

            {resendInvite.isError && (
              <p className="text-sm text-destructive">
                Nie udało się wysłać ponownie:{" "}
                {humanizeError(resendInvite.error, "Nie udało się wysłać zaproszenia. Spróbuj ponownie.")}
              </p>
            )}
            {resendInvite.isSuccess && !resendInvite.isPending && (
              <p className="text-sm text-green-600">Email wysłany ponownie.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Invite-failed screen ───────────────────────────────────────────────────

  if (state.phase === "invite-failed") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <Link href="/clients" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft size={16} />
          Powrót do listy
        </Link>

        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Klient został dodany, ale nie udało się utworzyć linku do wywiadu.
            <span className="block text-xs mt-1 opacity-70">{state.inviteError}</span>
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              resendInvite.mutate({ clientId: state.clientId }, {
                onSuccess: (invite) => {
                  setState({
                    phase: "result",
                    invite: {
                      clientId: state.clientId,
                      token: invite.token,
                      url: invite.url,
                      expiresAt: invite.expiresAt,
                      emailSent: invite.emailSent,
                      emailError: invite.emailError,
                    },
                  });
                },
              });
            }}
            disabled={resendInvite.isPending}
            className="gap-2"
          >
            <RefreshCw size={16} className={resendInvite.isPending ? "animate-spin" : ""} />
            {resendInvite.isPending ? "Próbuję…" : "Spróbuj ponownie"}
          </Button>

          <Button variant="outline" onClick={() => setLocation(`/clients/${state.clientId}`)}>
            <ExternalLink size={16} className="mr-2" />
            Przejdź do klienta
          </Button>
        </div>
      </div>
    );
  }

  // ── Form screen ────────────────────────────────────────────────────────────

  const isSaving = createClient.isPending || createInvite.isPending;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <Link href="/clients" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft size={16} />
        Powrót do listy
      </Link>

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          Nowy Klient
        </h1>
        <p className="text-muted-foreground mt-1">
          Dodaj dane kontaktowe — wyślemy klientowi link do wywiadu treningowego.
        </p>
      </div>

      {clientLimitReached && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Wykorzystano {subscription?.usage.clients.used}/{subscription?.usage.clients.limit} miejsc
            na klientów w planie {subscription?.plan.name}. Usuń nieużywanego klienta albo wybierz
            wyższy plan, aby dodać kolejną osobę.
          </AlertDescription>
        </Alert>
      )}

      {createClient.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {humanizeError(createClient.error, "Nie udało się dodać klienta. Spróbuj ponownie.")}
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle>Dane kontaktowe</CardTitle>
          <CardDescription>Te dane nie są widoczne dla klienta.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imię *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nazwisko *</FormLabel>
                      <FormControl>
                        <Input placeholder="Kowalski" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jan@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input placeholder="+48 000 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wewnętrzne notatki trenera</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Skąd jest ten klient? Jakie są ustalenia finansowe?"
                        className="min-h-[120px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setLocation("/clients")} disabled={isSaving}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Zapisywanie…" : "Zapisz Klienta"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
