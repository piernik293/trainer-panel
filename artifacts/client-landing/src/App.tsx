import { ClerkProvider } from '@clerk/react';
import { plPL } from '@clerk/localizations';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import Home from '@/pages/home';
import PlanPortal from '@/pages/plan';
import SurveyTokenPage from '@/pages/survey';
import ActivatePage from '@/pages/activate';
import BookingPreviewPage from '@/pages/booking-preview';
import PortalPreviewPage from '@/pages/portal-preview';

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so
// the same build serves multiple Clerk custom domains. Do not inline the env var.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: '#FF3C00',
    colorBackground: 'hsl(0 0% 100%)',
    borderRadius: '0rem',
  },
};

const clerkLocalization = {
  ...plPL,
  signIn: {
    ...plPL.signIn,
    start: {
      ...plPL.signIn?.start,
      title: 'Zaloguj się',
      subtitle: 'Zaloguj się, aby zobaczyć swój plan treningowy',
    },
  },
  signUp: {
    ...plPL.signUp,
    start: {
      ...plPL.signUp?.start,
      title: 'Utwórz konto',
      subtitle: 'Utwórz konto, aby uzyskać dostęp do swojego planu',
    },
  },
};

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/plan" component={PlanPortal} />
      {/* Dev-only visual preview of the booking calendar (mocked data via
          ?mockBooking=1). Stripped from production builds. */}
      {import.meta.env.DEV && (
        <Route path="/booking-preview" component={BookingPreviewPage} />
      )}
      {/* Dev-only visual preview of the client-portal navigation (mocked data
          via ?mockBooking=1; &online=1 hides Kalendarz). */}
      {import.meta.env.DEV && (
        <Route path="/portal-preview" component={PortalPreviewPage} />
      )}
      {/* Survey token pages are accessible without Clerk auth */}
      <Route path="/survey/:token" component={SurveyTokenPage} />
      {/* Client portal activation — token validates server-side before Clerk auth */}
      <Route path="/invite/:token" component={ActivatePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={clerkLocalization}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
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