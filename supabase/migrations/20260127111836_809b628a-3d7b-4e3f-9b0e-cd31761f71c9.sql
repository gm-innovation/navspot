-- Remover campos redundantes de lgpd_config
-- (esses dados já existem na tabela empresas)
ALTER TABLE public.lgpd_config 
  DROP COLUMN IF EXISTS razao_social,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS endereco_sede;