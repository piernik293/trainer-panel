/**
 * Client-portal top navigation (desktop header + mobile menu) with account
 * menu, read-only account panel and Clerk sign-out.
 *
 * Pure frontend UX: eligibility for "Kalendarz" comes in via `showCalendar`
 * (backend-decided `bookable` flag); no backend or Clerk config changes.
 */
import { ThemeSelect } from "@/components/ThemeSelect";
import { BreathingSetting } from "@/components/BreathingSetting";
import { BrandMark } from "@/components/BrandMark";
import { TrainerApplyCard } from "@/components/TrainerApplyCard";
import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { Menu, LogOut, UserRound, CalendarDays, History, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type PortalNavTarget = "plan" | "history" | "booking";

interface ClientPortalNavProps {
  firstName: string;
  lastName: string;
  /** Backend-decided booking eligibility (in_person / hybrid only). */
  showCalendar: boolean;
  /** Navigate to a plan-page section (exits an open session view first). */
  onNavigate: (target: PortalNavTarget) => void;
}

export function ClientPortalNav({ firstName, lastName, showCalendar, onNavigate }: ClientPortalNavProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const fullName = `${firstName} ${lastName}`.trim();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "K";

  const go = (target: PortalNavTarget) => {
    setMobileOpen(false);
    onNavigate(target);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Explicit, base-path-aware redirect back to /plan: with the session
      // gone, the client SignInGate renders there automatically (never the
      // trainer sign-in). BASE_URL already ends with a trailing slash.
      await signOut({ redirectUrl: `${import.meta.env.BASE_URL}plan` });
    } finally {
      setSigningOut(false);
      setMobileOpen(false);
    }
  };

  const desktopLinks: { target: PortalNavTarget; label: string }[] = [
    { target: "plan", label: "Plan" },
    { target: "history", label: "Historia treningów" },
    ...(showCalendar ? [{ target: "booking" as const, label: "Kalendarz" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
        {/* Brand */}
        <button
          type="button"
          onClick={() => go("plan")}
          className="flex items-center gap-2 min-w-0 shrink-0"
          aria-label="Optimatren — wróć do planu"
        >
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight hidden sm:inline">Optimatren</span>
          <span className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground truncate">
            Portal klienta
          </span>
        </button>

        {/* Desktop nav */}
        <nav aria-label="Nawigacja portalu" className="hidden md:flex items-center gap-1 ml-auto">
          {desktopLinks.map((l) => (
            <Button
              key={l.target}
              variant="ghost"
              size="sm"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => go(l.target)}
            >
              {l.label}
            </Button>
          ))}
        </nav>

        {/* Desktop account menu */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu konta" className="rounded-full">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs bg-primary/15 text-primary">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-semibold truncate">{fullName}</span>
                {email && <span className="block text-xs text-muted-foreground truncate">{email}</span>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
                <UserRound className="w-4 h-4 mr-2" />
                Moje konto
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSignOut()} disabled={signingOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Wyloguj się
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile menu */}
        <div className="md:hidden ml-auto">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Otwórz menu" className="h-10 w-10">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 flex flex-col">
              <SheetTitle className="sr-only">Menu portalu klienta</SheetTitle>
              <div className="px-4 pt-6 pb-4 border-b border-border">
                <p className="text-sm font-semibold truncate">{fullName}</p>
                {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
              </div>
              <nav aria-label="Nawigacja portalu" className="flex flex-col p-2">
                <Button variant="ghost" className="justify-start h-12" onClick={() => go("plan")}>
                  <Dumbbell className="w-4 h-4 mr-2" />
                  Plan treningowy
                </Button>
                <Button variant="ghost" className="justify-start h-12" onClick={() => go("history")}>
                  <History className="w-4 h-4 mr-2" />
                  Historia treningów
                </Button>
                {showCalendar && (
                  <Button variant="ghost" className="justify-start h-12" onClick={() => go("booking")}>
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Kalendarz
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="justify-start h-12"
                  onClick={() => {
                    setMobileOpen(false);
                    setAccountOpen(true);
                  }}
                >
                  <UserRound className="w-4 h-4 mr-2" />
                  Moje konto
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-destructive hover:text-destructive"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Wyloguj się
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Read-only account panel (no password controls — auth is Clerk/Google). */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Moje konto</DialogTitle>
            <DialogDescription>Dane Twojego konta w portalu klienta.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">Imię i nazwisko</dt>
              <dd className="mt-0.5 font-medium">{fullName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">E-mail</dt>
              <dd className="mt-0.5 font-medium break-all">{email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">Status konta</dt>
              <dd className="mt-0.5 font-medium">Aktywne</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] font-bold text-muted-foreground">Forma współpracy</dt>
              <dd className="mt-0.5 font-medium">
                {showCalendar ? "Treningi z trenerem (rezerwacje dostępne)" : "Współpraca online"}
              </dd>
            </div>
          </dl>
          <TrainerApplyCard />
          <ThemeSelect />
          <BreathingSetting />
          <p className="text-xs text-muted-foreground">
            Logowanie odbywa się przez konto Google — zarządzanie hasłem nie jest tu potrzebne.
          </p>
        </DialogContent>
      </Dialog>
    </header>
  );
}
