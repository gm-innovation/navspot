-- v7.0: Flag para detectar primeiro sync
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS initial_config_sent BOOLEAN DEFAULT false;

COMMENT ON COLUMN hotspots.initial_config_sent IS 
  'v7.0: Flag que indica se a configuracao inicial foi enviada via sync. 
   Quando false, mikrotik-sync injeta configure_hotspot_profile + walled-garden essencial.';