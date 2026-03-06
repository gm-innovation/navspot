

# Template Infra v8.0.0 — Regras de Ouro RouterOS 7 (Antigravity)

## Regras de ouro

> **NUNCA** usar `login-url` no RouterOS 7. Esta propriedade **não existe** como campo utilizável — o parser interpreta `login` como keyword e `-url` como subtração. O redirecionamento ao portal externo é feito via **file override** do `flash/hotspot/login.html` com meta-refresh.

> **NUNCA** usar variáveis (`$var`) dentro de listas inline `{$var;"literal";...}` no RouterOS 7. Usar `:toarray` com string CSV.

> **NUNCA** usar `set [find]` com propriedades hifenizadas (`http-cookie-lifetime`). Resolver o ID primeiro com `:local idx [find ...]`, depois `set $idx prop=val`.

## Padrão de Redirecionamento (File Override)

```routeros
# Aguardar hotspot daemon criar os arquivos no flash
:delay 4s

# Override dos arquivos HTML do hotspot com meta-refresh
/file set [find name="flash/hotspot/login.html"] contents="<html><head><meta http-equiv=\"refresh\" content=\"0; url=https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)\"></head><body>Redirecting...</body></html>"
/file set [find name="flash/hotspot/status.html"] contents="<html><head><meta http-equiv=\"refresh\" content=\"0; url=https://navspot.lovable.app/hotspot-success?mac=\$(mac)&username=\$(username)\"></head><body>Redirecting...</body></html>"
/file set [find name="flash/hotspot/logout.html"] contents="<html><head><meta http-equiv=\"refresh\" content=\"0; url=https://navspot.lovable.app/hotspot-logout\"></head><body>Logging out...</body></html>"
```

## Fluxo do Tripulante (sem QR Code)

```text
1. Tripulante conecta na rede WiFi da embarcação
2. MikroTik intercepta e exibe login.html (meta-refresh → portal externo)
3. Portal /hotspot-login: tripulante insere login + senha
4. Edge function hotspot-login verifica status:
   - pendente_cadastro → JSON com redirect_url para /completar-cadastro
   - ativo → HTML auto-post para gateway MikroTik (libera navegação)
5. Em /completar-cadastro: tripulante preenche dados pessoais (uma única vez)
6. Após cadastro: auto-login silencioso (trata HTML auto-post via document.write)
```

## Padrão Walled Garden (`:toarray`)

```routeros
:local hosts "cdn.jsdelivr.net,*.gstatic.com,*.googleapis.com,connectivitycheck.gstatic.com,*.navspot.com.br"
:if ([:len $supabaseHost] > 0) do={
  :set hosts ($supabaseHost . "," . $hosts)
}
:foreach d in=[:toarray $hosts] do={
  :do { /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot" } on-error={}
}
```

## Handlers do Sync (v8.0.0)

- `remove_user` — Remove usuário do hotspot
- `set_profile` — Cria/atualiza perfil com rate-limit
- `block_device` — Bloqueia MAC via ip-binding
- `enable_social_block` — Vincula address-list de bloqueio social ao perfil
- `enable_streaming_block` — Vincula address-list de bloqueio streaming ao perfil
- `disable_blocks` — Remove address-list do perfil
