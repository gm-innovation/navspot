
import { useAuth } from "@/contexts/AuthContext";
import { SuperAdminDashboard } from "@/components/dashboards/SuperAdminDashboard";
import { EmpresaAdminDashboard } from "@/components/dashboards/EmpresaAdminDashboard";
import { GerenteEmbarcacaoDashboard } from "@/components/dashboards/GerenteEmbarcacaoDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  console.log('Dashboard - Current user:', user);
  console.log('Dashboard - User role:', user?.role);

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

  // Renderização condicional baseada no role
  const renderDashboard = () => {
    switch (user.role) {
      case 'super_admin':
        return <SuperAdminDashboard />;
      case 'empresa_admin':
        return <EmpresaAdminDashboard />;
      case 'gerente_embarcacao':
        return <GerenteEmbarcacaoDashboard />;
      default:
        return (
          <div className="flex-1 p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600">Erro de Permissão</h2>
              <p className="text-muted-foreground">Role não reconhecido: {user.role}</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 p-6">
      {renderDashboard()}
    </div>
  );
}
