import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import SamplesList from "@/pages/samples/list";
import NewSample from "@/pages/samples/new";
import SampleDetail from "@/pages/samples/detail";
import EditSample from "@/pages/samples/edit";
import TransfersList from "@/pages/transfers/list";
import NewTransfer from "@/pages/transfers/new";
import Schedule from "@/pages/schedule";
import Analytics from "@/pages/analytics";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/samples/new" component={NewSample} />
        <Route path="/samples/:id/edit" component={EditSample} />
        <Route path="/samples/:id" component={SampleDetail} />
        <Route path="/samples" component={SamplesList} />
        <Route path="/transfers/new" component={NewTransfer} />
        <Route path="/transfers" component={TransfersList} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
