
import { useAuth } from "@/contexts/AuthContext";
import { SuperAdminDashboard } from "@/components/dashboards/SuperAdminDashboard";
import { EmpresaAdminDashboard } from "@/components/dashboards/EmpresaAdminDashboard";
import { GerenteEmbarcacaoDashboard } from "@/components/dashboards/GerenteEmbarcacaoDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Carregando...</h2>
          <p className="text-muted-foreground">Verificando suas permissões</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      {user.role === 'super_admin' && <SuperAdminDashboard />}
      {user.role === 'empresa_admin' && <EmpresaAdminDashboard />}
      {user.role === 'gerente_embarcacao' && <GerenteEmbarcacaoDashboard />}
    </div>
  );
}
