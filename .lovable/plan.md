

# Templates v7.9.24 — WiFi cycle + defconf disabled

## Correções v7.9.24

### 1. WiFi disable/enable cycle no foreach
- `disable $w` → `:delay 2s` → `set datapath/security/ssid` → `enable $w`
- Força re-associação dos clientes na bridge-navspot no WifiWave2

### 2. Desabilitar DHCP defconf
- `/ip dhcp-server disable [find name="defconf"]`
- Impede que clientes recebam IP 192.168.88.x da bridge padrão

### Arquivos modificados
- `script_templates.infra` — SQL UPDATE com cycle + defconf disable
- `gen7post/index.ts` — versão bumped para 7.9.24

### Próximos passos
- Regenerar scripts e reimportar infra.rsc no router
- Verificar que wifi1/wifi2 ficam em bridge-navspot após cycle
- Confirmar que moto-g14 recebe IP 10.10.10.x
