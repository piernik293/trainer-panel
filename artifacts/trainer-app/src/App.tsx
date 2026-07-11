import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AppLayout } from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import ClientList from '@/pages/ClientList';
import ClientNew from '@/pages/ClientNew';
import ClientDetail from '@/pages/ClientDetail';
import SurveyForm from '@/pages/SurveyForm';
import ExerciseList from '@/pages/ExerciseList';
import { ExerciseNew, ExerciseEdit } from '@/pages/ExerciseForm';
import ExerciseDetail from '@/pages/ExerciseDetail';
import PlanCreate from '@/pages/PlanCreate';
import PlanEditor from '@/pages/PlanEditor';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clients" component={ClientList} />
        <Route path="/clients/new" component={ClientNew} />
        <Route path="/clients/:id/survey" component={SurveyForm} />
        <Route path="/clients/:id/plans/new" component={PlanCreate} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/exercises/new" component={ExerciseNew} />
        <Route path="/exercises/:id/edit" component={ExerciseEdit} />
        <Route path="/exercises/:id" component={ExerciseDetail} />
        <Route path="/exercises" component={ExerciseList} />
        <Route path="/plans/:id" component={PlanEditor} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
