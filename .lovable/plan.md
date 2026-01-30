# Plano v6.9.3: Correções de Compatibilidade RouterOS + Robustez

## Status: ✅ IMPLEMENTADO

## Resumo das Correções Aplicadas

| Problema | Antes | Depois |
|----------|-------|--------|
| Política inválida | `policy=read,write,policy,test` | `policy=read,write,test` |
| Scheduler on-event | `on-event="navspot-sync"` | `on-event="/system script run navspot-sync"` |
| Token frágil | `/file print file=` + `/file set` | `/file add` com fallback |
| Rate-limit vazio | Passa `rate-limit=` vazio | Omite parâmetro se vazio |
| Testes | Incompletos | Validam políticas e sintaxe |

## Arquivos Modificados

- `supabase/functions/mikrotik-script-generator/index.ts` - Todas as 5 correções
- `test/useMikrotikSync.test.ts` - Novos testes automatizados

## Validação

1. Executar testes: `npm run test`
2. Gerar script para hotspot de teste
3. Verificar no arquivo `.rsc`:
   - [x] Nenhuma ocorrência de `policy=read,write,policy,test`
   - [x] Scheduler usa `on-event="/system script run navspot-sync"`
   - [x] Token usa método com fallback
   - [x] create_profile verifica `[:len $pRate] > 0`
   - [x] Versão v6.9.3 nos logs
   - [x] Nenhuma ocorrência de `action=deny`
