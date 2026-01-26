-- Tabela para registrar histórico de status dos hotspots
CREATE TABLE public.hotspot_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'online', 'offline', 'alert'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER, -- calculado ao fechar
  reason TEXT, -- motivo da mudança
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_hotspot_status_history_hotspot ON hotspot_status_history(hotspot_id);
CREATE INDEX idx_hotspot_status_history_dates ON hotspot_status_history(started_at, ended_at);
CREATE INDEX idx_hotspot_status_history_status ON hotspot_status_history(status);

-- Enable RLS
ALTER TABLE public.hotspot_status_history ENABLE ROW LEVEL SECURITY;

-- RLS policies seguindo padrão existente
CREATE POLICY "Super admin full access to status_history"
ON public.hotspot_status_history
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Empresa admin access to own status_history"
ON public.hotspot_status_history
FOR SELECT
USING (
  has_role(auth.uid(), 'empresa_admin'::app_role) 
  AND hotspot_id IN (
    SELECT h.id FROM hotspots h
    JOIN embarcacoes e ON h.embarcacao_id = e.id
    WHERE e.empresa_id = get_user_empresa_id(auth.uid())
  )
);

CREATE POLICY "Gerente access to own embarcacao status_history"
ON public.hotspot_status_history
FOR SELECT
USING (
  has_role(auth.uid(), 'gerente_embarcacao'::app_role)
  AND hotspot_id IN (
    SELECT id FROM hotspots
    WHERE embarcacao_id = get_user_embarcacao_id(auth.uid())
  )
);

-- Função para registrar mudanças de status automaticamente
CREATE OR REPLACE FUNCTION public.log_hotspot_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o status mudou
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Fechar registro anterior
    UPDATE hotspot_status_history
    SET ended_at = now(),
        duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::INTEGER
    WHERE hotspot_id = NEW.id AND ended_at IS NULL;
    
    -- Criar novo registro
    INSERT INTO hotspot_status_history (hotspot_id, status, started_at)
    VALUES (NEW.id, NEW.status, now());
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para registrar mudanças
CREATE TRIGGER hotspot_status_change_trigger
  AFTER UPDATE OF status ON hotspots
  FOR EACH ROW
  EXECUTE FUNCTION log_hotspot_status_change();

-- Inicializar histórico para hotspots existentes
INSERT INTO hotspot_status_history (hotspot_id, status, started_at)
SELECT id, status, COALESCE(ultima_sincronizacao, created_at) 
FROM hotspots
WHERE id NOT IN (SELECT DISTINCT hotspot_id FROM hotspot_status_history);

-- Enable realtime for status history
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotspot_status_history;