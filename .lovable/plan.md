

# Correção: Compatibilidade do Comando /file com RouterOS 6.x

## Diagnóstico Confirmado

**Erro:** `bad command name add (line 80 column 7)`

A linha 80 do `navspot-bootstrap.rsc` contém:
```routeros
/file add name="navspot-token.txt" contents="..."
```

**Problema:** O comando `/file add` **não existe** no RouterOS 6.x (apenas no 7.x). A coluna 7 aponta exatamente para "add" (após "/file ").

---

## Mudança a Implementar

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### Substituir a Seção 9 (TOKEN) - Linhas 441-445

**De:**
```routeros
# 9. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token criado"
```

**Para:**
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

---

## Como Funciona a Correção

| Versão RouterOS | Método Usado | Resultado |
|-----------------|--------------|-----------|
| 6.x | `/file print file=` + `/file set` | Cria arquivo via print e define conteúdo |
| 7.x | `/file add` (fallback) | Usa o comando nativo do 7.x |

**Fluxo:**
1. Tenta o método antigo (`/file print file=...`) que funciona em RouterOS 6.x
2. Se falhar (RouterOS 7.x não aceita esse método), cai no `on-error` e usa `/file add`
3. Resultado: **compatível com todas as versões**

---

## Adicionar Sanity Check Extra

Incluir verificação para detectar uso de `/file add` sem fallback:

```typescript
if (bootstrapScript.includes('/file add') && !bootstrapScript.includes('/file print file=')) {
  console.error('[script-generator] AVISO: Usando /file add sem fallback para RouterOS 6.x')
}
```

---

## Validação Após Correção

1. Gerar novamente o script para **Engenharia Googlemarine**
2. Verificar que a seção 9 (TOKEN) contém:
   - `/file print file=navspot-token` (método primário)
   - `/file add` dentro de `on-error` (fallback)
3. Importar no MikroTik:
   ```
   /import navspot-bootstrap.rsc
   ```
4. Confirmar que o arquivo foi criado:
   ```
   /file print where name="navspot-token.txt"
   ```

---

## Resumo

| Problema | Causa | Solução |
|----------|-------|---------|
| `bad command name add` linha 80 | `/file add` não existe em RouterOS 6.x | Usar método `/file print file=` + `/file set` com fallback para 7.x |

