import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Empresas from "./pages/Empresas";
import Embarcacoes from "./pages/Embarcacoes";
import Tripulantes from "./pages/Tripulantes";
import Dispositivos from "./pages/Dispositivos";
import PerfisVelocidade from "./pages/PerfisVelocidade";
import ListasAcesso from "./pages/ListasAcesso";
import RegrasAcesso from "./pages/RegrasAcesso";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import CompletarCadastro from "./pages/CompletarCadastro";
import NotFound from "./pages/NotFound";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="navspot-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/completar-cadastro" element={<CompletarCadastro />} />
              <Route path="/login" element={<Login />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <AppLayout>
                      <Dashboard />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/empresas" element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <Empresas />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/embarcacoes" element={
                <ProtectedRoute allowedRoles={['super_admin', 'empresa_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <Embarcacoes />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/tripulantes" element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <AppLayout>
                      <Tripulantes />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/dispositivos" element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <AppLayout>
                      <Dispositivos />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/perfis-velocidade" element={
                <ProtectedRoute allowedRoles={['super_admin', 'empresa_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <PerfisVelocidade />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/listas-acesso" element={
                <ProtectedRoute allowedRoles={['super_admin', 'empresa_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <ListasAcesso />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/regras-acesso" element={
                <ProtectedRoute allowedRoles={['super_admin', 'empresa_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <RegrasAcesso />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/alertas" element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <AppLayout>
                      <Alertas />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/configuracoes" element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <AppLayout>
                      <Configuracoes />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="/usuarios" element={
                <ProtectedRoute allowedRoles={['super_admin', 'empresa_admin']}>
                  <SidebarProvider>
                    <AppLayout>
                      <Usuarios />
                    </AppLayout>
                  </SidebarProvider>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
