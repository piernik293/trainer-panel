import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";

import { AppLayout } from "@/components/layout/AppLayout";
import markUrl from "@/assets/optimatren-mark.png";
import Dashboard from "@/pages/Dashboard";
import ClientList from "@/pages/ClientList";
import ClientNew from "@/pages/ClientNew";
import ClientDetail from "@/pages/ClientDetail";
import SurveyForm from "@/pages/SurveyForm";
import ExerciseList from "@/pages/ExerciseList";
import { ExerciseNew, ExerciseEdit } from "@/pages/ExerciseForm";
import ExerciseDetail from "@/pages/ExerciseDetail";
import PlanCreate from "@/pages/PlanCreate";
import PlanEditor from "@/pages/PlanEditor";
import PlanDraftWizard from "@/pages/PlanDraftWizard";
import SurveyInvite from "@/pages/SurveyInvite";
import Settings from "@/pages/Settings";

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
const CLIENT_PORTAL_PATH = "/client-landing/plan";

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
    // Branding lives above the card (see SignInPage) — no logo inside the card.
    logoPlacement: "none" as const,
    logoLinkUrl: basePath || "/",
  },
  variables: {
    colorPrimary: "#FF3C00",
    colorForeground: "hsl(222.2 84% 4.9%)",
    colorMutedForeground: "hsl(215.4 16.3% 46.9%)",
    colorDanger: "hsl(0 72.2% 50.6%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214.3 31.8% 91.4%)",
    colorInputForeground: "hsl(222.2 84% 4.9%)",
    colorNeutral: "hsl(214.3 31.8% 91.4%)",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-gray-900 font-semibold",
    headerSubtitle: "text-gray-500",
    socialButtonsBlockButtonText: "!text-gray-800 !font-medium",
    formFieldLabel: "text-gray-700",
    footerActionLink: "text-orange-600 hover:text-orange-700",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400",
    identityPreviewEditButton: "text-orange-600",
    formFieldSuccessText: "text-green-600",
    alertText: "text-gray-700",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton:
      "!border !border-slate-300 !bg-slate-50 !shadow-sm hover:!bg-slate-100 hover:!border-slate-400 " +
      "focus-visible:!ring-2 focus-visible:!ring-orange-500 focus-visible:!ring-offset-2 !opacity-100",
    socialButtonsProviderIcon: "!opacity-100 !brightness-100 !saturate-100",
    formButtonPrimary: "bg-orange-600 hover:bg-orange-700 text-white",
    formFieldInput: "border-gray-300 focus:ring-orange-500",
    footerAction: "bg-gray-50",
    dividerLine: "bg-gray-200",
    alert: "border border-gray-200",
    otpCodeFieldInput: "border-gray-300",
    formFieldRow: "",
    main: "",
  },
};

const queryClient = new QueryClient();

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
  helper,
  switchLink,
  children,
}: {
  title: string;
  description: string;
  helper?: string;
  switchLink: { text: string; label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      {/* Optimatren branding above the Clerk card */}
      <div className="flex flex-col items-center text-center mb-6 max-w-full">
        <img
          src={markUrl}
          alt="Optimatren"
          className="w-[100px] md:w-[130px] h-auto object-contain"
        />
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">Optimatren</p>
        <p className="mt-1 text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        {helper && (
          <p className="mt-2 max-w-sm text-xs text-muted-foreground">{helper}</p>
        )}
      </div>
      {children}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {switchLink.text}{" "}
        <Link
          href={switchLink.href}
          className="inline-block py-2 font-medium text-orange-600 underline underline-offset-2 hover:text-orange-700"
        >
          {switchLink.label}
        </Link>
      </p>
    </div>
  );
}

// Default public entry — client-facing login. Role is NOT derived from the
// login page used: after auth the client portal's own role checks apply.
function ClientSignInPage() {
  return (
    <AuthShell
      title="Zaloguj się do portalu klienta"
      description="Zobacz swój plan treningowy, historię treningów i zapisuj ciężary."
      helper="Użyj tego samego konta Google, na które otrzymałeś zaproszenie od trenera."
      switchLink={{
        text: "Jesteś trenerem?",
        label: "Przejdź do Panelu Trenera",
        href: "/trainer/sign-in",
      }}
    >
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={CLIENT_PORTAL_PATH}
      />
    </AuthShell>
  );
}

function TrainerSignInPage() {
  return (
    <AuthShell
      title="Zaloguj się do Panelu Trenera"
      description="Zarządzaj klientami, planami treningowymi i postępami."
      switchLink={{
        text: "Jesteś klientem?",
        label: "Przejdź do portalu klienta",
        href: "/sign-in",
      }}
    >
      <SignIn
        routing="path"
        path={`${basePath}/trainer/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={basePath || "/"}
      />
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      {/* Optimatren branding above the Clerk card */}
      <div className="flex flex-col items-center text-center mb-6 max-w-full">
        <img
          src={markUrl}
          alt="Optimatren"
          className="w-[100px] md:w-[130px] h-auto object-contain"
        />
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">Optimatren</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Zarządzaj klientami, planami i postępami
        </p>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/trainer/sign-in" />
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
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/exercises/new" component={ExerciseNew} />
        <Route path="/exercises/:id/edit" component={ExerciseEdit} />
        <Route path="/exercises/:id" component={ExerciseDetail} />
        <Route path="/exercises" component={ExerciseList} />
        <Route path="/plans/:id" component={PlanEditor} />
        <Route path="/survey-invite" component={SurveyInvite} />
        <Route path="/settings" component={Settings} />
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
        <Router />
      </Show>
      <Show when="signed-out">
        <Redirect to="/trainer/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [location, setLocation] = useLocation();

  // The client login page must not show trainer copy inside the Clerk card.
  const isTrainerAuthRoute = location.startsWith("/trainer/sign-in");

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Zaloguj się",
            subtitle: isTrainerAuthRoute
              ? "Zaloguj się do Panelu Trenera"
              : "Zaloguj się do portalu klienta",
          },
        },
        signUp: {
          start: {
            title: "Utwórz konto",
            subtitle: "Zacznij korzystać z Panelu Trenera",
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
            <Route path="/sign-in/*?" component={ClientSignInPage} />
            <Route path="/trainer/sign-in/*?" component={TrainerSignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
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
