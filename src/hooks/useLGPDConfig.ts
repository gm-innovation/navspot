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
}

interface LGPDConfigData {
  id: string;
  empresa_id: string;
  dpo_nome: string | null;
  dpo_email: string | null;
  dpo_telefone: string | null;
  politica_privacidade_versao: string;
  termos_uso_versao: string;
  retencao_logs_meses: number;
  created_at: string;
  updated_at: string;
}

export interface LGPDConfigWithEmpresa {
  empresa: Empresa;
  config: LGPDConfigData | null;
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
        .select("id, nome, cnpj, email, telefone, endereco")
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
