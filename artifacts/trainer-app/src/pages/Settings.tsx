import { useEffect } from "react";
import { useUser, useClerk } from "@clerk/react";
import { UserCog, LogOut, User, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/components/layout/AccountMenu";
import { SubscriptionSummary } from "@/components/subscription/SubscriptionSummary";
import { ThemeSelect } from "@/components/ThemeSelect";

export default function Settings() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();

  // Links like /settings#plan-i-limity: the router does not scroll to anchors itself.
  useEffect(() => {
    if (isLoaded && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-40 rounded" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24 rounded" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fullName = user?.fullName ?? user?.firstName ?? "Trener";
  const email = user?.primaryEmailAddress?.emailAddress;
  const imageUrl = user?.imageUrl;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Zarządzaj swoim profilem i ustawieniami konta.
        </p>
      </div>

      {/* ── Profil ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" />
            Profil
          </CardTitle>
          <CardDescription>
            Twoje dane tożsamości pobrane z Clerk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={imageUrl} alt={fullName} />
              <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <p
                className="font-semibold text-base"
                data-testid="settings-name"
              >
                {fullName}
              </p>
              {email && (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="settings-email"
                >
                  {email}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Konto ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="w-4 h-4" />
            Konto
          </CardTitle>
          <CardDescription>
            Zarządzaj hasłem, połączonymi kontami i bezpieczeństwem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => openUserProfile()}
            data-testid="btn-manage-account"
            className="w-full sm:w-auto"
          >
            <UserCog className="w-4 h-4 mr-2" />
            Zarządzaj kontem
          </Button>

          <Separator />

          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Wylogowanie zakończy bieżącą sesję na tym urządzeniu.
            </p>
            <Button
              variant="destructive"
              onClick={() => signOut()}
              data-testid="btn-sign-out"
              className="w-full sm:w-auto"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Wyloguj się
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Subskrypcja i Limity ────────────────────────────────────── */}
      <div id="plan-i-limity" className="scroll-mt-4">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Plan i limity
        </h2>
        <SubscriptionSummary context="settings" />
      </div>

      {/* ── Ustawienia aplikacji ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ustawienia aplikacji</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSelect />
        </CardContent>
      </Card>
    </div>
  );
}
