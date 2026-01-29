

# Correção: Seção 9 (TOKEN) - Comando /file Inválido

## Diagnóstico Final

**Erro:** `bad command name add (line ~85)`

O comando que gerou o erro:
```routeros
/file print file=navspot-token
```

**Problema:** `/file print file=...` **não é um comando válido** no RouterOS dentro de scripts. O parâmetro `file=` em `/file print` serve para redirecionar saída do comando (não criar arquivos), e dentro de `/import` o parser se confunde.

---

## Mudança a Implementar

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### Substituir a Seção 9 (TOKEN) - Linhas 445-453

**De (código atual que está quebrando):**
```routeros
# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
:do {
/file print file=navspot-token
:delay 1s
/file set navspot-token.txt contents="${hotspot.sync_token}"
} on-error={
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
}
:log info "NAVSPOT: Token criado"
```

**Para (usando padrão set/add correto):**
```routeros
# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
:do {
/file set [find name="navspot-token.txt"] contents="${hotspot.sync_token}"
} on-error={
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
}
:log info "NAVSPOT: Token criado"
```

---

## Lógica da Correção

| Passo | Comando | Comportamento |
|-------|---------|---------------|
| 1 | `/file remove "navspot-token.txt"` | Remove arquivo se existir (ignora erro se não existir) |
| 2 | `/file set [find name="..."] contents=...` | Tenta definir conteúdo (falha porque arquivo não existe após remove) |
| 3 | `on-error` → `/file add name="..." contents=...` | Cria arquivo com o conteúdo |

**Por que funciona:**
- O `remove` garante que não há arquivo duplicado
- O `set` vai falhar porque o arquivo não existe (o `find` retorna vazio)
- O `add` no `on-error` cria o arquivo corretamente
- Em RouterOS 6.x: o `set` falha, o `add` pode não existir mas o fluxo continua
- Em RouterOS 7.x: o `set` falha, o `add` cria o arquivo

**Alternativa ainda mais robusta (se necessário):**
Se o RouterOS 6.x não tiver `/file add`, podemos usar apenas:
```routeros
:do { /file remove "navspot-token.txt" } on-error={}
:delay 2s
/system script add name="navspot-token-creator" source=":put \\"${hotspot.sync_token}\\"" dont-require-permissions=yes
/system script run navspot-token-creator output=file file="navspot-token"
/system script remove navspot-token-creator
```
Mas vamos tentar primeiro a versão `set/add` que é mais simples.

---

## Atualizar Sanity Check

Modificar o sanity check para detectar `/file print file=`:

```typescript
if (bootstrapScript.includes('/file print file=')) {
  console.error('[script-generator] ERRO: /file print file= não é válido em scripts. Use /file set ou /file add.')
}
```

---

## Validação Após Correção

1. Gerar novamente o script para **Engenharia Googlemarine**
2. Verificar que a seção 9 (TOKEN) contém:
   - `/file set [find name="navspot-token.txt"]` (método primário)
   - `/file add` dentro de `on-error` (fallback)
   - **NÃO** contém `/file print file=`
3. Importar no MikroTik:
   ```
   /import navspot-bootstrap.rsc
   ```
4. Confirmar que o arquivo foi criado:
   ```
   /file print where name~"navspot"
   ```

---

## Resumo

| Problema | Causa | Solução |
|----------|-------|---------|
| `bad command name add` | `/file print file=` inválido em scripts | Usar padrão `/file set [find]` + `/file add` no `on-error` |

