-- Adicionar campo wan_interface para especificar interface WAN explicitamente
-- Isso garante que o script NUNCA adicione a porta WAN na bridge

ALTER TABLE hotspots ADD COLUMN wan_interface text NOT NULL DEFAULT 'ether1';

-- Comentário para documentação
COMMENT ON COLUMN hotspots.wan_interface IS 'Interface WAN do MikroTik (ex: ether1, sfp1). NUNCA será adicionada à bridge.';