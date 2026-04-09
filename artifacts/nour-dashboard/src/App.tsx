import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Messages from "@/pages/messages";
import Whatsapp from "@/pages/whatsapp";
import Settings from "@/pages/settings";
import Broadcast from "@/pages/broadcast";
import Logs from "@/pages/logs";
import VideoTemplate from "@/components/video/VideoTemplate";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/video" component={VideoTemplate} />
      <Route path="/.*">
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/contacts" component={Contacts} />
            <Route path="/messages" component={Messages} />
            <Route path="/whatsapp" component={Whatsapp} />
            <Route path="/settings" component={Settings} />
            <Route path="/broadcast" component={Broadcast} />
            <Route path="/logs" component={Logs} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
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
