
# Plano: Correção v7.1.45 - login-by="cookie,http-pap" com Comandos Separados

## Problema Identificado

Analisando os logs, a ação `configure_hotspot_profile` está sendo processada, mas o comando atual:
```routeros
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap
```

Tem dois problemas:
1. **`http-pap` sozinho não é valor completo** - RouterOS espera lista de métodos
2. **Comando muito longo** - URL extensa pode causar problemas de parsing

## Solução: Mudança Cirúrgica

### Separar comandos e adicionar aspas + cookie:

```routeros
# Antes (linha única, sem cookie, sem aspas):
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap

# Depois (duas linhas, com cookie, com aspas):
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
/ip hotspot profile set $hp login-by="cookie,http-pap"
:log info ("NAVSPOT: login-by=cookie,http-pap aplicado em ".[/ip hotspot profile get $hp name])
```

---

## Arquivos Modificados

### 1. supabase/functions/mikrotik-scripts/index.ts

| Linha | Mudança |
|-------|---------|
| 38 | `VERSION = "7.1.44"` → `VERSION = "7.1.45"` |
| 851-865 | Action Processor CORE - separar comando login-by |
| 959-973 | Action Processor FULL - separar comando login-by |

**Código CORE (linhas 851-867) - DEPOIS:**
```routeros
:if ($c="configure_hotspot_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:if (([:len $lu]>0)&&([:len $dn]>0)) do={
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
/ip hotspot profile set $hp login-by="cookie,http-pap"
:log info ("NAVSPOT: login-by=cookie,http-pap aplicado em ".[/ip hotspot profile get $hp name])
:set cnt ($cnt+1)
}}}} on-error={}}
```

**Código FULL (linhas 959-975) - Mesma estrutura**

### 2. supabase/functions/mikrotik-sync/index.ts

| Linha | Mudança |
|-------|---------|
| 8-9 | Comentário + `VERSION = "7.1.45"` |
| 11-12 | `REQUIRED_PORTAL_VERSION = "7.1.45-http-pap"` |

### 3. supabase/functions/mikrotik-script-generator/index.ts

| Linha | Mudança |
|-------|---------|
| 8 | `VERSION = "7.1.45"` |

### 4. src/pages/Embarcacoes.tsx

| Linha | Mudança |
|-------|---------|
| 67 | `currentScriptVersion = "7.1.45"` |

### 5. Migration SQL (Automática)

```sql
-- v7.1.45: Force reconfigure with cookie,http-pap
UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;
```

---

## Por que essa correção funciona?

1. **Aspas ao redor de "cookie,http-pap"**: Garante que o RouterOS trate como argumento único
2. **cookie + http-pap**: Permite sessões persistentes via cookie E autenticação PAP (sem CHAP)
3. **Comandos separados**: Evita problemas de parsing quando a URL é muito longa
4. **Log de confirmação**: Prova que o comando foi executado com sucesso

---

## Fluxo Após Deploy

```text
1. Migration reseta portal_profile_version = NULL

2. MikroTik faz sync (a cada 1 minuto)
   |-- Backend detecta: portal_profile_version != "7.1.45-http-pap"
   |-- Injeta: configure_hotspot_profile

3. Action-processor executa:
   |-- Linha 1: /ip hotspot profile set $hp login-url=$lu dns-name=$dn
   |-- Linha 2: /ip hotspot profile set $hp login-by="cookie,http-pap"
   |-- Log: "NAVSPOT: login-by=cookie,http-pap aplicado em hsprof-navspot"

4. Resultado:
   |-- login-by: cookie,http-pap (SEM http-chap!)
   |-- Login no portal funciona!
```

---

## Verificação no MikroTik

Após o deploy, execute:

```routeros
/log print where message~"login-by"
# Esperado: "NAVSPOT: login-by=cookie,http-pap aplicado em hsprof-navspot"

/ip hotspot profile print detail where name="hsprof-navspot"
# Esperado: login-by: cookie,http-pap
```

---

## Tempo Estimado

- Deploy das Edge Functions: ~30 segundos
- Migration automática: ~1 segundo
- Próximo sync do MikroTik: até 1 minuto
- **Correção aplicada automaticamente em ~2 minutos após aprovar**
