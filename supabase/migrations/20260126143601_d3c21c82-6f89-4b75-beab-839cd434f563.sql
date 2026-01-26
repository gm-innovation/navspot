-- 1. Adicionar constraint UNIQUE em user_id (se não existir)
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- 2. Atribuir super_admin ao primeiro usuário existente
INSERT INTO user_roles (user_id, role)
VALUES ('66cb1864-4fe5-4a9d-98c8-535781f28c2d', 'super_admin')
ON CONFLICT (user_id) DO NOTHING;

-- 3. Trigger para atribuir super_admin ao primeiro usuário futuro (se tabela vazia)
CREATE OR REPLACE FUNCTION public.assign_first_user_as_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Criar trigger na tabela auth.users
DROP TRIGGER IF EXISTS on_first_user_created ON auth.users;
CREATE TRIGGER on_first_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_first_user_as_super_admin();