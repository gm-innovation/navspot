
# Plano v6.9.20: Resiliência de Token + Botão Recovery no Painel

## Resumo Executivo

Implementar duas melhorias críticas para eliminar os problemas de recuperação do MikroTik:

1. **Token com Fallback Embutido**: Scripts `navspot-sync` e `navspot-guardian` terão o token hardcoded como fallback, funcionando mesmo se o arquivo `navspot-token.txt` estiver vazio/corrompido.

2. **Botão "Baixar Recovery"**: Interface no painel permitirá download do `navspot-recovery.rsc` com autenticação, sem precisar copiar token manualmente.

---

## Arquivos a Modificar

| Arquivo | Operação | Mudança Principal |
|---------|----------|-------------------|
| `supabase/functions/mikrotik-recovery-download/index.ts` | Editar | Suporte a `hotspot_id` autenticado + recriação automática do token + fallback embutido |
| `supabase/functions/mikrotik-script-generator/index.ts` | Editar | Fallback de token nos scripts sync/guardian + método RouterOS 6.x como padrão |
| `src/hooks/useHotspots.ts` | Editar | Adicionar hook `useDownloadRecoveryScript` |
| `src/components/modals/ScriptModal.tsx` | Editar | Botão "Baixar Recovery" + prop `hotspotId` |

---

## Mudanças Técnicas Detalhadas

### 1. mikrotik-recovery-download/index.ts

#### 1.1 Suporte a Autenticação por hotspot_id

```text
Antes:
- Aceita apenas sync_token (POST/GET)
- Não valida permissão de acesso

Depois:
- Aceita sync_token (fluxo atual - roteador)
- Aceita hotspot_id + JWT (novo fluxo - painel)
- Valida que o usuário tem acesso ao hotspot via empresa_id/embarcacao_id
```

Lógica de validação de permissão:

```typescript
// Se veio hotspot_id, validar JWT e permissão
if (hotspotId) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // Verificar se o usuário pode acessar este hotspot
  // - super_admin: acesso total
  // - empresa_admin: hotspot da sua empresa
  // - gerente_embarcacao: hotspot da sua embarcação
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role, empresa_id, embarcacao_id')
    .eq('user_id', claims.claims.sub)
    .single()
    
  if (userRole.role === 'super_admin') {
    // OK - acesso total
  } else if (userRole.role === 'empresa_admin') {
    // Verificar se o hotspot pertence à empresa do admin
    if (hotspot.embarcacoes.empresa_id !== userRole.empresa_id) {
      return new Response('Forbidden', { status: 403 })
    }
  } else {
    // gerente_embarcacao - verificar via gerente_embarcacoes
    const { data: access } = await supabase
      .from('gerente_embarcacoes')
      .select('embarcacao_id')
      .eq('user_id', claims.claims.sub)
      .eq('embarcacao_id', hotspot.embarcacoes.id)
      .single()
    
    if (!access) {
      return new Response('Forbidden', { status: 403 })
    }
  }
}
```

#### 1.2 Recriação do Token no Recovery (RouterOS 6.x compatível)

Passar o `syncToken` para `generateRecoveryScript()` e adicionar no início:

```routeros
# 0. RECRIAR TOKEN (metodo RouterOS 6.x compativel)
:log info "NAVSPOT-RECOVERY v6.9.20: Recriando token..."
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token where name="__never__"
:delay 1s
/file set [find name~"navspot-token"] contents="${syncToken}"
:log info "NAVSPOT-RECOVERY: Token recriado"
```

Os delays de `500ms` e `1s` são essenciais para dispositivos com flash lento (hAP lite).

#### 1.3 Fallback de Token nos Scripts Gerados

O script `navspot-sync` no recovery deve incluir fallback:

```routeros
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
  :set token "${syncToken}"
  :log warning "NAVSPOT: Usando token fallback embutido"
}
```

Como o token é alfanumérico hexadecimal (64 caracteres), não há risco de aspas quebrarem a sintaxe.

---

### 2. mikrotik-script-generator/index.ts

#### 2.1 Método RouterOS 6.x como Padrão (linhas 724-737)

```text
Antes:
- Tenta /file add primeiro (falha no RouterOS 6.x)
- Fallback para /file print + set

Depois:
- Usa /file print + set como PADRÃO (funciona em 6.x e 7.x)
- Remove tentativa de /file add
```

Novo código:

```routeros
# 9. TOKEN (metodo robusto - RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
:local tokenValue "${hotspot.sync_token}"
/file print file=navspot-token where name="__never__"
:delay 1s
/file set [find name~"navspot-token"] contents=$tokenValue
:log info "NAVSPOT: Token criado (metodo universal)"
:delay 500ms
```

#### 2.2 Fallback de Token no navspot-sync (linhas 242-294)

Adicionar no início do `syncScriptSource`:

```routeros
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
  :set token "${hotspot.sync_token}"
  :log warning "NAVSPOT-SYNC: Usando token fallback embutido"
}
```

#### 2.3 Verificação de Fallback no Guardian (linhas 560-568)

Adicionar verificação se o sync tem o fallback embutido:

```routeros
# v6.9.20: Check if sync has embedded token fallback
:if ($needsRepair = 0) do={
  :local syncSource [/system script get [find name="navspot-sync"] source]
  :if ([:find $syncSource "token fallback embutido"] < 0) do={
    :set needsRepair 1
    :set missing ($missing . "sync-outdated-no-fallback ")
    :log warning "NAVSPOT-GUARDIAN: sync desatualizado (falta fallback de token)"
  }
}
```

Isso garante que versões antigas do sync sejam atualizadas automaticamente.

#### 2.4 Atualizar Versão para v6.9.20

Atualizar todos os logs e comentários de `v6.9.19` para `v6.9.20`.

---

### 3. src/hooks/useHotspots.ts

Adicionar novo hook para download do recovery:

```typescript
export function useDownloadRecoveryScript() {
  return useMutation({
    mutationFn: async (hotspotId: string) => {
      const { data, error } = await supabase.functions.invoke('mikrotik-recovery-download', {
        body: { hotspot_id: hotspotId },
      });

      if (error) throw error;
      
      // O response é o script como texto
      if (typeof data === 'string') {
        return data;
      }
      
      // Se veio como objeto com script
      if (data?.script) {
        return data.script;
      }
      
      throw new Error('Formato de resposta inválido');
    },
    onSuccess: () => {
      toast({
        title: 'Script de recovery baixado',
        description: 'Arquivo navspot-recovery.rsc pronto para importar.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao baixar recovery',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
```

---

### 4. src/components/modals/ScriptModal.tsx

#### 4.1 Adicionar prop hotspotId

```typescript
interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrapScript: string;
  finalizeScript?: string;
  hotspotName: string;
  hotspotId?: string; // NOVO
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}
```

#### 4.2 Adicionar botão "Baixar Recovery"

Ao lado do botão "Regenerar Script", adicionar:

```tsx
import { useDownloadRecoveryScript } from "@/hooks/useHotspots";
import { RotateCcw } from "lucide-react"; // ícone de recovery

// Dentro do componente:
const downloadRecovery = useDownloadRecoveryScript();

const handleDownloadRecovery = async () => {
  if (!hotspotId) return;
  
  try {
    const script = await downloadRecovery.mutateAsync(hotspotId);
    
    // Download do arquivo
    const blob = new Blob([script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "navspot-recovery.rsc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    // Erro tratado pelo hook
  }
};

// No JSX, adicionar botão:
{hotspotId && (
  <Button
    variant="outline"
    onClick={handleDownloadRecovery}
    disabled={downloadRecovery.isPending}
    className="flex-1"
  >
    <RotateCcw className={`h-4 w-4 mr-2 ${downloadRecovery.isPending ? 'animate-spin' : ''}`} />
    {downloadRecovery.isPending ? 'Baixando...' : 'Baixar Recovery'}
  </Button>
)}
```

#### 4.3 Atualizar versão na UI

Atualizar referências de `v6.9.12` para `v6.9.20` no título e texto.

---

## Fluxo de Recovery Após as Mudanças

```text
CENÁRIO 1: Token sumiu/corrompeu
─────────────────────────────────
MikroTik tenta sync
       │
       ▼
Lê token do arquivo (vazio)
       │
       ▼
[:len $token] < 10 = true
       │
       ▼
Usa token embutido fallback
       │
       ▼
Sync funciona normalmente ✓


CENÁRIO 2: Recovery via Painel (novo)
─────────────────────────────────────
Usuário no painel
       │
       ▼
Clica "Baixar Recovery"
       │
       ▼
Frontend: POST /mikrotik-recovery-download
          { hotspot_id: "..." }
          Authorization: Bearer [JWT]
       │
       ▼
Backend valida JWT + permissão
       │
       ▼
Gera script com:
  - Recriação do token
  - Scripts com fallback embutido
  - Schedulers v6.9.20
  - Netwatch
       │
       ▼
Navegador baixa navspot-recovery.rsc
       │
       ▼
Usuário faz upload e /import


CENÁRIO 3: Guardian detecta versão antiga
──────────────────────────────────────────
Guardian roda a cada 10min
       │
       ▼
Verifica navspot-sync
       │
       ▼
[:find $syncSource "token fallback embutido"] = -1
       │
       ▼
Script desatualizado → needsRepair = 1
       │
       ▼
Baixa recovery v6.9.20
       │
       ▼
Import automático ✓
```

---

## Checklist de Compatibilidade RouterOS 6.x

| Comando | RouterOS 6.x | RouterOS 7.x |
|---------|--------------|--------------|
| `/file add name=X contents=Y` | NAO | SIM |
| `/file print file=X where name="__never__"` | SIM | SIM |
| `/file set [find name~"X"] contents=Y` | SIM | SIM |
| `:delay 500ms` | SIM | SIM |
| `/tool netwatch` | SIM | SIM |
| `start-date=jan/01/1970` | SIM | SIM |

O plano usa apenas comandos compatíveis com RouterOS 6.x.

---

## Ordem de Implementação

1. **mikrotik-recovery-download/index.ts**
   - Adicionar suporte a `hotspot_id` com validação de permissão
   - Adicionar recriação do token no script
   - Adicionar fallback embutido nos scripts

2. **mikrotik-script-generator/index.ts**
   - Mudar método de criação de token para universal
   - Adicionar fallback de token no sync
   - Adicionar verificação de fallback no guardian
   - Atualizar versão para v6.9.20

3. **src/hooks/useHotspots.ts**
   - Adicionar `useDownloadRecoveryScript`

4. **src/components/modals/ScriptModal.tsx**
   - Adicionar prop `hotspotId`
   - Adicionar botão "Baixar Recovery"
   - Atualizar versão na UI

5. **Deploy das Edge Functions**

---

## Teste Após Implementação

### No Painel:
1. Abrir modal de script de uma embarcação
2. Verificar que botão "Baixar Recovery" aparece
3. Clicar e confirmar download do arquivo
4. Verificar conteúdo do `.rsc` - deve ter:
   - Seção de recriação do token
   - Fallback embutido no navspot-sync

### No MikroTik:
```routeros
# Testar recovery
/import navspot-recovery.rsc

# Verificar que token foi recriado
:put [/file get "navspot-token.txt" contents]

# Verificar fallback no sync
/system script print detail where name="navspot-sync"
# Deve conter "token fallback embutido"

# Verificar versão nos logs
/log print where message~"v6.9.20"
```

### Teste de Fallback:
```routeros
# Simular token corrompido
/file set [find name="navspot-token.txt"] contents=""

# Rodar sync manualmente
/system script run navspot-sync

# Verificar log - deve usar fallback
/log print where message~"fallback"
```

---

## Notas de Segurança

1. **Validação de Permissão**: O endpoint `mikrotik-recovery-download` valida que o usuário logado tem acesso ao hotspot antes de retornar o script. Isso impede que um usuário baixe o recovery de outro.

2. **Token Alfanumérico**: O sync_token é hexadecimal (64 chars), sem caracteres especiais, portanto não há risco de quebra de sintaxe ao embutir no script.

3. **Delays Mantidos**: Os delays de 500ms e 1s são críticos para dispositivos com flash lento e foram mantidos conforme recomendação.
