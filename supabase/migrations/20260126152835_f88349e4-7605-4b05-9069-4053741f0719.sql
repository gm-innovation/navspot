-- Add new columns to dispositivos_registrados for device management
ALTER TABLE public.dispositivos_registrados 
ADD COLUMN IF NOT EXISTS embarcacao_id uuid REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS bloqueio_motivo text,
ADD COLUMN IF NOT EXISTS bloqueado_por uuid,
ADD COLUMN IF NOT EXISTS bloqueado_at timestamp with time zone;

-- Make tripulante_id nullable (for vessel equipment devices)
ALTER TABLE public.dispositivos_registrados 
ALTER COLUMN tripulante_id DROP NOT NULL;

-- Add a check constraint to ensure either tripulante_id or embarcacao_id is set
-- Using a trigger instead of CHECK constraint for flexibility
CREATE OR REPLACE FUNCTION public.validate_dispositivo_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tripulante_id IS NULL AND NEW.embarcacao_id IS NULL THEN
    RAISE EXCEPTION 'Um dispositivo deve pertencer a um tripulante ou embarcação';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS validate_dispositivo_ownership_trigger ON public.dispositivos_registrados;
CREATE TRIGGER validate_dispositivo_ownership_trigger
BEFORE INSERT OR UPDATE ON public.dispositivos_registrados
FOR EACH ROW
EXECUTE FUNCTION public.validate_dispositivo_ownership();

-- Create index for faster lookups by MAC and embarcacao
CREATE INDEX IF NOT EXISTS idx_dispositivos_embarcacao ON public.dispositivos_registrados(embarcacao_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_mac ON public.dispositivos_registrados(mac_address);

-- Add RLS policy for embarcacao devices (vessel equipment)
DROP POLICY IF EXISTS "Empresa admin access to embarcacao dispositivos" ON public.dispositivos_registrados;
CREATE POLICY "Empresa admin access to embarcacao dispositivos"
ON public.dispositivos_registrados
FOR ALL
USING (
  has_role(auth.uid(), 'empresa_admin'::app_role) 
  AND (
    embarcacao_id IN (
      SELECT e.id FROM embarcacoes e 
      WHERE e.empresa_id = get_user_empresa_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'empresa_admin'::app_role) 
  AND (
    embarcacao_id IN (
      SELECT e.id FROM embarcacoes e 
      WHERE e.empresa_id = get_user_empresa_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Gerente access to embarcacao dispositivos" ON public.dispositivos_registrados;
CREATE POLICY "Gerente access to embarcacao dispositivos"
ON public.dispositivos_registrados
FOR ALL
USING (
  has_role(auth.uid(), 'gerente_embarcacao'::app_role) 
  AND embarcacao_id = get_user_embarcacao_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'gerente_embarcacao'::app_role) 
  AND embarcacao_id = get_user_embarcacao_id(auth.uid())
);