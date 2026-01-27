import { useAuth } from "@/contexts/AuthContext";
import { SuperAdminLGPDView } from "@/components/lgpd/SuperAdminLGPDView";
import { EmpresaLGPDView } from "@/components/lgpd/EmpresaLGPDView";

export default function GestaoLGPD() {
  const { user } = useAuth();

  // Super admin vê todas as empresas
  if (user?.role === 'super_admin') {
    return <SuperAdminLGPDView />;
  }

  // Empresa admin/gerente veem sua própria empresa
  return <EmpresaLGPDView />;
}
