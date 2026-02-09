export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      acoes_pendentes: {
        Row: {
          created_at: string
          erro_mensagem: string | null
          executed_at: string | null
          hotspot_id: string
          id: string
          payload: Json
          status: string
          tentativas: number
          tipo: string
        }
        Insert: {
          created_at?: string
          erro_mensagem?: string | null
          executed_at?: string | null
          hotspot_id: string
          id?: string
          payload?: Json
          status?: string
          tentativas?: number
          tipo: string
        }
        Update: {
          created_at?: string
          erro_mensagem?: string | null
          executed_at?: string | null
          hotspot_id?: string
          id?: string
          payload?: Json
          status?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "acoes_pendentes_hotspot_id_fkey"
            columns: ["hotspot_id"]
            isOneToOne: false
            referencedRelation: "hotspots"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string
          embarcacao_id: string | null
          empresa_id: string | null
          hotspot_id: string | null
          id: string
          mensagem: string
          resolvido: boolean
          resolvido_at: string | null
          severidade: string
          tipo: string
          tripulante_id: string | null
        }
        Insert: {
          created_at?: string
          embarcacao_id?: string | null
          empresa_id?: string | null
          hotspot_id?: string | null
          id?: string
          mensagem: string
          resolvido?: boolean
          resolvido_at?: string | null
          severidade?: string
          tipo: string
          tripulante_id?: string | null
        }
        Update: {
          created_at?: string
          embarcacao_id?: string | null
          empresa_id?: string | null
          hotspot_id?: string | null
          id?: string
          mensagem?: string
          resolvido?: boolean
          resolvido_at?: string | null
          severidade?: string
          tipo?: string
          tripulante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_hotspot_id_fkey"
            columns: ["hotspot_id"]
            isOneToOne: false
            referencedRelation: "hotspots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          ip_address: unknown
          registro_id: string | null
          tabela: string
          tripulante_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip_address?: unknown
          registro_id?: string | null
          tabela: string
          tripulante_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip_address?: unknown
          registro_id?: string | null
          tabela?: string
          tripulante_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos: {
        Row: {
          aceito: boolean
          aceito_em: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          tipo: string
          tripulante_id: string
          user_agent: string | null
          versao: string
        }
        Insert: {
          aceito: boolean
          aceito_em?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          tipo: string
          tripulante_id: string
          user_agent?: string | null
          versao: string
        }
        Update: {
          aceito?: boolean
          aceito_em?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          tipo?: string
          tripulante_id?: string
          user_agent?: string | null
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos_registrados: {
        Row: {
          autorizado: boolean
          bloqueado_at: string | null
          bloqueado_por: string | null
          bloqueio_motivo: string | null
          bytes_consumidos: number
          config_personalizada: Json | null
          created_at: string
          embarcacao_id: string | null
          id: string
          mac_address: string
          nome: string | null
          perfil_id: string | null
          tipo: string
          tripulante_id: string | null
          ultimo_uso: string | null
        }
        Insert: {
          autorizado?: boolean
          bloqueado_at?: string | null
          bloqueado_por?: string | null
          bloqueio_motivo?: string | null
          bytes_consumidos?: number
          config_personalizada?: Json | null
          created_at?: string
          embarcacao_id?: string | null
          id?: string
          mac_address: string
          nome?: string | null
          perfil_id?: string | null
          tipo?: string
          tripulante_id?: string | null
          ultimo_uso?: string | null
        }
        Update: {
          autorizado?: boolean
          bloqueado_at?: string | null
          bloqueado_por?: string | null
          bloqueio_motivo?: string | null
          bytes_consumidos?: number
          config_personalizada?: Json | null
          created_at?: string
          embarcacao_id?: string | null
          id?: string
          mac_address?: string
          nome?: string | null
          perfil_id?: string | null
          tipo?: string
          tripulante_id?: string | null
          ultimo_uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivos_registrados_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivos_registrados_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_velocidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivos_registrados_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      embarcacoes: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          localizacao: string | null
          nome: string
          responsavel_email: string | null
          responsavel_nome: string | null
          status: string
          timezone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          localizacao?: string | null
          nome: string
          responsavel_email?: string | null
          responsavel_nome?: string | null
          status?: string
          timezone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          localizacao?: string | null
          nome?: string
          responsavel_email?: string | null
          responsavel_nome?: string | null
          status?: string
          timezone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string | null
          cor_fundo: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nome: string
          status: string
          telefone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          cor_fundo?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          status?: string
          telefone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          cor_fundo?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          status?: string
          telefone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      gerente_embarcacoes: {
        Row: {
          created_at: string
          embarcacao_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embarcacao_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          embarcacao_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gerente_embarcacoes_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      hotspot_status_history: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          hotspot_id: string
          id: string
          reason: string | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          hotspot_id: string
          id?: string
          reason?: string | null
          started_at?: string
          status: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          hotspot_id?: string
          id?: string
          reason?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotspot_status_history_hotspot_id_fkey"
            columns: ["hotspot_id"]
            isOneToOne: false
            referencedRelation: "hotspots"
            referencedColumns: ["id"]
          },
        ]
      }
      hotspots: {
        Row: {
          created_at: string
          embarcacao_id: string
          firewall_rules_hash: string | null
          firewall_rules_updated_at: string | null
          id: string
          initial_config_sent: boolean | null
          interface_wifi: string
          max_usuarios: number | null
          migration_state: string | null
          nome: string
          portal_profile_version: string | null
          rede: string
          rede_prev: string | null
          ros_version: string | null
          script_gerado: string | null
          script_versao: number
          status: string
          sync_interval_minutes: number
          sync_token: string
          synced_profiles: Json | null
          synced_users: Json | null
          telemetry_failures: number
          ultima_sincronizacao: string | null
          updated_at: string
          wan_interface: string
          wan_type: string
        }
        Insert: {
          created_at?: string
          embarcacao_id: string
          firewall_rules_hash?: string | null
          firewall_rules_updated_at?: string | null
          id?: string
          initial_config_sent?: boolean | null
          interface_wifi?: string
          max_usuarios?: number | null
          migration_state?: string | null
          nome: string
          portal_profile_version?: string | null
          rede?: string
          rede_prev?: string | null
          ros_version?: string | null
          script_gerado?: string | null
          script_versao?: number
          status?: string
          sync_interval_minutes?: number
          sync_token?: string
          synced_profiles?: Json | null
          synced_users?: Json | null
          telemetry_failures?: number
          ultima_sincronizacao?: string | null
          updated_at?: string
          wan_interface?: string
          wan_type?: string
        }
        Update: {
          created_at?: string
          embarcacao_id?: string
          firewall_rules_hash?: string | null
          firewall_rules_updated_at?: string | null
          id?: string
          initial_config_sent?: boolean | null
          interface_wifi?: string
          max_usuarios?: number | null
          migration_state?: string | null
          nome?: string
          portal_profile_version?: string | null
          rede?: string
          rede_prev?: string | null
          ros_version?: string | null
          script_gerado?: string | null
          script_versao?: number
          status?: string
          sync_interval_minutes?: number
          sync_token?: string
          synced_profiles?: Json | null
          synced_users?: Json | null
          telemetry_failures?: number
          ultima_sincronizacao?: string | null
          updated_at?: string
          wan_interface?: string
          wan_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotspots_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_config: {
        Row: {
          created_at: string | null
          dpo_email: string | null
          dpo_nome: string | null
          dpo_telefone: string | null
          empresa_id: string
          id: string
          politica_privacidade_versao: string | null
          retencao_logs_meses: number | null
          termos_uso_versao: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dpo_email?: string | null
          dpo_nome?: string | null
          dpo_telefone?: string | null
          empresa_id: string
          id?: string
          politica_privacidade_versao?: string | null
          retencao_logs_meses?: number | null
          termos_uso_versao?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dpo_email?: string | null
          dpo_nome?: string | null
          dpo_telefone?: string | null
          empresa_id?: string
          id?: string
          politica_privacidade_versao?: string | null
          retencao_logs_meses?: number | null
          termos_uso_versao?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_acesso: {
        Row: {
          aplicativos: Json
          ativo: boolean
          created_at: string
          descricao: string | null
          dominios: Json
          empresa_id: string
          id: string
          is_template: boolean
          nome: string
          portas: Json
          tipo: string
          updated_at: string
        }
        Insert: {
          aplicativos?: Json
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dominios?: Json
          empresa_id: string
          id?: string
          is_template?: boolean
          nome: string
          portas?: Json
          tipo?: string
          updated_at?: string
        }
        Update: {
          aplicativos?: Json
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dominios?: Json
          empresa_id?: string
          id?: string
          is_template?: boolean
          nome?: string
          portas?: Json
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempts: number | null
          blocked_until: string | null
          created_at: string | null
          id: string
          ip: unknown
          last_attempt: string | null
          mac: string
        }
        Insert: {
          attempts?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip: unknown
          last_attempt?: string | null
          mac: string
        }
        Update: {
          attempts?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip?: unknown
          last_attempt?: string | null
          mac?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          agrupar_enabled: boolean | null
          auto_resolver_enabled: boolean | null
          auto_resolver_horas: number | null
          created_at: string | null
          email_destinatarios: string[] | null
          email_enabled: boolean | null
          empresa_id: string | null
          escalacao_destinatarios: string[] | null
          escalacao_enabled: boolean | null
          escalacao_minutos: number | null
          id: string
          notificar_severidades: string[] | null
          updated_at: string | null
          webhook_enabled: boolean | null
          webhook_url: string | null
          whatsapp_enabled: boolean | null
          whatsapp_numeros: string[] | null
        }
        Insert: {
          agrupar_enabled?: boolean | null
          auto_resolver_enabled?: boolean | null
          auto_resolver_horas?: number | null
          created_at?: string | null
          email_destinatarios?: string[] | null
          email_enabled?: boolean | null
          empresa_id?: string | null
          escalacao_destinatarios?: string[] | null
          escalacao_enabled?: boolean | null
          escalacao_minutos?: number | null
          id?: string
          notificar_severidades?: string[] | null
          updated_at?: string | null
          webhook_enabled?: boolean | null
          webhook_url?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_numeros?: string[] | null
        }
        Update: {
          agrupar_enabled?: boolean | null
          auto_resolver_enabled?: boolean | null
          auto_resolver_horas?: number | null
          created_at?: string | null
          email_destinatarios?: string[] | null
          email_enabled?: boolean | null
          empresa_id?: string | null
          escalacao_destinatarios?: string[] | null
          escalacao_enabled?: boolean | null
          escalacao_minutos?: number | null
          id?: string
          notificar_severidades?: string[] | null
          updated_at?: string | null
          webhook_enabled?: boolean | null
          webhook_url?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_numeros?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_velocidade: {
        Row: {
          created_at: string
          descricao: string | null
          empresa_id: string
          herdar_regras_empresa: boolean
          id: string
          limite_dados_mb: number | null
          max_dispositivos: number
          modo_acesso: string
          nome: string
          prioridade: number
          quota_periodo: string
          session_timeout_minutos: number | null
          tipo_usuario: string
          velocidade_download: string
          velocidade_upload: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          empresa_id: string
          herdar_regras_empresa?: boolean
          id?: string
          limite_dados_mb?: number | null
          max_dispositivos?: number
          modo_acesso?: string
          nome: string
          prioridade?: number
          quota_periodo?: string
          session_timeout_minutos?: number | null
          tipo_usuario?: string
          velocidade_download?: string
          velocidade_upload?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          herdar_regras_empresa?: boolean
          id?: string
          limite_dados_mb?: number | null
          max_dispositivos?: number
          modo_acesso?: string
          nome?: string
          prioridade?: number
          quota_periodo?: string
          session_timeout_minutos?: number | null
          tipo_usuario?: string
          velocidade_download?: string
          velocidade_upload?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_velocidade_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      regras_acesso: {
        Row: {
          acao: string
          ativo: boolean
          created_at: string
          dias_semana: Json
          empresa_id: string
          horario_fim: string | null
          horario_inicio: string | null
          hotspot_id: string | null
          id: string
          lista_id: string
          mac_address: string | null
          perfil_id: string | null
          prioridade: number
          tripulante_id: string | null
        }
        Insert: {
          acao?: string
          ativo?: boolean
          created_at?: string
          dias_semana?: Json
          empresa_id: string
          horario_fim?: string | null
          horario_inicio?: string | null
          hotspot_id?: string | null
          id?: string
          lista_id: string
          mac_address?: string | null
          perfil_id?: string | null
          prioridade?: number
          tripulante_id?: string | null
        }
        Update: {
          acao?: string
          ativo?: boolean
          created_at?: string
          dias_semana?: Json
          empresa_id?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          hotspot_id?: string | null
          id?: string
          lista_id?: string
          mac_address?: string | null
          perfil_id?: string | null
          prioridade?: number
          tripulante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_acesso_hotspot_id_fkey"
            columns: ["hotspot_id"]
            isOneToOne: false
            referencedRelation: "hotspots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_acesso_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_acesso_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_velocidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_acesso_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      sessoes_wifi: {
        Row: {
          bytes_in: number
          bytes_out: number
          created_at: string
          dispositivo_id: string | null
          fim: string | null
          hotspot_id: string
          id: string
          inicio: string
          ip_address: unknown
          mac_address: string | null
          status: string
          tripulante_id: string
        }
        Insert: {
          bytes_in?: number
          bytes_out?: number
          created_at?: string
          dispositivo_id?: string | null
          fim?: string | null
          hotspot_id: string
          id?: string
          inicio?: string
          ip_address?: unknown
          mac_address?: string | null
          status?: string
          tripulante_id: string
        }
        Update: {
          bytes_in?: number
          bytes_out?: number
          created_at?: string
          dispositivo_id?: string | null
          fim?: string | null
          hotspot_id?: string
          id?: string
          inicio?: string
          ip_address?: unknown
          mac_address?: string | null
          status?: string
          tripulante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_wifi_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "dispositivos_registrados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_wifi_hotspot_id_fkey"
            columns: ["hotspot_id"]
            isOneToOne: false
            referencedRelation: "hotspots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_wifi_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_lgpd: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          created_at: string | null
          dados_exportados: Json | null
          descricao: string | null
          id: string
          prazo_legal: string | null
          resposta: string | null
          status: string | null
          tipo: string
          tripulante_id: string | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          created_at?: string | null
          dados_exportados?: Json | null
          descricao?: string | null
          id?: string
          prazo_legal?: string | null
          resposta?: string | null
          status?: string | null
          tipo: string
          tripulante_id?: string | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          created_at?: string | null
          dados_exportados?: Json | null
          descricao?: string | null
          id?: string
          prazo_legal?: string | null
          resposta?: string | null
          status?: string | null
          tipo?: string
          tripulante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_lgpd_tripulante_id_fkey"
            columns: ["tripulante_id"]
            isOneToOne: false
            referencedRelation: "tripulantes"
            referencedColumns: ["id"]
          },
        ]
      }
      tripulantes: {
        Row: {
          bloqueado_at: string | null
          bloqueado_por: string | null
          bloqueio_motivo: string | null
          bytes_consumidos: number
          cargo: string | null
          config_personalizada: Json | null
          cpf: string | null
          created_at: string
          email: string | null
          embarcacao_id: string
          id: string
          login_wifi: string
          nome: string
          perfil_id: string | null
          quota_reset_at: string | null
          senha_wifi: string
          status: string
          ultimo_login: string | null
          updated_at: string
        }
        Insert: {
          bloqueado_at?: string | null
          bloqueado_por?: string | null
          bloqueio_motivo?: string | null
          bytes_consumidos?: number
          cargo?: string | null
          config_personalizada?: Json | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          embarcacao_id: string
          id?: string
          login_wifi: string
          nome: string
          perfil_id?: string | null
          quota_reset_at?: string | null
          senha_wifi: string
          status?: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Update: {
          bloqueado_at?: string | null
          bloqueado_por?: string | null
          bloqueio_motivo?: string | null
          bytes_consumidos?: number
          cargo?: string | null
          config_personalizada?: Json | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          embarcacao_id?: string
          id?: string
          login_wifi?: string
          nome?: string
          perfil_id?: string | null
          quota_reset_at?: string | null
          senha_wifi?: string
          status?: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tripulantes_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tripulantes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_velocidade"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          embarcacao_id: string | null
          empresa_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          embarcacao_id?: string | null
          empresa_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          embarcacao_id?: string | null
          empresa_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_embarcacao_id_fkey"
            columns: ["embarcacao_id"]
            isOneToOne: false
            referencedRelation: "embarcacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_logs: { Args: never; Returns: undefined }
      get_user_embarcacao_id: { Args: { _user_id: string }; Returns: string }
      get_user_embarcacao_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_empresa_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "empresa_admin" | "gerente_embarcacao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "empresa_admin", "gerente_embarcacao"],
    },
  },
} as const
