

# Incrementar versoes apos alteracoes no sync

## Problema

As alteracoes feitas na logica de reconciliacao do `mikrotik-sync` (v7.1.63) e nos templates `sync`/`sync-standalone` (coleta de active_users_csv e registered_users_csv) nao foram acompanhadas de incremento nas constantes VERSION. Isso impede que o `navspot-guardian` detecte a mudanca e force o re-download dos scripts nos roteadores.

## Estado Atual das Versoes

| Local | VERSION atual | Deveria ser |
|-------|--------------|-------------|
| `mikrotik-sync/index.ts` | `"7.1.62"` | `"7.1.63"` |
| `navspot-script-gen/index.ts` | `"7.8.1"` | `"7.8.2"` |
| `mikrotik-recovery-download/index.ts` | `"7.1.59"` | sem alteracao |

Os templates no banco usam `{{VERSION}}` como placeholder, que e substituido pelo valor da constante no `navspot-script-gen`. Portanto, incrementar `navspot-script-gen` para `7.8.2` fara com que os scripts gerados reflitam a nova versao automaticamente.

## Alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` (linha 9) | `"7.1.62"` para `"7.1.63"` |
| `supabase/functions/navspot-script-gen/index.ts` (linha 6) | `"7.8.1"` para `"7.8.2"` |

Sao duas alteracoes de uma linha cada. Apos isso, deploy das duas funcoes.

## Efeito

- O `navspot-guardian` detectara que a versao no servidor (`7.8.2`) difere da versao instalada no router, forcando re-download automatico dos scripts de sync e guardian.
- Os novos scripts coletarao `active_users_csv` e `registered_users_csv`, alimentando a reconciliacao corretamente.
- O backend (`mikrotik-sync` v7.1.63) tera a guarda contra o loop de reset ativa.

