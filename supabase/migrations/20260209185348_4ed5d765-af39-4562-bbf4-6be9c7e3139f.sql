ALTER TABLE public.hotspots 
  ADD COLUMN IF NOT EXISTS telemetry_failures integer NOT NULL DEFAULT 0;