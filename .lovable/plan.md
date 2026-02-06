
# Plano: Correção Robusta HTTP-PAP v7.1.42

## Diagnóstico Confirmado

O MikroTik continua com erro "password is not chap encrypted" porque:

1. **O handler `configure_hotspot_profile` procura apenas `hsprof-navspot`** (linha 859 e 964), mas o hotspot pode estar usando um profile com nome diferente
2. **A ação `configure_hotspot_profile` só é injetada em duas condições:**
   - `initial_config_sent = false` (primeiro sync)
   - Quando há `hasUserActions` e não há pending config (repair)
3. **Não há mecanismo de rollout forçado** para reaplicar configurações quando mudamos de `http-chap` para `http-pap`

---

## Solução em 4 Partes

### Parte 1: Handler `configure_hotspot_profile` Robusto (mikrotik-scripts)

Tornar o handler independente do nome do profile, buscando pelo profile usado pelo hotspot server chamado "navspot":

```text
ANTES (linhas 859-861 e 964-966):
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap

DEPOIS:
# Tenta encontrar o profile pelo hotspot server
:local hp ""
:local hs [/ip hotspot find name="navspot"]
:if ([:len $hs]>0) do={
:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]
}
# Fallback: buscar profile hsprof-navspot
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
# Fallback 2: buscar profile com login-url contendo navspot
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find where login-url~"navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap
:set cnt ($cnt+1)
}
```

**Nota importante sobre tamanho:** O CORE handler tem limite de ~2.9KB. A lógica extra adiciona ~150 bytes. Precisamos verificar se ainda cabe. Se não, usaremos versão compacta.

---

### Parte 2: Guardian Valida `login-by` (mikrotik-scripts)

Adicionar verificação no guardian (linha 1164) para detectar CHAP ativado e forçar repair:

```text
ADICIONAR após linha 1177:
# v7.1.42: Verificar se login-by contém http-chap (configuração errada)
:if ([:len $hsprof]>0) do={
:local loginBy [/ip hotspot profile get $hsprof login-by]
:if ([:find $loginBy "http-chap"]>=0) do={
:set needsRepair 1
:set missing ($missing."login-chap ")
}}
```

---

### Parte 3: Rollout Forçado via `portal_profile_version` (mikrotik-sync + migration)

#### 3a. Migration SQL
Adicionar coluna para controlar rollout:

```sql
ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS portal_profile_version text NULL;
```

#### 3b. Lógica em mikrotik-sync
Após linha 1044 (dentro do bloco `if (!hotspot.initial_config_sent)`), adicionar verificação:

```typescript
// v7.1.42: Rollout forçado de configuração
const REQUIRED_PORTAL_VERSION = "7.1.42-http-pap"
const currentPortalVersion = (hotspot as any).portal_profile_version || null

if (currentPortalVersion !== REQUIRED_PORTAL_VERSION) {
  console.log(`[mikrotik-sync] v7.1.42: Portal version mismatch (${currentPortalVersion} vs ${REQUIRED_PORTAL_VERSION}) - forcing reconfigure`)
  
  // Injetar configure_hotspot_profile no topo
  const hotspotSlug = hotspot.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
  const dnsName = `${hotspotSlug}.navspot.local`
  
  formattedActions.unshift({
    id: 'rollout-config-profile',
    type: 'configure_hotspot_profile',
    payload: { login_url: loginUrl, dns_name: dnsName }
  })
  
  // Atualizar versão após sucesso do sync
  await supabase
    .from('hotspots')
    .update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
    .eq('id', hotspot.id)
}
```

---

### Parte 4: Bump de Versão

| Arquivo | Versão Atual | Nova Versão |
|---------|--------------|-------------|
| mikrotik-scripts | 7.1.41 | 7.1.42 |
| mikrotik-sync | 7.1.29 | 7.1.42 |
| mikrotik-script-generator | 7.1.41 | 7.1.42 |
| Embarcacoes.tsx | 7.1.41 | 7.1.42 |

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/mikrotik-scripts/index.ts` | Modificar | Handler configure_hotspot_profile robusto (CORE + FULL), guardian com validação login-by, VERSION 7.1.42 |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Rollout forçado via portal_profile_version, VERSION 7.1.42 |
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar | VERSION 7.1.42 |
| `src/pages/Embarcacoes.tsx` | Modificar | VERSION 7.1.42 |
| Migration SQL | Criar | Adicionar coluna portal_profile_version |

---

## Fluxo de Correção Automática

```text
1. Deploy das Edge Functions
   └─ mikrotik-scripts, mikrotik-sync, mikrotik-script-generator

2. MikroTik faz sync periódico (a cada 5 min)
   └─ Backend detecta: portal_profile_version != "7.1.42-http-pap"
   └─ Injeta: configure_hotspot_profile no topo do pipe

3. MikroTik executa navspot-action-processor
   └─ Handler encontra profile (por server "navspot" ou fallback)
   └─ Aplica: login-by=http-pap (remove http-chap)

4. Próximo sync
   └─ Backend vê: portal_profile_version = "7.1.42-http-pap"
   └─ Não injeta mais (evita loop)

5. Guardian (a cada 15 min)
   └─ Verifica login-by do profile
   └─ Se ainda tiver http-chap, força recovery
```

---

## Workaround Manual Imediato

Para resolver **agora** enquanto implementamos:

```routeros
# 1. Identificar nome do profile usado pelo hotspot "navspot"
/ip hotspot print detail where name="navspot"
# Procurar campo "profile=..."

# 2. Corrigir login-by no profile identificado
/ip hotspot profile set [find name="NOME_DO_PROFILE"] login-by=http-pap

# 3. Verificar
/ip hotspot profile print detail where name="NOME_DO_PROFILE"
# Confirmar: login-by: http-pap
```

---

## Testes Pós-Deploy

| Teste | Comando/Ação | Resultado Esperado |
|-------|--------------|-------------------|
| Sync forçado | `/system script run navspot-sync` | Log mostra "rollout-config-profile" |
| Verificar profile | `/ip hotspot profile print detail` | login-by: http-pap |
| Login no portal | Conectar WiFi, entrar no portal | Autenticação bem sucedida |
| Guardian | `/system script run navspot-guardian` | "Sistema OK" (não força repair) |
| Verificar versão | Gerar script no modal | v7.1.42 |

---

## Rollback

Se algo der errado:

1. **Reverter no código:**
   - Remover lógica de rollout em mikrotik-sync
   - Reverter handler para buscar apenas `hsprof-navspot`

2. **Manual no MikroTik:**
```routeros
/ip hotspot profile set [find name~"navspot"] login-by=http-pap,http-chap
```

3. **Reset de rollout:**
```sql
UPDATE public.hotspots SET portal_profile_version = NULL;
```
