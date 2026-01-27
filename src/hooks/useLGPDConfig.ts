import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  status: string;
}

interface LGPDConfigData {
  id: string;
  empresa_id: string;
  dpo_nome: string | null;
  dpo_email: string | null;
  dpo_telefone: string | null;
  politica_privacidade_versao: string | null;
  termos_uso_versao: string | null;
  retencao_logs_meses: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LGPDConfigWithEmpresa {
  empresa: Empresa;
  config: LGPDConfigData | null;
}

export interface EmpresaWithLGPD extends Empresa {
  lgpd_config: LGPDConfigData | null;
}

// Helper para calcular status LGPD
export function getLGPDStatus(empresa: EmpresaWithLGPD) {
  const config = empresa.lgpd_config;
  
  if (!config) return { status: 'nao_configurado', label: 'Não configurado', color: 'red' as const };
  if (!config.dpo_nome || !config.dpo_email) return { status: 'incompleto', label: 'DPO pendente', color: 'yellow' as const };
  if (config.retencao_logs_meses && config.retencao_logs_meses < 6) return { status: 'erro', label: 'Retenção inválida', color: 'red' as const };
  
  return { status: 'ok', label: 'Configurado', color: 'green' as const };
}

// Hook para super_admin: buscar TODAS as empresas com config LGPD
export function useAllEmpresasLGPD() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["all-empresas-lgpd"],
    queryFn: async (): Promise<EmpresaWithLGPD[]> => {
      // Buscar todas empresas com suas configs LGPD (join)
      const { data: empresas, error: empresasError } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, email, telefone, endereco, status")
        .order("nome");

      if (empresasError) throw empresasError;

      // Buscar todas configs LGPD
      const { data: configs, error: configsError } = await supabase
        .from("lgpd_config")
        .select("*");

      if (configsError) throw configsError;

      // Combinar dados
      return (empresas || []).map(empresa => ({
        ...empresa,
        lgpd_config: configs?.find(c => c.empresa_id === empresa.id) || null
      }));
    },
    enabled: user?.role === 'super_admin',
  });
}

// Hook para buscar dados completos (empresa + lgpd_config)
export function useLGPDConfigWithEmpresa() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lgpd-config-with-empresa", user?.empresa_id],
    queryFn: async (): Promise<LGPDConfigWithEmpresa | null> => {
      if (!user?.empresa_id) return null;

      // Buscar dados da empresa (controlador)
      const { data: empresa, error: empresaError } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, email, telefone, endereco, status")
        .eq("id", user.empresa_id)
        .single();

      if (empresaError) throw empresaError;

      // Buscar configurações LGPD
      const { data: config, error: configError } = await supabase
        .from("lgpd_config")
        .select("*")
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();

      if (configError) throw configError;

      return {
        empresa,
        config: config as LGPDConfigData | null,
      };
    },
    enabled: !!user?.empresa_id,
  });
}

// Hook para atualizar apenas configurações LGPD (DPO e retenção)
export function useUpdateLGPDSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: {
      dpo_nome?: string | null;
      dpo_email?: string | null;
      dpo_telefone?: string | null;
      retencao_logs_meses?: number;
    }) => {
      if (!user?.empresa_id) throw new Error("Empresa não encontrada");

      // Verifica se já existe configuração
      const { data: existing } = await supabase
        .from("lgpd_config")
        .select("id")
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from("lgpd_config")
          .update(settings)
          .eq("empresa_id", user.empresa_id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar
        const { data, error } = await supabase
          .from("lgpd_config")
          .insert({ ...settings, empresa_id: user.empresa_id })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lgpd-config-with-empresa"] });
      queryClient.invalidateQueries({ queryKey: ["lgpd-config"] });
      toast({
        title: "Configuração salva",
        description: "As configurações de LGPD foram atualizadas.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
