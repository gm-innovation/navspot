

# Plano: Verificação Técnica Pré-Go-Live - Portal Cativo

## Resumo

Checklist técnico detalhado para validar os riscos identificados antes de colocar o sistema em produção. Cada item inclui a verificação necessária, o que fazer se falhar, e onde implementar correções.

---

## 1. Escape/Encoding do Template .rsc

### Status Atual
**PROBLEMA IDENTIFICADO**: O script-generator atual (linha 616) **NÃO** implementa o escape duplo para variáveis MikroTik.

```typescript
// ATUAL (INCORRETO para portal externo):
/ip hotspot profile add name="hsprof-navspot" ... login-by=http-pap

// NECESSÁRIO (v6.9.13):
login-url="https://navspot.lovable.app/hotspot-login?h=${hotspot.id}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
```

### Correção Necessária
**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Alterar linha 616 para:
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspot.id}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)`

/ip hotspot profile add name="hsprof-navspot" \\
  hotspot-address=${gateway} \\
  dns-name="${dnsName}" \\
  login-by=http-pap,http-chap \\
  html-directory="" \\
  login-url="${loginUrl}"
```

**Observação crítica**: O `\\$(mac)` em TypeScript produz `\$(mac)` no arquivo .rsc, que o RouterOS interpreta como variável em runtime.

### Teste de Validação
1. Gerar script para um hotspot de teste
2. Inspecionar o .rsc gerado e confirmar que contém `\$(mac)` (com UMA barra)
3. Importar no MikroTik e verificar em `/ip hotspot profile print` que a URL aparece com `$(mac)` expandido

---

## 2. Tamanho da URL / Encoding

### Risco
O parâmetro `link-login-only` pode conter URLs longas como:
```
http://192.168.88.1/login?dst=http://www.google.com/search?q=teste+longo&hl=pt-BR
```

### Status Atual
O MikroTik passa o valor bruto sem encoding. O portal precisa tratar.

### Correção Necessária
**Arquivo:** `src/pages/HotspotLogin.tsx` (a ser criado)

```typescript
// Extrair parâmetros com fallback seguro
const searchParams = new URLSearchParams(window.location.search);
const hotspotId = searchParams.get('h') || '';
const mac = searchParams.get('mac') || '';
const ip = searchParams.get('ip') || '';
const linkLoginOnly = searchParams.get('link-login-only') || '';

// Validar tamanho máximo
if (linkLoginOnly.length > 2048) {
  console.warn('link-login-only truncated');
}
```

### Teste de Validação
1. Acessar portal com URL longa em `link-login-only`
2. Verificar que o parâmetro é extraído corretamente
3. Verificar que o redirect funciona após login

---

## 3. HTTPS & Captive Portal Detection

### Status Atual (Walled Garden)
O script atual (linhas 620-628) **NÃO** inclui os domínios de Captive Portal Detection.

### Correção Necessária
**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Adicionar após linha 627:
```routeros
# Portal externo NAVSPOT
/ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
/ip hotspot walled-garden add dst-host="*.lovable.app" action=allow comment="navspot-portal"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-api"
/ip hotspot walled-garden add dst-host="*.supabase.in" action=allow comment="navspot-api"

# CDNs para logos
/ip hotspot walled-garden add dst-host="*.cloudfront.net" action=allow comment="navspot-cdn"
/ip hotspot walled-garden add dst-host="*.amazonaws.com" action=allow comment="navspot-cdn"

# Captive Portal Detection (CRÍTICO para UX mobile)
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-android"
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-android"
/ip hotspot walled-garden add dst-host="*.msftconnecttest.com" action=allow comment="navspot-windows"
/ip hotspot walled-garden add dst-host="*.msftncsi.com" action=allow comment="navspot-windows"
/ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="navspot-apple"
/ip hotspot walled-garden add dst-host="*.apple.com" action=allow comment="navspot-apple"
```

### Documentação para Suporte
Criar artigo de troubleshooting:
- "O portal não abre automaticamente" → Verificar Walled Garden
- "Aviso de segurança no navegador" → Explicar que HTTPS interceptado é normal, usar http://neverssl.com para teste

---

## 4. Walled Garden por Wildcard vs IP

### Risco
Wildcards dependem do header `Host`. Se o cliente acessa por IP direto ou CDN diferente, pode falhar.

### Verificação Necessária
1. Confirmar domínios usados pela Lovable:
   - `*.lovable.app` (preview e produção)
   - API: `focqrhkozhdefohroqyi.supabase.co`

2. Verificar se Edge Functions estão acessíveis via Walled Garden:
   - `*.supabase.co` cobre o endpoint

### Correção Opcional (Fallback por IP)
Se houver problemas, adicionar IPs conhecidos:
```routeros
/ip hotspot walled-garden ip add dst-address=104.18.0.0/16 action=accept comment="navspot-lovable-ip"
```

---

## 5. Rate Limiting & Bloqueio Temporário

### Status Atual
**NÃO IMPLEMENTADO** no código existente.

### Implementação Necessária
**Arquivo:** `supabase/functions/hotspot-login/index.ts` (a ser criado)

```typescript
// Tabela de rate limiting (usar Supabase para persistência)
interface LoginAttempt {
  ip: string;
  mac: string;
  attempts: number;
  blocked_until: string | null;
  last_attempt: string;
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 15;

async function checkRateLimit(supabase, ip: string, mac: string): Promise<{allowed: boolean, remaining: number}> {
  // Buscar ou criar registro
  const { data } = await supabase
    .from('login_attempts')
    .select('*')
    .eq('ip', ip)
    .eq('mac', mac)
    .maybeSingle();
  
  const now = new Date();
  
  // Se bloqueado, verificar se expirou
  if (data?.blocked_until && new Date(data.blocked_until) > now) {
    return { allowed: false, remaining: 0 };
  }
  
  // Reset se última tentativa > 15 min atrás
  const lastAttempt = data?.last_attempt ? new Date(data.last_attempt) : null;
  const shouldReset = !lastAttempt || (now.getTime() - lastAttempt.getTime()) > BLOCK_DURATION_MINUTES * 60 * 1000;
  
  const attempts = shouldReset ? 1 : (data?.attempts || 0) + 1;
  
  // Bloquear se excedeu
  if (attempts > MAX_ATTEMPTS) {
    const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_MINUTES * 60 * 1000);
    await supabase.from('login_attempts').upsert({
      ip, mac, attempts, blocked_until: blockedUntil.toISOString(), last_attempt: now.toISOString()
    });
    return { allowed: false, remaining: 0 };
  }
  
  // Atualizar contador
  await supabase.from('login_attempts').upsert({
    ip, mac, attempts, blocked_until: null, last_attempt: now.toISOString()
  });
  
  return { allowed: true, remaining: MAX_ATTEMPTS - attempts };
}
```

### Migration Necessária
```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip inet NOT NULL,
  mac text NOT NULL,
  attempts integer DEFAULT 0,
  blocked_until timestamptz,
  last_attempt timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(ip, mac)
);

-- Limpar registros antigos (job periódico)
CREATE INDEX idx_login_attempts_last ON login_attempts(last_attempt);
```

---

## 6. Segurança de Tokens / Logs

### Status Atual
**PARCIALMENTE IMPLEMENTADO** - `maskToken()` existe em `mikrotik-recovery-download` (linha 18-21).

### Verificação Necessária
Confirmar que `sync_token` NUNCA aparece completo em logs:

**Arquivo:** `mikrotik-sync/index.ts` - linha 395
```typescript
// ATUAL (pode logar token):
console.log('[mikrotik-sync] Received sync request:', JSON.stringify(payload))

// CORRIGIR para:
const safePayload = { ...payload, sync_token: maskToken(payload.sync_token) };
console.log('[mikrotik-sync] Received sync request:', JSON.stringify(safePayload))
```

**Arquivo:** `mikrotik-script-generator/index.ts` - linha 633
```typescript
// O token é escrito no script (correto - vai para arquivo local no MikroTik)
// Mas NUNCA logar o valor
:local tokenValue "${hotspot.sync_token}"  // OK - vai para .rsc
```

---

## 7. Consentimento LGPD

### Status Atual
**PARCIALMENTE IMPLEMENTADO** - Tabela `consentimentos` existe com estrutura correta:
- `tripulante_id`, `tipo`, `versao`, `aceito`, `aceito_em`, `ip_address`, `user_agent`

### Verificação Necessária

1. **Página CompletarCadastro.tsx** (linhas 194-218):
   - ✅ Checkbox para Termos de Uso
   - ✅ Checkbox para Política de Privacidade
   - ❌ **FALTA**: Salvar no `consentimentos` com versão

2. **Edge Function `tripulante-self-register`**:
   - Verificar se registra em `consentimentos`

### Correção Necessária
**Arquivo:** `supabase/functions/tripulante-self-register/index.ts`

Após criar/atualizar tripulante:
```typescript
// Registrar consentimentos
if (aceite_termos) {
  await supabase.from('consentimentos').insert({
    tripulante_id: tripulante.id,
    tipo: 'termos_uso',
    versao: 'v1.0', // Buscar de lgpd_config
    aceito: true,
    ip_address: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent')
  });
}

if (aceite_privacidade) {
  await supabase.from('consentimentos').insert({
    tripulante_id: tripulante.id,
    tipo: 'politica_privacidade',
    versao: 'v1.0',
    aceito: true,
    ip_address: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent')
  });
}
```

### Mecanismo de Revogação
**Necessário criar endpoint e UI:**
- Endpoint: `POST /functions/v1/lgpd-revoke-consent`
- UI: Botão na área do tripulante ou via solicitação LGPD

---

## 8. Sessões Fantasma / Shared-Users

### Status Atual
O hotspot profile (linha 616) não define `shared-users` ou `keepalive`.

### Correção Necessária
```routeros
/ip hotspot profile set [find name="hsprof-navspot"] \\
  keepalive-timeout=2m \\
  idle-timeout=5m \\
  session-timeout=none
```

**Nota**: `shared-users` é definido por perfil de velocidade, não no hotspot profile.

### Verificação
- Confirmar que `max_dispositivos` do perfil reflete em `shared-users`
- Testar desconexão após inatividade

---

## 9. Monitoramento / Alertas

### Status Atual
**PARCIALMENTE IMPLEMENTADO** - Alertas existem para:
- ✅ `hotspot_offline` (resolvido quando volta online)
- ✅ `quota_exceeded`, `quota_warning`
- ✅ `device_limit`, `device_sharing`
- ✅ `blocked_device_attempt`

### Alertas Faltantes

1. **Sincronização ausente > X minutos**
   - Já existe verificação em `mikrotik-sync` quando `status = offline`
   - **FALTA**: Job agendado para detectar hotspots que não sincronizaram

2. **Guardian falhando**
   - Guardian loga erros mas não cria alerta no banco
   - **Opção**: Criar endpoint para guardian reportar falhas

3. **Backend 5xx spikes**
   - Implementar via Lovable Cloud logs ou serviço externo (Sentry, LogFlare)

### Implementação Sugerida
```sql
-- Job para detectar hotspots offline
CREATE OR REPLACE FUNCTION check_offline_hotspots()
RETURNS void AS $$
BEGIN
  INSERT INTO alertas (tipo, severidade, mensagem, hotspot_id, embarcacao_id)
  SELECT 
    'hotspot_offline',
    'critical',
    'Hotspot sem sincronização há mais de 10 minutos: ' || h.nome,
    h.id,
    h.embarcacao_id
  FROM hotspots h
  WHERE h.status = 'online'
    AND h.ultima_sincronizacao < now() - interval '10 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM alertas a 
      WHERE a.hotspot_id = h.id 
        AND a.tipo = 'hotspot_offline' 
        AND a.resolvido = false
    );
  
  -- Marcar como offline
  UPDATE hotspots SET status = 'offline'
  WHERE status = 'online'
    AND ultima_sincronizacao < now() - interval '10 minutes';
END;
$$ LANGUAGE plpgsql;
```

---

## 10. Rollback / Fallback

### Status Atual
**IMPLEMENTADO** - Sistema de auto-recuperação completo:
- ✅ `navspot-guardian` verifica integridade a cada 10 min
- ✅ `mikrotik-recovery-download` gera script de reparo
- ✅ Padrão set-or-add (nunca remove antes de adicionar)

### Testes Necessários

1. **Teste de Recuperação Parcial**
   - Remover script `navspot-sync` manualmente
   - Aguardar 10 min
   - Verificar que guardian restaurou

2. **Teste de Recovery Download**
   - Chamar `POST /functions/v1/mikrotik-recovery-download` com `sync_token`
   - Importar script gerado
   - Confirmar que não quebra configurações existentes

3. **Teste de Falha de Energia Simulada**
   - Interromper importação do bootstrap no meio
   - Re-executar
   - Confirmar idempotência (sem duplicações)

---

## Matriz de Prioridades

| # | Item | Impacto | Esforço | Prioridade |
|---|------|---------|---------|------------|
| 1 | Escape variáveis MikroTik | CRÍTICO | Baixo | **P0** |
| 3 | Walled Garden (CPD + Lovable) | CRÍTICO | Baixo | **P0** |
| 6 | Mascarar sync_token em logs | Alto | Baixo | **P1** |
| 7 | Registro consentimento LGPD | Alto | Médio | **P1** |
| 5 | Rate limiting | Alto | Médio | **P1** |
| 2 | URL encoding | Médio | Baixo | **P2** |
| 4 | Walled Garden IP fallback | Baixo | Baixo | **P2** |
| 8 | Shared-users/keepalive | Médio | Baixo | **P2** |
| 9 | Alertas adicionais | Médio | Médio | **P3** |
| 10 | Testes de rollback | Alto | Médio | **P3** |

---

## Próximos Passos

1. **Implementar P0** (bloqueantes):
   - Corrigir escape de variáveis no script generator
   - Adicionar Walled Garden completo (portal + CPD)

2. **Implementar P1** (antes do go-live):
   - Rate limiting com tabela de tentativas
   - Registro de consentimentos LGPD
   - Mascarar tokens em logs

3. **Validar**:
   - Testar em dispositivo Android, iOS e Windows
   - Verificar fluxo completo: WiFi → Portal → Cadastro → Autorização

4. **Documentar**:
   - Guia de troubleshooting para suporte
   - Comportamento esperado de HTTPS redirect

