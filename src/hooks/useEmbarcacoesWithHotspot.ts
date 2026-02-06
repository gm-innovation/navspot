import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EmbarcacaoInsert, EmbarcacaoUpdate } from './useEmbarcacoes';
import { HotspotInsert, HotspotUpdate } from './useHotspots';
import { toast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';

interface CreateEmbarcacaoWithHotspotParams {
  embarcacao: EmbarcacaoInsert;
  hotspot?: Partial<HotspotInsert>;
  listasAplicadas?: string[];
}

interface UpdateEmbarcacaoWithHotspotParams {
  embarcacao: EmbarcacaoUpdate & { id: string };
  hotspot?: Partial<HotspotUpdate> & { id?: string };
  listasAplicadas?: string[];
}

export function useCreateEmbarcacaoWithHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ embarcacao, hotspot, listasAplicadas }: CreateEmbarcacaoWithHotspotParams) => {
      // 1. Create embarcacao
      const { data: embarcacaoData, error: embarcacaoError } = await supabase
        .from('embarcacoes')
        .insert(embarcacao)
        .select()
        .single();

      if (embarcacaoError) throw embarcacaoError;

      // 2. Create hotspot with same name, linked to embarcacao
      const hotspotPayload = {
        nome: embarcacao.nome,
        embarcacao_id: embarcacaoData.id,
        interface_wifi: hotspot?.interface_wifi || 'wlan1',
        rede: hotspot?.rede || '10.10.10.0/24',
        max_usuarios: hotspot?.max_usuarios || 50,
        sync_interval_minutes: hotspot?.sync_interval_minutes || 5,
        status: 'offline',
      };

      const { data: hotspotData, error: hotspotError } = await supabase
        .from('hotspots')
        .insert(hotspotPayload)
        .select()
        .single();

      if (hotspotError) {
        // Rollback: delete embarcacao if hotspot creation fails
        await supabase.from('embarcacoes').delete().eq('id', embarcacaoData.id);
        throw hotspotError;
      }

      // 3. Create access rules for each selected list
      if (listasAplicadas && listasAplicadas.length > 0) {
        const regras = listasAplicadas.map((listaId, index) => ({
          lista_id: listaId,
          hotspot_id: hotspotData.id,
          empresa_id: embarcacao.empresa_id,
          acao: 'permitir',
          prioridade: 100 + index,
          ativo: true,
          dias_semana: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as unknown as Json,
        }));

        const { error: regrasError } = await supabase
          .from('regras_acesso')
          .insert(regras);

        if (regrasError) {
          console.error('Erro ao criar regras de acesso:', regrasError);
          // Don't rollback - embarcacao and hotspot were created successfully
          // Just notify the user
          toast({
            title: 'Aviso',
            description: 'Embarcação criada, mas houve erro ao criar algumas regras de acesso.',
            variant: 'destructive',
          });
        }
      }

      return { embarcacao: embarcacaoData, hotspot: hotspotData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Embarcação criada',
        description: 'A embarcação e seu hotspot foram cadastrados com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar embarcação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateEmbarcacaoWithHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ embarcacao, hotspot, listasAplicadas }: UpdateEmbarcacaoWithHotspotParams) => {
      const { id, ...embarcacaoUpdates } = embarcacao;

      // 1. Update embarcacao
      const { data: embarcacaoData, error: embarcacaoError } = await supabase
        .from('embarcacoes')
        .update(embarcacaoUpdates)
        .eq('id', id)
        .select()
        .single();

      if (embarcacaoError) throw embarcacaoError;

      // 2. Update hotspot if provided
      let hotspotId: string | null = null;
      if (hotspot) {
        if (hotspot.id) {
          hotspotId = hotspot.id;
          // Update existing hotspot
          const { id: hId, ...hotspotUpdates } = hotspot;
          const { error: hotspotError } = await supabase
            .from('hotspots')
            .update({ ...hotspotUpdates, nome: embarcacao.nome || embarcacaoData.nome })
            .eq('id', hId);

          if (hotspotError) throw hotspotError;
        } else {
          // Find hotspot by embarcacao_id and update
          const { data: existingHotspot } = await supabase
            .from('hotspots')
            .select('id')
            .eq('embarcacao_id', id)
            .maybeSingle();

          if (existingHotspot) {
            hotspotId = existingHotspot.id;
            const { error: hotspotError } = await supabase
              .from('hotspots')
              .update({ ...hotspot, nome: embarcacao.nome || embarcacaoData.nome })
              .eq('id', existingHotspot.id);

            if (hotspotError) throw hotspotError;
          }
        }
      }

      // 3. Update access rules if listasAplicadas is provided
      if (listasAplicadas !== undefined && hotspotId) {
        // Get existing rules for this hotspot
        const { data: existingRules } = await supabase
          .from('regras_acesso')
          .select('id, lista_id')
          .eq('hotspot_id', hotspotId);

        const existingListaIds = new Set(existingRules?.map(r => r.lista_id) || []);
        const newListaIds = new Set(listasAplicadas);

        // Delete rules that are no longer selected
        const rulesToDelete = existingRules?.filter(r => !newListaIds.has(r.lista_id)) || [];
        if (rulesToDelete.length > 0) {
          await supabase
            .from('regras_acesso')
            .delete()
            .in('id', rulesToDelete.map(r => r.id));
        }

        // Add rules for newly selected lists
        const listasToAdd = listasAplicadas.filter(id => !existingListaIds.has(id));
        if (listasToAdd.length > 0) {
          const empresaId = embarcacaoUpdates.empresa_id || embarcacaoData.empresa_id;
          const regras = listasToAdd.map((listaId, index) => ({
            lista_id: listaId,
            hotspot_id: hotspotId!,
            empresa_id: empresaId,
            acao: 'permitir',
            prioridade: 100 + index + existingListaIds.size,
            ativo: true,
            dias_semana: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as unknown as Json,
          }));

          const { error: regrasError } = await supabase
            .from('regras_acesso')
            .insert(regras);

          if (regrasError) {
            console.error('Erro ao criar novas regras de acesso:', regrasError);
          }
        }
      }

      return embarcacaoData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Embarcação atualizada',
        description: 'Os dados da embarcação foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar embarcação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
