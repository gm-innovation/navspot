

# Fix WiFi Security — Remover WPA para habilitar captive portal

## Diagnóstico

A infraestrutura está correta (bridge, datapath, hotspot, DHCP), mas os rádios WiFi ainda usam autenticação WPA2/WPA3 com passphrase. Isso permite que os clientes se conectem diretamente ao WiFi sem passar pelo captive portal do hotspot.

Para que o hotspot intercepte o tráfego e exiba a tela de login, o WiFi precisa ser **aberto** (sem autenticação).

## Mudança

### Template `infra` — Adicionar reset de segurança WiFi

Após atribuir o datapath nomeado, adicionar comandos para:
1. Remover autenticação WPA2/WPA3 das interfaces wifi1 e wifi2
2. Definir SSID com o nome da embarcação (placeholder `{{EMBARCACAO_NOME}}`)

```routeros
# Dentro do foreach das interfaces wifi, após datapath e enable:
:do { /interface wifi set $w security.authentication-types="" } on-error={}
:do { /interface wifi set $w security.passphrase="" } on-error={}
:do { /interface wifi set $w configuration.ssid="{{EMBARCACAO_NOME}}" } on-error={}
```

### Template `sync-standalone` — Mesma correção com escaping triplo

### Arquivos modificados
- SQL UPDATE no template `infra`
- SQL UPDATE no template `sync-standalone` (rebuild do installer)
- `.lovable/plan.md` atualizado

