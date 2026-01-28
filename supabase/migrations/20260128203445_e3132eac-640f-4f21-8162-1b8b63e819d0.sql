-- Adicionar campo wan_type para diferenciar DHCP de PPPoE
ALTER TABLE hotspots ADD COLUMN wan_type text NOT NULL DEFAULT 'dhcp';

-- Documentação
COMMENT ON COLUMN hotspots.wan_type IS 'Tipo de conexao WAN: dhcp ou pppoe';