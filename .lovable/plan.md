

# Atualização dos Templates RSC (Gabarito Final) + Fix CompletarCadastro

## Contexto

Os três arquivos RSC enviados representam scripts testados e validados no hardware. A mudança arquitetural principal: o **infra** abandona completamente `login-url` (que não existe no RouterOS 7) e usa **override de `/file set flash/hotspot/login.html`** com meta-refresh para redirecionar ao portal externo.

## Mudanças

### 1. Atualizar template `infra` no banco

Converter o gabarito `navspot-infra-antigravity-v3.rsc` em template com placeholders:

- `10.10.10.1` → `{{GATEWAY}}`
- `10.10.10.0/24` → `{{NETWORK_CIDR}}`
- `10.10.10.10-10.10.10.254` → `{{POOL_START}}-{{POOL_END}}`
- `27a1e1be-...` → `{{HOTSPOT_ID}}`
- `"Teste Navspot"` → `{{EMBARCACAO_NOME}}`
- `focqrhkozhdefohroqyi.supabase.co` → `{{SUPABASE_HOST}}`
- Remover completamente `login-url` — usar `/file set` para override do `login.html`, `status.html` e `logout.html`
- WiFi config: manter aberto (sem passphrase) pois hotspot já controla acesso, ou parametrizar

### 2. Atualizar template `sync-standalone` no banco

Converter `navspot-sync-antigravity-v3.rsc`:

- `bba989...` → `{{SYNC_TOKEN}}`
- `focqrhkozhdefohroqyi.supabase.co` → `{{SUPABASE_HOST}}`
- Novos handlers: `set_profile`, `block_device`, `enable_social_block`, `enable_streaming_block`, `disable_blocks`
- Remover telemetria CSV (simplificado) — o gabarito envia apenas token+identity

### 3. Atualizar template `guardian-standalone` no banco

Converter `navspot-guardian-antigravity-v2.rsc`:

- `bba989...` → `{{SYNC_TOKEN}}`
- `focqrhkozhdefohroqyi.supabase.co` → `{{SUPABASE_HOST}}`
- Verificações: sync script, hotspot profile, firewall rules (sem verificar login-url)
- Recovery via `{{RECOVERY_URL}}`

### 4. Fix `CompletarCadastro.tsx` — tratar resposta HTML do auto-login

Após o self-register, o componente chama `hotspot-login` para auto-login. Para usuários `ativo`, a edge function retorna HTML (auto-post). Alterar para verificar `content-type` e usar `document.write()` para renderizar o HTML, igual ao `HotspotLogin.tsx` já faz.

### 5. Atualizar `navspot-recovery/index.ts`

Remover a seção "CORRIGIR LOGIN-BY" (linhas 206-215) que tenta setar `login-url` — não é mais necessário com a nova abordagem de file override.

### 6. Atualizar `.lovable/plan.md`

Documentar a nova arquitetura:
- Regra de ouro: `login-url` **não existe** como propriedade utilizável no RouterOS 7 — usar override de `flash/hotspot/login.html` via `/file set`
- Padrão de redirecionamento: meta-refresh no login.html

### 7. Atualizar versão no `gen7post`

Bump version para refletir a nova arquitetura.

## Decisão necessária

O gabarito infra usa WiFi com WPA2-PSK (`passphrase="123456789"`). O template atual usa rede aberta (o hotspot controla o acesso). Qual abordagem manter no template?

