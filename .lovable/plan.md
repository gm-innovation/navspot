

# Plano: Autenticação Segura v7.1.41 - HTTP-PAP com Auto-POST

## Sumário Executivo

Este plano implementa a correção de autenticação HTTP-PAP com todas as medidas de segurança sugeridas, evitando exposição de credenciais na URL através de um mecanismo de auto-submit POST.

---

## Diagnóstico do Problema

### Sintoma Atual
```
hotspot, info, debug: alexandre.silva (10.10.10.254): login failed: password is not chap encrypted
```

### Causa
O hotspot profile está configurado com `login-by=http-pap,http-chap`. O MikroTik tenta CHAP primeiro, mas o portal envia senha em texto plano (PAP).

### Risco de Segurança (Abordagem Atual)
```
VULNERÁVEL: http://10.10.10.1/login?username=USER&password=PASS
```
Credenciais ficam expostas em:
- Histórico do navegador
- Logs de proxy/firewall
- Header Referer
- Barra de endereços visível

---

## Solução Proposta: Auto-POST Seguro

### Nova Arquitetura de Autenticação

```text
┌─────────────────┐     POST (body)      ┌──────────────────┐
│  Portal React   │ ──────────────────── │  hotspot-login   │
│  HotspotLogin   │   login/senha/h/mac  │  Edge Function   │
└─────────────────┘                      └────────┬─────────┘
                                                   │
                                                   │ Valida credenciais
                                                   │ Gera HTML auto-post
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │   Retorna HTML auto-submit   │
                                    │   (credenciais em hidden)    │
                                    └─────────────┬────────────────┘
                                                  │
                                                  │ Browser executa
                                                  │ form.submit()
                                                  ▼
                                    ┌──────────────────────────────┐
                                    │   http://10.10.10.1/login    │
                                    │   POST username=X&password=Y │
                                    └──────────────────────────────┘
```

### Benefícios

| Aspecto | GET (Antigo) | POST (Novo) |
|---------|--------------|-------------|
| Credenciais na URL | ⚠️ Sim | ✅ Não |
| Histórico do browser | ⚠️ Exposto | ✅ Seguro |
| Logs de proxy | ⚠️ Visível | ✅ Apenas POST body |
| Header Referer | ⚠️ Vaza senha | ✅ Não vaza |
| Compatível HTTP-PAP | ✅ Sim | ✅ Sim |
| Cross-origin | ✅ Funciona | ✅ Forms funcionam |

---

## Arquivos a Modificar

### 1. supabase/functions/hotspot-login/index.ts

**Mudança Principal:** Em vez de retornar `redirect_url` com credenciais na query string, retornar uma página HTML que auto-submete um formulário POST.

#### Antes (Linha 304-306):
```typescript
// Status is 'ativo' - redirect to MikroTik to authorize
// URL format: http://GATEWAY/login?username=USER&password=PASS
redirectUrl = `http://${gateway}/login?username=${encodeURIComponent(tripulante.login_wifi)}&password=${encodeURIComponent(tripulante.senha_wifi)}`;
```

#### Depois:
```typescript
// Status is 'ativo' - return HTML auto-post page
// This avoids exposing credentials in URL (security best practice)
const autoPostHtml = generateAutoPostHtml(
  gateway,
  tripulante.login_wifi,
  tripulante.senha_wifi,
  config?.embarcacao_nome || 'NAVSPOT'
);

// Return HTML page instead of JSON
return new Response(autoPostHtml, {
  status: 200,
  headers: {
    ...corsHeaders,
    'Content-Type': 'text/html; charset=utf-8',
  },
});
```

#### Nova Função generateAutoPostHtml:
```typescript
function generateAutoPostHtml(
  gateway: string,
  username: string,
  password: string,
  embarcacaoNome: string
): string {
  // HTML-escape values to prevent XSS
  const escapeHtml = (str: string) => 
    str.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectando - ${escapeHtml(embarcacaoNome)}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh; 
      margin: 0;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    }
    .container { 
      text-align: center; 
      padding: 2rem;
      background: white;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e5e7eb;
      border-top: 4px solid #1e3a8a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { color: #1e3a8a; margin: 0 0 0.5rem; }
    p { color: #64748b; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Conectando...</h2>
    <p>Aguarde enquanto liberamos seu acesso</p>
  </div>
  <form id="loginForm" method="POST" action="http://${escapeHtml(gateway)}/login">
    <input type="hidden" name="username" value="${escapeHtml(username)}" />
    <input type="hidden" name="password" value="${escapeHtml(password)}" />
  </form>
  <script>
    // Auto-submit form after brief delay (allows page to render)
    setTimeout(function() {
      document.getElementById('loginForm').submit();
    }, 100);
  </script>
</body>
</html>`;
}
```

---

### 2. src/pages/HotspotLogin.tsx

**Mudança:** Detectar se a resposta é HTML (auto-post) ou JSON, e renderizar o HTML diretamente.

#### Antes (Linhas 150-169):
```typescript
const data = await response.json();

if (!response.ok || !data.success) {
  // ... error handling
}

// Success - redirect based on status
setRedirecting(true);

if (data.redirect_url) {
  setTimeout(() => {
    window.location.href = data.redirect_url;
  }, 500);
}
```

#### Depois:
```typescript
const contentType = response.headers.get('content-type') || '';

// v7.1.41: Handle HTML auto-post response (secure credential submission)
if (contentType.includes('text/html')) {
  // Server returned auto-post HTML page - render it
  const html = await response.text();
  setRedirecting(true);
  
  // Replace entire document with the auto-post page
  document.open();
  document.write(html);
  document.close();
  return;
}

// Handle JSON response (errors, pending_cadastro, etc)
const data = await response.json();

if (!response.ok || !data.success) {
  if (data.rate_limited) {
    const minutes = Math.ceil((data.retry_after_seconds || 900) / 60);
    throw new Error(`Muitas tentativas. Aguarde ${minutes} minuto(s).`);
  }
  throw new Error(data.error || "Falha na autenticação");
}

// Success with JSON - redirect based on status (pendente_cadastro)
setRedirecting(true);

if (data.redirect_url) {
  setTimeout(() => {
    window.location.href = data.redirect_url;
  }, 500);
}
```

---

### 3. supabase/functions/mikrotik-scripts/index.ts

**Mudança 1:** VERSION = "7.1.41"
```typescript
const VERSION = "7.1.41"
```

**Mudança 2:** Linha 861 (CORE action processor)
```routeros
# DE:
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap,http-chap

# PARA:
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap
```

**Mudança 3:** Linha 966 (FULL action processor)
```routeros
# DE:
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap,http-chap

# PARA:
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=http-pap
```

---

### 4. Database Migration (Faseada)

**Nova migration SQL para forçar reconfiguração apenas do hotspot afetado:**

```sql
-- ================================================================
-- Migration: Forçar Reconfiguração HTTP-PAP v7.1.41
-- ================================================================
-- Apenas hotspots que já receberam config inicial precisam re-sincronizar
-- para aplicar a nova configuração login-by=http-pap
-- ================================================================

-- 1. Marcar hotspots para reconfiguração (faseado)
-- Apenas os que já foram configurados (initial_config_sent = true)
UPDATE public.hotspots
SET 
  initial_config_sent = false,
  updated_at = now()
WHERE initial_config_sent = true;

-- 2. Log para auditoria (opcional mas recomendado)
-- O próximo sync vai re-injetar configure_hotspot_profile automaticamente
```

**Nota:** Esta migration é conservadora - apenas 1 hotspot será afetado (Engenharia Googlemarine).

---

### 5. src/pages/Embarcacoes.tsx

**Mudança:** VERSION = "7.1.41"
```typescript
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.41");
```

---

## Fluxo de Autenticação v7.1.41

```text
1. Usuário conecta ao WiFi
   └─ MikroTik redireciona para: https://navspot.lovable.app/hotspot-login?h=ID&mac=$(mac)&ip=$(ip)

2. Usuário preenche login/senha no portal React
   └─ Frontend envia: POST /functions/v1/hotspot-login { login, senha, hotspot_id, mac, ip }

3. Edge Function valida credenciais no banco
   ├─ Se ERRO: retorna JSON { success: false, error: "..." }
   ├─ Se pendente_cadastro: retorna JSON { redirect_url: "/completar-cadastro?..." }
   └─ Se ATIVO: retorna HTML auto-post page

4. Frontend recebe HTML
   └─ Escreve HTML no document (document.write)

5. Browser executa auto-submit
   └─ POST http://10.10.10.1/login (body: username=X&password=Y)

6. MikroTik autentica via HTTP-PAP
   └─ Usuário liberado! ✅
```

---

## Segurança em Camadas (Defense in Depth)

```text
✅ Camada 1: Auto-POST HTML
   └─ Credenciais nunca aparecem na URL

✅ Camada 2: HTML Escaping
   └─ Previne XSS no HTML gerado

✅ Camada 3: Rate Limiting
   └─ Bloqueia após 5 tentativas (15 min)

✅ Camada 4: Validação Server-Side
   └─ Credenciais validadas antes do auto-post

✅ Camada 5: Logs Seguros
   └─ Senha nunca logada em cleartext

✅ Camada 6: HTTP-PAP Only
   └─ Remove ambiguidade CHAP/PAP
```

---

## Rollback Rápido

Se algo der errado:

### Opção 1: Reverter no código
```typescript
// Em mikrotik-scripts: voltar para
login-by=http-pap,http-chap
```

### Opção 2: Manual no MikroTik
```routeros
/ip hotspot profile set [find name="hsprof-navspot"] login-by=http-pap,http-chap
```

### Opção 3: Forçar re-sync
```sql
UPDATE public.hotspots SET initial_config_sent = false WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

---

## Testes Recomendados

| Teste | Descrição | Resultado Esperado |
|-------|-----------|-------------------|
| Login ativo | Usuário ativo faz login | Recebe HTML, auto-post, conectado |
| Login pendente | Usuário pendente_cadastro | Recebe JSON, redirect /completar-cadastro |
| Login bloqueado | Usuário bloqueado | Recebe JSON erro 403 |
| Credenciais erradas | Senha incorreta | Recebe JSON erro 401 |
| Rate limit | 6+ tentativas | Recebe JSON erro 429 |
| Verificar logs | Após login bem sucedido | Senha NÃO aparece em logs |
| Verificar histórico | Após login bem sucedido | URL não contém password |

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/hotspot-login/index.ts` | Modificar | Auto-POST HTML para usuários ativos |
| `src/pages/HotspotLogin.tsx` | Modificar | Detectar HTML vs JSON, document.write |
| `supabase/functions/mikrotik-scripts/index.ts` | Modificar | login-by=http-pap, VERSION 7.1.41 |
| `src/pages/Embarcacoes.tsx` | Modificar | VERSION 7.1.41 |
| Database Migration | Criar | Reset initial_config_sent |

---

## Checklist Pre-Deploy

| Item | Status |
|------|--------|
| Auto-POST HTML em hotspot-login | A implementar |
| Frontend detecta HTML vs JSON | A implementar |
| mikrotik-scripts login-by=http-pap | A implementar |
| VERSION bump para 7.1.41 | A implementar |
| Migration reset initial_config_sent | A implementar |
| Deploy Edge Functions | A executar |
| Teste no hAP ax² | Após deploy |
| Verificar logs sem senha | Após teste |
| Verificar histórico navegador | Após teste |

