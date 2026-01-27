import { useAuth } from "@/contexts/AuthContext";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { SecurityCard } from "@/components/settings/SecurityCard";
import { SystemInfoCard } from "@/components/settings/SystemInfoCard";

export default function Configuracoes() {
  const { user, hasRole } = useAuth();
  
  // Gerentes só podem visualizar (não editar)
  const isReadOnly = hasRole(['gerente_embarcacao']);
  
  // Super admins e empresa admins podem editar
  const canEdit = hasRole(['super_admin', 'empresa_admin']);

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Configure as preferências do sistema NAVSPOT
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Notifications Card - Full width on mobile, half on desktop */}
        <div className="md:col-span-2 lg:col-span-1">
          <NotificationsCard readOnly={isReadOnly} />
        </div>

        {/* Right column with Security and System Info */}
        <div className="space-y-6 md:col-span-2 lg:col-span-1">
          <SecurityCard />
          <SystemInfoCard />
        </div>
      </div>
    </div>
  );
}
