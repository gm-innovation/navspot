import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationSettings {
  id: string;
  empresa_id: string | null;
  email_enabled: boolean;
  email_destinatarios: string[];
  whatsapp_enabled: boolean;
  whatsapp_numeros: string[];
  webhook_enabled: boolean;
  webhook_url: string | null;
  auto_resolver_enabled: boolean;
  auto_resolver_horas: number;
  agrupar_enabled: boolean;
  escalacao_enabled: boolean;
  escalacao_minutos: number;
  escalacao_destinatarios: string[];
  notificar_severidades: string[];
  created_at: string;
  updated_at: string;
}

export type NotificationSettingsUpdate = Partial<Omit<NotificationSettings, 'id' | 'created_at' | 'updated_at'>>;

// Fetch notification settings for the user's empresa
export function useNotificationSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-settings', user?.empresa_id],
    queryFn: async () => {
      let query = supabase.from('notification_settings').select('*');
      
      // Para empresa_admin e gerente, filtrar pela empresa
      if (user?.empresa_id) {
        query = query.eq('empresa_id', user.empresa_id);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error fetching notification settings:', error);
        throw error;
      }

      return data as NotificationSettings | null;
    },
    enabled: !!user,
  });
}

// Create notification settings
export function useCreateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: NotificationSettingsUpdate & { empresa_id: string }) => {
      const { data, error } = await supabase
        .from('notification_settings')
        .insert(settings)
        .select()
        .single();

      if (error) throw error;
      return data as NotificationSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast({
        title: 'Configurações criadas',
        description: 'As configurações de notificação foram salvas.',
      });
    },
    onError: (error) => {
      console.error('Error creating notification settings:', error);
      toast({
        title: 'Erro ao criar configurações',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    },
  });
}

// Update notification settings
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...settings }: NotificationSettingsUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('notification_settings')
        .update(settings)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as NotificationSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast({
        title: 'Configurações atualizadas',
        description: 'As configurações de notificação foram salvas.',
      });
    },
    onError: (error) => {
      console.error('Error updating notification settings:', error);
      toast({
        title: 'Erro ao atualizar configurações',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    },
  });
}

// Test webhook
export function useTestWebhook() {
  return useMutation({
    mutationFn: async (webhookUrl: string) => {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          message: 'Teste de webhook NAVSPOT',
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    },
    onSuccess: () => {
      toast({
        title: 'Webhook testado',
        description: 'A requisição de teste foi enviada com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Webhook test failed:', error);
      toast({
        title: 'Falha no teste',
        description: 'Não foi possível conectar ao webhook. Verifique a URL.',
        variant: 'destructive',
      });
    },
  });
}
