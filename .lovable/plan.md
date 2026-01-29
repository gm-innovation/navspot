

# Correção Definitiva: Comando Inválido no RouterOS

## Diagnóstico Confirmado

A linha 171 do `navspot-bootstrap.rsc` contém:
```routeros
:do { /ip hotspot user profile set [find name=$pName] limit-bytes-total=$quotaBytes } on-error={}
```

**Problema**: `limit-bytes-total` **não existe** em `/ip hotspot user profile`. Esse parâmetro só é válido em `/ip hotspot user`. O RouterOS vê um parâmetro desconhecido e dispara `expected end of command`.

---

## Mudanças a Implementar

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

### 1. Corrigir o bloco `update_profile_quota` (Linhas 332-339)

**De:**
```routeros
:if ($cmd = "update_profile_quota") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local quota [:pick $rest ($p2 + 1) [:len $rest]]
:local quotaBytes ($quota * 1024 * 1024)
:do { /ip hotspot user profile set [find name=$pName] limit-bytes-total=$quotaBytes } on-error={}
:log info "NAVSPOT: Quota do perfil $pName atualizada para $quota MB"
}
```

**Para:**
```routeros
:if ($cmd = "update_profile_quota") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local quota [:pick $rest ($p2 + 1) [:len $rest]]
:local quotaBytes ($quota * 1024 * 1024)
:foreach uId in=[/ip hotspot user find where profile="$pName"] do={
:do { /ip hotspot user set $uId limit-bytes-total=$quotaBytes } on-error={}
}
:log info ("NAVSPOT: Quota aplicada para usuarios do perfil " . $pName . " = " . $quota . " MB")
}
```

**Pontos importantes:**
- Remove completamente `/ip hotspot user profile set ... limit-bytes-total`
- Aplica a quota em cada usuário que usa o perfil via `foreach`
- Usa `profile="$pName"` com aspas para proteger contra nomes com espaço

### 2. Padronizar aspas em outros comandos (Linhas 268-311)

Adicionar aspas duplas em todos os `find name=` e `find where`:

| Linha | De | Para |
|-------|----|----|
| 268 | `find name=$pName` | `find name="$pName"` |
| 280 | `find name=$uName` | `find name="$uName"` |
| 284 | `find name=$uName` | `find name="$uName"` |
| 289 | `find name=$rest` | `find name="$rest"` |
| 293 | `find name=$rest` | `find name="$rest"` |
| 297 | `find name=$rest` | `find name="$rest"` |
| 311 | `find name=$uName` | `find name="$uName"` |
| 318 | `find dst-host=$domain` | `find dst-host="$domain"` |

### 3. Adicionar Sanity Checks (Linhas ~103, antes do return)

Antes de retornar o script, validar e logar erros se detectar padrões problemáticos:

```typescript
// Sanity checks para evitar regressões
if (bootstrapScript.includes('/ip hotspot user profile set') && 
    bootstrapScript.includes('limit-bytes-total')) {
  console.error('[script-generator] ERRO: Gerou limit-bytes-total em /ip hotspot user profile. Deve ser em /ip hotspot user.')
}

if (bootstrapScript.includes('source="')) {
  console.error('[script-generator] ERRO: Gerou source="...". Use sempre source={...} para scripts longos.')
}

if (bootstrapScript.includes(':do {/')) {
  console.error('[script-generator] ERRO: Gerou ":do {/". Corrigir para ":do { /".')
}
```

---

## Validação Após Correção

1. Gerar novamente o script para **Engenharia Googlemarine**
2. Verificar que NÃO existe mais:
   ```
   /ip hotspot user profile set ... limit-bytes-total
   ```
3. Verificar que EXISTE:
   ```
   :foreach uId in=[/ip hotspot user find where profile="..."] do={
   :do { /ip hotspot user set $uId limit-bytes-total=... } on-error={}
   }
   ```
4. Importar no MikroTik:
   ```
   /import navspot-bootstrap.rsc
   ```
5. Confirmar que os scripts foram criados:
   ```
   /system script print where name~"navspot"
   ```

---

## Resumo das Correções

| Problema | Causa | Solução |
|----------|-------|---------|
| `expected end of command` linha 171 | `limit-bytes-total` não existe em `user profile` | Usar `foreach` para aplicar em `/ip hotspot user` |
| Possíveis erros com nomes com espaço | Variáveis sem aspas | Padronizar `find name="$var"` |
| Regressões futuras | Sem validação | Sanity checks no gerador |

