

# Diagnóstico: WiFi datapath não efetivou — phone ainda no defconf

## Evidências

Os logs confirmam:
- **infra v7.9.23 aplicado**: datapath=dp-navspot, WPA removido, SSID configurado
- **Sync v7.9.23 funcionando**: CSV corrigido (`default-trial,alexandre.silva,`)
- **Porém**: `active_users_csv` continua vazio
- **Log linha 769-770**: `defconf deassigned/assigned 192.168.88.252 for moto-g14` — o telefone CONTINUA recebendo IP do DHCP `defconf` (bridge padrão), não do `dhcp-navspot` (bridge-navspot)

## Causa raiz

Duas falhas combinadas:

1. **Datapath sem restart do rádio**: No WifiWave2, alterar o `datapath` de uma interface wifi que já está ativa **não toma efeito imediato**. É necessário `disable` → `delay` → `enable` para forçar a re-associação dos clientes na nova bridge.

2. **DHCP defconf ativo**: O DHCP server `defconf` na `bridge` padrão continua rodando e atribuindo IPs 192.168.88.x. Mesmo quando o wifi eventualmente migra para bridge-navspot, o defconf cria confusão — deve ser desabilitado.

## Correção no template `infra`

### Mudança 1: Reiniciar wifi após mudar datapath
```routeros
# Dentro do foreach wifi:
:do { /interface wifi disable $w } on-error={}
:delay 2s
:do { /interface wifi set $w datapath=dp-navspot } on-error={}
:do { /interface wifi set $w security.authentication-types="" } on-error={}
:do { /interface wifi set $w security.passphrase="" } on-error={}
:do { /interface wifi set $w configuration.ssid="{{EMBARCACAO_NOME}}" } on-error={}
:do { /interface wifi enable $w } on-error={}
```

### Mudança 2: Desabilitar DHCP defconf
```routeros
# Após configurar rede navspot, desabilitar defconf DHCP
:do { /ip dhcp-server disable [find name="defconf"] } on-error={}
```

### Arquivos modificados
- SQL UPDATE no template `infra` — disable/enable cycle + desabilitar defconf DHCP
- `.lovable/plan.md` atualizado

