import { plPL } from "@clerk/localizations";
import Legal from "@/pages/Legal";
import { TermsGate } from "@/components/TermsGate";
import TrainerLibrary from "@/pages/TrainerLibrary";
import AuthRedirectPage from "@/components/AuthRedirectPage";
import { AUTH_REDIRECT_PATH } from "@/lib/authHome";
import { useEffect, useRef, useState } from "react";
import { AppHero } from "@workspace/design-tokens/hero";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";

import { AppLayout } from "@/components/layout/AppLayout";
import { TrainerProfileGate } from "@/components/TrainerProfileGate";
import { SessionProblemGuard } from "@/components/SessionProblemGuard";
import { BrandMark } from "@/components/BrandMark";
import Dashboard from "@/pages/Dashboard";
import ClientList from "@/pages/ClientList";
import ClientNew from "@/pages/ClientNew";
import ClientDetail from "@/pages/ClientDetail";
import ClientPortalPreview from "@/pages/ClientPortalPreview";
import TrainerLedSession from "@/pages/TrainerLedSession";
import SurveyForm from "@/pages/SurveyForm";
import ExerciseList from "@/pages/ExerciseList";
import ExerciseReview from "@/pages/ExerciseReview";
import { ExerciseNew, ExerciseEdit } from "@/pages/ExerciseForm";
import ExerciseDetail from "@/pages/ExerciseDetail";
import PlanCreate from "@/pages/PlanCreate";
import PlanEditor from "@/pages/PlanEditor";
import PlanDraftWizard from "@/pages/PlanDraftWizard";
import PlanImport from "@/pages/PlanImport";
import SurveyInvite from "@/pages/SurveyInvite";
import CalendarPage from "@/pages/CalendarPage";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";

import { GoldenBullsCounter, IfBrand, MascotEvent } from "@workspace/design-tokens/brand";
// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains. Do not inline the env var.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Client portal lives in a separate artifact (client-landing) — navigating
// there requires a full page load, not an SPA route change.
const CLIENT_PORTAL_PATH = "/client-landing/";

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    // „Kontynuuj z Google” jako pierwszy i największy przycisk, pod nim e-mail i hasło
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
    // Branding lives above the card (see SignInPage) — no logo inside the card.
    logoPlacement: "none" as const,
    logoLinkUrl: basePath || "/",
  },
  // Clerk needs concrete colours: the light-theme tokens (lib/design-tokens).
  variables: {
    colorPrimary: "#C2410C",
    colorForeground: "#1C1917",
    colorMutedForeground: "#57534E",
    colorDanger: "#B42318",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#1C1917",
    colorNeutral: "#1C1917",
    fontFamily: "Manrope, sans-serif",
    borderRadius: "8px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card border border-border rounded-lg w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-extrabold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "!text-foreground !font-semibold",
    formFieldLabel: "text-foreground",
    footerActionLink: "text-primary hover:text-brand-hover",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-success",
    alertText: "text-foreground",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton:
      "!border !border-input !bg-card !shadow-none hover:!bg-muted min-h-14 !text-base !font-semibold " +
      "focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 !opacity-100",
    socialButtonsProviderIcon: "!opacity-100 !brightness-100 !saturate-100",
    formButtonPrimary: "bg-primary hover:bg-brand-hover text-primary-foreground min-h-11",
    formFieldInput: "border-input focus:ring-ring min-h-11",
    footerAction: "bg-muted",
    dividerLine: "bg-border",
    alert: "border border-border",
    otpCodeFieldInput: "border-input",
    formFieldRow: "",
    main: "",
  },
};

// Client errors (401 session expired, 403, 404, 4xx validation) cannot succeed
// on retry — failing fast lets screens show their error state immediately
// instead of a skeleton for the whole retry backoff. Transient errors
// (network, 5xx) are retried up to twice.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: unknown }).status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

// Clears TanStack Query cache on user change / sign-out so stale data
// from a previous trainer session cannot flash when a new one starts.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  // Jedno wejście dla wszystkich (U1/U2): zdjęcie jako przyciemnione tło całej strony, formularz na środku, logo i nazwa nad nim.
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-950 px-4 py-8" data-testid="auth-shell">
      <AppHero variant="login-full" tone="dark" />
      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-6 flex max-w-full flex-col items-center text-center text-white">
          <IfBrand fallback={null}><MascotEvent event="first_open" rozmiar="m" className="mb-2" /></IfBrand>
          <BrandMark className="h-12 w-12 text-2xl" />
          <p className="mt-2 text-2xl font-bold tracking-tight">Optimatren</p>
          <p className="mt-1 text-base font-semibold">{title}</p>
          <p className="mt-1 max-w-sm text-sm text-white/85">{description}</p>
          <GoldenBullsCounter kind="solo" className="mt-3 !text-white/80" />
        </div>
        {children}
      </div>
    </div>
  );
}

// Jedna strona logowania dla wszystkich. Dokąd trafia osoba po zalogowaniu, decyduje serwer (/auth/redirect → GET /api/account/home).
function SignInPage() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { fetch(`${basePath}/api/guest-demo/status`).then((r) => (r.ok ? r.json() : null)).then((b: { enabled?: boolean } | null) => setDemo(!!b?.enabled)).catch(() => setDemo(false)); }, []);
  return (
    <AuthShell title="Zaloguj się do Optimatren" description="Wejdź na swoje konto, żeby zobaczyć plan i postępy.">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}${AUTH_REDIRECT_PATH}`} />
      {demo && (
        <a href="/client-landing/demo" data-testid="guest-demo-link" className="mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white underline underline-offset-4">
          Zobacz, jak to działa (bez konta)
        </a>
      )}
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <AuthShell title="Załóż konto w Optimatren" description="Jedno konto do wszystkiego. Link od trenera działa tak samo jak dotąd.">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}${AUTH_REDIRECT_PATH}`} />
    </AuthShell>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clients" component={ClientList} />
        <Route path="/clients/new" component={ClientNew} />
        <Route path="/clients/:id/survey" component={SurveyForm} />
        <Route path="/clients/:id/plans/new" component={PlanCreate} />
        <Route path="/clients/:id/plans/generate" component={PlanDraftWizard} />
        <Route path="/clients/:id/plans/import" component={PlanImport} />
        <Route path="/clients/:id/portal-preview" component={ClientPortalPreview} />
        <Route path="/clients/:id/trainer-session" component={TrainerLedSession} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/exercises/review" component={ExerciseReview} />
        <Route path="/exercises/new" component={ExerciseNew} />
        <Route path="/exercises/:id/edit" component={ExerciseEdit} />
        <Route path="/exercises/:id" component={ExerciseDetail} />
        <Route path="/exercises" component={ExerciseList} />
        <Route path="/library" component={TrainerLibrary} />
        <Route path="/plans/:id" component={PlanEditor} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/survey-invite" component={SurveyInvite} />
        <Route path="/settings" component={Settings} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AppContent() {
  return (
    <>
      <Show when="signed-in">
        <ClerkQueryClientCacheInvalidator />
        <SessionProblemGuard>
          <TrainerProfileGate>
            <TermsGate>
              <Router />
            </TermsGate>
          </TrainerProfileGate>
        </SessionProblemGuard>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [location, setLocation] = useLocation();


  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        ...plPL,
        signIn: {
          ...plPL.signIn,
          start: {
            ...plPL.signIn?.start,
            title: "Zaloguj się",
            subtitle: "Najszybciej przez Google",
          },
          password: {
            ...plPL.signIn?.password,
            actionLink: "Nie pamiętam hasła",
          },
          emailCode: {
            ...plPL.signIn?.emailCode,
            resendButton: "Nie dotarł kod? Wyślij ponownie",
          },
        },
        signUp: {
          ...plPL.signUp,
          start: {
            ...plPL.signUp?.start,
            title: "Załóż konto — to zajmie minutę",
            subtitle: "Najszybciej przez Google",
          },
          emailCode: {
            ...plPL.signUp?.emailCode,
            formSubtitle: "Wysłaliśmy kod na Twój e-mail — to tylko raz, przy zakładaniu konta.",
            resendButton: "Nie dotarł kod? Wyślij ponownie",
          },
        },
      }}
      routerPush={(to) =>
        to.startsWith(CLIENT_PORTAL_PATH)
          ? window.location.assign(to)
          : setLocation(stripBase(to))
      }
      routerReplace={(to) =>
        to.startsWith(CLIENT_PORTAL_PATH)
          ? window.location.replace(to)
          : setLocation(stripBase(to), { replace: true })
      }
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            {/* Sign-in / sign-up — accessible without auth */}
            {/* REQUIRED — copy "/sign-in/*?" and "/sign-up/*?" verbatim */}
            <Route path="/sign-in/*?" component={SignInPage} />
            {/* Stary adres logowania trenera → jedno wejście */}
            <Route path="/trainer/sign-in/*?">{() => <Redirect to="/sign-in" />}</Route>
            <Route path={AUTH_REDIRECT_PATH} component={AuthRedirectPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/legal/:slug" component={Legal} />
            {/* Dev-only visual preview of the calendar (mocked data via ?mockCalendar=1).
                Stripped from production builds — import.meta.env.DEV is false there. */}
            {import.meta.env.DEV && (
              <Route path="/calendar-preview" component={CalendarPage} />
            )}
            {/* All other routes require sign-in */}
            <Route>
              <AppContent />
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
