import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface EmbarcacaoBasica {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  empresa_id: string;
}

export function useGerenteEmbarcacoes() {
  const { user, hasRole } = useAuth();

  return useQuery({
    queryKey: ['gerente-embarcacoes', user?.id, user?.role],
    queryFn: async (): Promise<EmbarcacaoBasica[]> => {
      if (!user?.id) return [];

      if (hasRole(['super_admin'])) {
        // Super admin: todas as embarcações
        const { data, error } = await supabase
          .from('embarcacoes')
          .select('id, nome, tipo, status, empresa_id')
          .order('nome');

        if (error) throw error;
        return data || [];
      } 
      
      if (hasRole(['empresa_admin'])) {
        // Empresa admin: embarcações da empresa
        const { data, error } = await supabase
          .from('embarcacoes')
          .select('id, nome, tipo, status, empresa_id')
          .eq('empresa_id', user.empresa_id!)
          .order('nome');

        if (error) throw error;
        return data || [];
      }

      // Gerente: buscar da tabela gerente_embarcacoes
      const { data, error } = await supabase
        .from('gerente_embarcacoes')
        .select(`
          embarcacoes (
            id,
            nome,
            tipo,
            status,
            empresa_id
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      // Flatten the response
      return (data || [])
        .map((item: any) => item.embarcacoes)
        .filter(Boolean)
        .sort((a: EmbarcacaoBasica, b: EmbarcacaoBasica) => a.nome.localeCompare(b.nome));
    },
    enabled: !!user?.id,
  });
}
