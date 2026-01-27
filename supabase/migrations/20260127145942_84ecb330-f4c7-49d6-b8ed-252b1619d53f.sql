-- Adicionar perfil_id à tabela dispositivos_registrados
ALTER TABLE dispositivos_registrados 
ADD COLUMN perfil_id uuid REFERENCES perfis_velocidade(id) ON DELETE SET NULL;

-- Comentário para documentação
COMMENT ON COLUMN dispositivos_registrados.perfil_id IS 'Perfil de velocidade aplicado ao dispositivo';