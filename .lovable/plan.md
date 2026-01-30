

# Plano v6.7: Correção Definitiva do Gerador de Scripts MikroTik

## Problema Identificado

O script `navspot-sync` não está sendo criado no RouterOS 6.x porque o `/import` falha silenciosamente ao processar aspas escapadas (`\\"`) dentro do bloco `source={}`.

---

## Correções a Implementar

### 1. Correção do JSON Escaping (Linha 252)

**Problema:** A linha com escapes `\\"` quebra o parsing do RouterOS 6.x

**De:**
```typescript
:local body ("{\\"sync_token\\":\\"" . $token . "\\",\\"active_users_csv\\":\\"" . $users . "\\"}")
```

**Para (usando variável $q com hex \22):**
```typescript
:local q "\\22"
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "}")
```

**Por que funciona:** O `\22` é o código hexadecimal para aspas duplas (`"`), que é interpretado literalmente pelo RouterOS sem ambiguidade de escape.

---

### 2. Sanity Checks Expandidos (Linhas 116-132)

Adicionar verificações que **lançam exceção** (não apenas log):

```typescript
// v6.7: Verificar se scripts essenciais foram gerados
if (!bootstrapScript.includes('/system script add name="navspot-sync"')) {
  throw new Error('Erro critico: navspot-sync nao foi gerado')
}

if (!bootstrapScript.includes('/system script add name="navspot-action-processor"')) {
  throw new Error('Erro critico: navspot-action-processor nao foi gerado')
}
```

---

### 3. Sanitização do Output (Antes do return)

```typescript
// v6.7: Sanitização - garantir apenas LF (sem CRLF) e converter tabs
let sanitizedBootstrap = bootstrapScript
  .replace(/\r\n/g, '\n')  // CRLF -> LF
  .replace(/\r/g, '\n')    // CR -> LF
  .replace(/\t/g, '  ')    // Tab -> 2 espaços

// Remover linhas vazias consecutivas (mais de 2)
sanitizedBootstrap = sanitizedBootstrap.replace(/\n{3,}/g, '\n\n')
```

---

### 4. Atualizar Versão para 6.7

Alterar todas as referências de `v6.5` para `v6.7` no código.

---

## Arquivo a Modificar

`supabase/functions/mikrotik-script-generator/index.ts`

| Linha | Mudança |
|-------|---------|
| 70 | Alterar log para v6.7 |
| 116-134 | Expandir sanity checks com throws |
| 136-150 | Adicionar sanitização + retornar script limpo |
| 240-266 | Substituir syncScriptSource com método $q |
| 144 | Alterar version para '6.7' |

---

## Resultado Esperado

Após a correção, o script gerado terá:

1. **JSON seguro:** `"{" . $q . "sync_token" . $q ...` em vez de `"{\\"sync_token\\"\\"`
2. **Sem CRLF:** Apenas LF (`\n`) no arquivo
3. **Validação:** Se algum script não for gerado, a função lança erro
4. **Versão atualizada:** `v6.7`

---

## Validação Pós-Implementação

1. Gerar script para Engenharia Googlemarine
2. Baixar o `.rsc` e verificar:
   - Linha do body contém `$q` ou `\22`
   - Sem caracteres `\r` (CRLF)
3. Importar no MikroTik 6.x: `/import navspot-bootstrap.rsc`
4. Verificar criação: `/system script print where name~"navspot"`

