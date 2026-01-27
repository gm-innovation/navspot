import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface LGPDConfig {
  id: string;
  empresa_id: string;
  razao_social: string | null;
  cnpj: string | null;
  dpo_nome: string | null;
  dpo_email: string | null;
  dpo_telefone: string | null;
  endereco_sede: string | null;
  politica_privacidade_versao: string;
  termos_uso_versao: string;
  retencao_logs_meses: number;
  created_at: string;
  updated_at: string;
}

interface SolicitacaoLGPD {
  id: string;
  tripulante_id: string | null;
  tipo: 'acesso' | 'retificacao' | 'exclusao' | 'portabilidade' | 'oposicao';
  status: 'pendente' | 'em_analise' | 'concluida' | 'recusada';
  descricao: string | null;
  resposta: string | null;
  atendido_por: string | null;
  dados_exportados: Record<string, unknown> | null;
  created_at: string;
  atendido_em: string | null;
  prazo_legal: string;
  tripulante?: {
    nome: string;
    email: string | null;
    embarcacao_id: string;
  };
}

interface Consentimento {
  id: string;
  tripulante_id: string;
  tipo: string;
  versao: string;
  aceito: boolean;
  aceito_em: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditLog {
  id: string;
  user_id: string | null;
  tripulante_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Hook para buscar configuração LGPD da empresa
export function useLGPDConfig() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lgpd-config", user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return null;

      const { data, error } = await supabase
        .from("lgpd_config")
        .select("*")
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();

      if (error) throw error;
      return data as LGPDConfig | null;
    },
    enabled: !!user?.empresa_id,
  });
}

// Hook para atualizar configuração LGPD
export function useUpdateLGPDConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<LGPDConfig>) => {
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
          .update(config)
          .eq("empresa_id", user.empresa_id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar
        const { data, error } = await supabase
          .from("lgpd_config")
          .insert({ ...config, empresa_id: user.empresa_id })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
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

// Hook para buscar solicitações LGPD
export function useSolicitacoesLGPD() {
  return useQuery({
    queryKey: ["solicitacoes-lgpd"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_lgpd")
        .select(`
          *,
          tripulante:tripulante_id (
            nome,
            email,
            embarcacao_id
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SolicitacaoLGPD[];
    },
  });
}

// Hook para atender solicitação LGPD
export function useAtenderSolicitacao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      resposta,
      dados_exportados,
    }: {
      id: string;
      status: 'concluida' | 'recusada';
      resposta: string;
      dados_exportados?: Record<string, unknown> | null;
    }) => {
      const { data, error } = await supabase
        .from("solicitacoes_lgpd")
        .update({
          status,
          resposta,
          dados_exportados: dados_exportados as unknown as null,
          atendido_por: user?.id,
          atendido_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-lgpd"] });
      toast({
        title: "Solicitação atendida",
        description: "A resposta foi registrada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atender solicitação",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Hook para buscar consentimentos
export function useConsentimentos(tripulanteId?: string) {
  return useQuery({
    queryKey: ["consentimentos", tripulanteId],
    queryFn: async () => {
      let query = supabase
        .from("consentimentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (tripulanteId) {
        query = query.eq("tripulante_id", tripulanteId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Consentimento[];
    },
  });
}

// Hook para buscar logs de auditoria
export function useAuditLogs(filters?: {
  tripulante_id?: string;
  tabela?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters?.limit || 100);

      if (filters?.tripulante_id) {
        query = query.eq("tripulante_id", filters.tripulante_id);
      }

      if (filters?.tabela) {
        query = query.eq("tabela", filters.tabela);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });
}

// Hook para estatísticas de consentimentos
export function useConsentimentosStats() {
  return useQuery({
    queryKey: ["consentimentos-stats"],
    queryFn: async () => {
      const { data: tripulantes, error: tripError } = await supabase
        .from("tripulantes")
        .select("id")
        .neq("status", "excluido");

      if (tripError) throw tripError;

      const { data: consentimentos, error: consError } = await supabase
        .from("consentimentos")
        .select("tripulante_id, tipo, versao, aceito")
        .eq("aceito", true);

      if (consError) throw consError;

      // Agrupar por tripulante
      const comConsentimento = new Set(
        consentimentos
          .filter((c) => c.tipo === "politica_privacidade" || c.tipo === "termos_uso")
          .map((c) => c.tripulante_id)
      );

      return {
        total: tripulantes?.length || 0,
        comConsentimento: comConsentimento.size,
        semConsentimento: (tripulantes?.length || 0) - comConsentimento.size,
        percentual: tripulantes?.length
          ? Math.round((comConsentimento.size / tripulantes.length) * 100)
          : 0,
      };
    },
  });
}

// Hook para criar solicitação LGPD
export function useCreateSolicitacao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      tripulante_id,
      tipo,
      descricao,
    }: {
      tripulante_id: string;
      tipo: 'acesso' | 'retificacao' | 'exclusao' | 'portabilidade' | 'oposicao';
      descricao?: string;
    }) => {
      const { data, error } = await supabase
        .from("solicitacoes_lgpd")
        .insert({
          tripulante_id,
          tipo,
          descricao,
          status: 'pendente',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-lgpd"] });
      toast({
        title: "Solicitação registrada",
        description: "A solicitação LGPD foi registrada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao registrar solicitação",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Hook para anonimizar tripulante (exclusão LGPD)
export function useAnonimizarTripulante() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tripulanteId: string) => {
      // Anonimizar dados pessoais
      const { error: updateError } = await supabase
        .from("tripulantes")
        .update({
          nome: "ANONIMIZADO",
          email: null,
          cpf: null,
          cargo: null,
          login_wifi: `deleted_${tripulanteId}`,
          senha_wifi: crypto.randomUUID(),
          status: "excluido",
        })
        .eq("id", tripulanteId);

      if (updateError) throw updateError;

      // Anonimizar dispositivos
      const { error: dispError } = await supabase
        .from("dispositivos_registrados")
        .update({ nome: "ANONIMIZADO" })
        .eq("tripulante_id", tripulanteId);

      if (dispError) throw dispError;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tripulantes"] });
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-lgpd"] });
      toast({
        title: "Dados anonimizados",
        description: "Os dados pessoais foram anonimizados conforme LGPD.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao anonimizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
