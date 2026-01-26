import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EmbarcacaoInsert, EmbarcacaoUpdate } from './useEmbarcacoes';
import { HotspotInsert, HotspotUpdate } from './useHotspots';
import { toast } from '@/hooks/use-toast';

interface CreateEmbarcacaoWithHotspotParams {
  embarcacao: EmbarcacaoInsert;
  hotspot?: Partial<HotspotInsert>;
}

interface UpdateEmbarcacaoWithHotspotParams {
  embarcacao: EmbarcacaoUpdate & { id: string };
  hotspot?: Partial<HotspotUpdate> & { id?: string };
}

export function useCreateEmbarcacaoWithHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ embarcacao, hotspot }: CreateEmbarcacaoWithHotspotParams) => {
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
        rede: hotspot?.rede || '192.168.88.0/24',
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

      return { embarcacao: embarcacaoData, hotspot: hotspotData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
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
    mutationFn: async ({ embarcacao, hotspot }: UpdateEmbarcacaoWithHotspotParams) => {
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
      if (hotspot) {
        if (hotspot.id) {
          // Update existing hotspot
          const { id: hotspotId, ...hotspotUpdates } = hotspot;
          const { error: hotspotError } = await supabase
            .from('hotspots')
            .update({ ...hotspotUpdates, nome: embarcacao.nome || embarcacaoData.nome })
            .eq('id', hotspotId);

          if (hotspotError) throw hotspotError;
        } else {
          // Find hotspot by embarcacao_id and update
          const { data: existingHotspot } = await supabase
            .from('hotspots')
            .select('id')
            .eq('embarcacao_id', id)
            .maybeSingle();

          if (existingHotspot) {
            const { error: hotspotError } = await supabase
              .from('hotspots')
              .update({ ...hotspot, nome: embarcacao.nome || embarcacaoData.nome })
              .eq('id', existingHotspot.id);

            if (hotspotError) throw hotspotError;
          }
        }
      }

      return embarcacaoData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
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
