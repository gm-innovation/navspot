-- Adicionar config_personalizada para configuração manual de dispositivos
ALTER TABLE dispositivos_registrados 
ADD COLUMN config_personalizada jsonb DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN dispositivos_registrados.config_personalizada IS 
  'Configuração personalizada: velocidade_download, velocidade_upload, limite_dados_mb, modo_acesso';