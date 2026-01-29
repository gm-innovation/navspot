-- Remove a constraint antiga
ALTER TABLE tripulantes DROP CONSTRAINT IF EXISTS tripulantes_status_check;

-- Adiciona a nova constraint com pendente_cadastro
ALTER TABLE tripulantes ADD CONSTRAINT tripulantes_status_check 
CHECK (status = ANY (ARRAY[
  'ativo'::text, 
  'bloqueado'::text, 
  'inativo'::text, 
  'pendente_cadastro'::text
]));