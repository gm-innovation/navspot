-- Criar tabela gerente_embarcacoes para associar gerentes a múltiplas embarcações
CREATE TABLE public.gerente_embarcacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embarcacao_id uuid NOT NULL REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, embarcacao_id)
);

-- Enable RLS
ALTER TABLE public.gerente_embarcacoes ENABLE ROW LEVEL SECURITY;

-- Super admin: acesso total
CREATE POLICY "Super admin full access to gerente_embarcacoes"
ON public.gerente_embarcacoes FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Empresa admin: gerentes das embarcações da empresa
CREATE POLICY "Empresa admin access to gerente_embarcacoes"
ON public.gerente_embarcacoes FOR ALL
USING (
  has_role(auth.uid(), 'empresa_admin'::app_role) AND
  embarcacao_id IN (
    SELECT id FROM public.embarcacoes WHERE empresa_id = get_user_empresa_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'empresa_admin'::app_role) AND
  embarcacao_id IN (
    SELECT id FROM public.embarcacoes WHERE empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- Gerente: apenas visualizar próprias associações
CREATE POLICY "Gerente view own embarcacoes"
ON public.gerente_embarcacoes FOR SELECT
USING (user_id = auth.uid());

-- Migrar dados existentes de user_roles para nova tabela
INSERT INTO public.gerente_embarcacoes (user_id, embarcacao_id)
SELECT user_id, embarcacao_id 
FROM public.user_roles 
WHERE role = 'gerente_embarcacao' 
AND embarcacao_id IS NOT NULL
ON CONFLICT (user_id, embarcacao_id) DO NOTHING;

-- Criar função que retorna todas as embarcações do gerente
CREATE OR REPLACE FUNCTION public.get_user_embarcacao_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT embarcacao_id
  FROM public.gerente_embarcacoes
  WHERE user_id = _user_id
$$;