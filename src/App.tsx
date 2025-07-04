
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Hotspots from "./pages/Hotspots";
import Embarcacoes from "./pages/Embarcacoes";
import Tripulantes from "./pages/Tripulantes";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import NotFound from "./pages/NotFound";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="navspot-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <SidebarProvider>
                <AppLayout>
                  <Routes>
                    <Route index element={<Dashboard />} />
                    <Route path="/hotspots" element={<Hotspots />} />
                    <Route path="/embarcacoes" element={<Embarcacoes />} />
                    <Route path="/tripulantes" element={<Tripulantes />} />
                    <Route path="/alertas" element={<Alertas />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                  </Routes>
                </AppLayout>
              </SidebarProvider>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
