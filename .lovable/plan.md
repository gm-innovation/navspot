
# Correção v7.1.6: Limite de 4KB para Variáveis no RouterOS 6.x

## Diagnóstico Confirmado

O script `navspot-action-processor` tem o campo **Source VAZIO** no MikroTik, mesmo com logs indicando "instalado com sucesso". 

**Causa raiz**: No RouterOS 6.x, o comando `/file get ... contents` tem um limite de **~4KB** para transferir conteúdo para uma variável. Se o arquivo exceder esse tamanho, a variável retorna **vazia silenciosamente** (sem erro!).

O `action-source` atual tem ~238 linhas (~8-9KB), muito acima do limite.

## Arquitetura da Solução

### Opção escolhida: **Chunked Import via /import direto**

Em vez de:
```routeros
:local src [/file get "ns-action.txt" contents]  # FALHA no 6.x
/system script set ... source=$src
```

Usar:
```routeros
/import ns-action.rsc  # Funciona com qualquer tamanho!
```

O truque é que o arquivo `.rsc` já contenha o comando de criação do script com `source={...}` embutido. O `/import` processa o arquivo diretamente do disco, sem passar por variável.

## Mudanças Técnicas

### A) `mikrotik-scripts/index.ts`

#### 1) Alterar `generateAllScripts()` - Installer com /import direto

Para cada script (sync, action-processor, guardian), em vez de:
```routeros
/tool fetch url=... dst-path="ns-action.txt"
:local src [/file get "ns-action.txt" contents]  # PROBLEMA!
/system script set ... source=$src
```

Usar:
```routeros
/tool fetch url=... dst-path="ns-action.rsc"
:delay 2s
/import ns-action.rsc
:do { /file remove "ns-action.rsc" } on-error={}
```

#### 2) Alterar tipos de retorno da API

Os endpoints `*-source` passam a retornar scripts RSC completos com wrapper:

**sync-source** → retorna:
```routeros
# NAVSPOT Sync v7.1.6
:do { /system script remove [find name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source={
  <código do sync aqui>
}
:log info "NAVSPOT: Sync v7.1.6 instalado"
```

**action-source** → retorna:
```routeros
# NAVSPOT Action Processor v7.1.6
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source={
  <código do action-processor aqui>
}
:log info "NAVSPOT: Action-processor v7.1.6 instalado"
```

**guardian-source** → retorna:
```routeros
# NAVSPOT Guardian v7.1.6
:do { /system script remove [find name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source={
  <código do guardian aqui>
}
:log info "NAVSPOT: Guardian v7.1.6 instalado"
```

### B) Validação de sintaxe para `source={...}`

O código que gera os scripts com `source={...}` precisa **escapar** caracteres especiais dentro do bloco:
- `"` → `\"`
- `$` → `\$` (para variáveis locais, runtime `$(...)` é tratado separadamente)

**IMPORTANTE**: Não podemos simplesmente retornar o código "puro" com wrappers, pois o `source={...}` tem regras rígidas do parser RouterOS 6.x.

A solução mais segura é usar uma abordagem **híbrida**:
1. Retornar arquivo RSC que cria o script vazio
2. Depois carregar o source via `/file set` em chunks

### C) Solução Final: Chunked Loading (Compatível com 6.x)

Para scripts grandes (>4KB), dividir em múltiplos arquivos de ~3KB cada:

```routeros
# Installer baixa em chunks
/tool fetch url=(.../action-source?chunk=1) dst-path="ns-a1.txt"
/tool fetch url=(.../action-source?chunk=2) dst-path="ns-a2.txt"
...
# Concatena em runtime
:local s1 [/file get "ns-a1.txt" contents]
:local s2 [/file get "ns-a2.txt" contents]
:local fullSrc ($s1 . $s2)
/system script set ... source=$fullSrc
```

**Problema**: Isso adiciona complexidade e múltiplas requisições.

### D) Solução Simplificada Escolhida: **Minificar o Action Processor**

Reduzir o `navspot-action-processor` para menos de **4KB** removendo:
1. Handlers de comandos raramente usados (firewall, blacklist avançado)
2. Comentários e espaços extras
3. Logs verbosos intermediários

O action-processor ESSENCIAL precisa apenas:
- `configure_hotspot_profile`
- `create_profile`
- `create_user`
- `remove_user`
- `disable_user` / `enable_user`
- `kick_session`
- `update_password`

Comandos avançados (`add_firewall_block`, `create_whitelist_domain`, `update_profile_quota`) podem ser movidos para um script separado (`navspot-action-extended`) carregado apenas se necessário.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-scripts/index.ts` | Minificar `generateActionProcessorSource()` para <4KB; alterar installer para usar `/import` |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump para v7.1.6 |
| `src/components/modals/ScriptModal.tsx` | Default v7.1.6 |
| `src/pages/Embarcacoes.tsx` | Fallback v7.1.6 |

## Estimativa de Tamanho Após Minificação

O action-processor essencial terá:
- Lock check: ~200 bytes
- File read: ~300 bytes
- Parsing loop: ~400 bytes
- `configure_hotspot_profile`: ~500 bytes
- `create_profile`: ~600 bytes
- `create_user`: ~600 bytes
- `remove_user`: ~200 bytes
- `disable_user`/`enable_user`: ~200 bytes
- `kick_session`: ~200 bytes
- `update_password`: ~200 bytes
- Cleanup/logs: ~200 bytes
- **Total estimado: ~3.6KB** ✓

## Validação Pós-Deploy

1. Gerar bootstrap v7.1.6
2. Importar no MikroTik
3. Verificar `/system script print` → navspot-action-processor deve ter Source **com conteúdo**
4. Executar `/system script run navspot-sync`
5. Verificar logs `NAVSPOT-ACTION v7.1.6: Start`
6. Verificar `/ip hotspot user print where name="alexandre.silva"` → usuário criado
