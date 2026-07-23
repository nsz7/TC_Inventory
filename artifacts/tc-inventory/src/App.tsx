import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import SamplesList from "@/pages/samples/list";
import NewSample from "@/pages/samples/new";
import SampleDetail from "@/pages/samples/detail";
import EditSample from "@/pages/samples/edit";
import BatchDetail from "@/pages/batches/detail";
import Schedule from "@/pages/schedule";
import Analytics from "@/pages/analytics";
import SettingsPage from "@/pages/settings";
import Login from "@/pages/login";
import AdminUsers from "@/pages/admin-users";
import { SessionTimeoutWarning } from "@/components/session-timeout-warning";
import { useCurrentUser, CURRENT_USER_QUERY_KEY } from "@/hooks/use-auth";
import { isUnauthorized } from "@/lib/api";
import { recordActivity } from "@/lib/session-activity";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => handleQueryResult(error),
    onSuccess: () => recordActivity(),
  }),
  mutationCache: new MutationCache({
    onError: (error) => handleQueryResult(error),
    onSuccess: () => recordActivity(),
  }),
});

function handleQueryResult(error: unknown) {
  if (isUnauthorized(error)) {
    // Any 401 (session expired, or never logged in) — force the login
    // screen rather than leaving the page showing stale/broken data.
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
  }
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/samples/new" component={NewSample} />
        <Route path="/samples/:id/edit" component={EditSample} />
        <Route path="/samples/:id" component={SampleDetail} />
        <Route path="/samples" component={SamplesList} />
        <Route path="/batches/:id" component={BatchDetail} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate() {
  const { data: currentUser, isLoading } = useCurrentUser();

  if (isLoading) return null;

  if (!currentUser) {
    return <Login />;
  }

  return (
    <>
      <Router />
      <SessionTimeoutWarning />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
