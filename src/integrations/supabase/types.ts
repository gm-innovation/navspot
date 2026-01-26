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
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hotspots: {
        Row: {
          created_at: string
          embarcacao_id: string
          id: string
          interface_wifi: string
          max_usuarios: number | null
          nome: string
          rede: string
          script_gerado: string | null
          script_versao: number
          status: string
          sync_interval_minutes: number
          sync_token: string
          ultima_sincronizacao: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          embarcacao_id: string
          id?: string
          interface_wifi?: string
          max_usuarios?: number | null
          nome: string
          rede?: string
          script_gerado?: string | null
          script_versao?: number
          status?: string
          sync_interval_minutes?: number
          sync_token?: string
          ultima_sincronizacao?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          embarcacao_id?: string
          id?: string
          interface_wifi?: string
          max_usuarios?: number | null
          nome?: string
          rede?: string
          script_gerado?: string | null
          script_versao?: number
          status?: string
          sync_interval_minutes?: number
          sync_token?: string
          ultima_sincronizacao?: string | null
          updated_at?: string
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
      perfis_velocidade: {
        Row: {
          created_at: string
          descricao: string | null
          empresa_id: string
          id: string
          limite_dados_mb: number | null
          nome: string
          prioridade: number
          session_timeout_minutos: number | null
          velocidade_download: string
          velocidade_upload: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          limite_dados_mb?: number | null
          nome: string
          prioridade?: number
          session_timeout_minutos?: number | null
          velocidade_download?: string
          velocidade_upload?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          limite_dados_mb?: number | null
          nome?: string
          prioridade?: number
          session_timeout_minutos?: number | null
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
      sessoes_wifi: {
        Row: {
          bytes_in: number
          bytes_out: number
          created_at: string
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
      tripulantes: {
        Row: {
          bytes_consumidos: number
          cargo: string | null
          cpf: string | null
          created_at: string
          email: string | null
          embarcacao_id: string
          id: string
          login_wifi: string
          nome: string
          perfil_id: string | null
          senha_wifi: string
          status: string
          ultimo_login: string | null
          updated_at: string
        }
        Insert: {
          bytes_consumidos?: number
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          embarcacao_id: string
          id?: string
          login_wifi: string
          nome: string
          perfil_id?: string | null
          senha_wifi: string
          status?: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Update: {
          bytes_consumidos?: number
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          embarcacao_id?: string
          id?: string
          login_wifi?: string
          nome?: string
          perfil_id?: string | null
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
      get_user_embarcacao_id: { Args: { _user_id: string }; Returns: string }
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
