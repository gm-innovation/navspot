
# Plano de Correção v6.9.18: Reset de Hash e Limpeza de Ações Antigas

## Diagnóstico Detalhado

| Problema | Causa | Impacto |
|----------|-------|---------|
| Hash já salvo | Sync salvou hash antes do MikroTik processar ações | "Skipping injection (loop prevention)" |
| Ação antiga pendente | `add_walled_garden` sem handler no action-processor atual | Domínios whitelist nunca foram aplicados |
| Action-processor quebrado | Erro sintaxe `action=reject` em recovery anterior | Nenhum comando executa corretamente |

## Logs Encontrados

```
2026-02-02T21:13:55Z Found 1 restrictive profiles (bloquear_tudo)
2026-02-02T21:13:55Z Collected 17 whitelist domains for restrictive profiles
2026-02-02T21:13:55Z Firewall rules hash - current: 9405b38c, new: 9405b38c
2026-02-02T21:13:55Z Firewall rules unchanged, skipping injection (loop prevention)
```

O sistema detecta corretamente o perfil restritivo e os 17 domínios whitelist, mas não injeta porque o hash já foi salvo.

## Ação Pendente Encontrada

```json
{
  "tipo": "add_walled_garden",
  "payload": {
    "dominios": ["g1.com", "uol.com.br", "r7.com.br"],
    "lista_name": "Notícias",
    "tipo": "whitelist"
  },
  "status": "pendente"
}
```

## Correções Necessárias

### 1. Resetar o `firewall_rules_hash` Novamente

```sql
UPDATE hotspots 
SET firewall_rules_hash = NULL,
    firewall_rules_updated_at = NULL
WHERE nome ILIKE '%googlemarine%';
```

### 2. Limpar/Atualizar Ação Antiga

Remover a ação `add_walled_garden` pendente que nunca vai ser processada:

```sql
DELETE FROM acoes_pendentes 
WHERE tipo = 'add_walled_garden' 
AND status = 'pendente';
```

### 3. Verificar se Action-Processor Foi Atualizado no MikroTik

O recovery v6.9.17 que você aplicou deveria ter corrigido o `action=reject` para `action=deny`. Preciso confirmar se o script foi salvo corretamente:

```routeros
/system script print where name="navspot-action-processor"
```

Se mostrar erro de sintaxe ou estiver vazio, precisa reaplicar o recovery.

### 4. Rodar Novo Sync

Após resetar o hash, o próximo sync vai:
1. Calcular novo hash das regras
2. Detectar que `currentHash !== newHash` (null != hash)
3. Injetar as 17 ações `add_firewall_allow`
4. Retornar no pipe para o MikroTik processar
5. Criar Address-List `NAVSPOT-ALLOWED`
6. Criar regra de ACCEPT para essa lista
7. Criar regra de DROP para todo resto

## Sequência de Execução

1. **Migration SQL** - Reset do hash + limpeza de ações antigas
2. **Verificar action-processor no MikroTik**
3. **Rodar sync manual**: `/system script run navspot-sync`
4. **Verificar logs**: `/log print where message~"NAVSPOT"`
5. **Verificar firewall**: 
   - `/ip firewall filter print where comment~"NAVSPOT-ALLOW"`
   - `/ip firewall address-list print where list="NAVSPOT-ALLOWED"`

## Resultado Esperado

Após as correções:
- 17 domínios serão adicionados à Address-List `NAVSPOT-ALLOWED`
- Regra `NAVSPOT-ALLOW-ACCEPT` vai permitir tráfego para essa lista
- Regra `NAVSPOT-ALLOW-MASTER` vai dropar todo resto
- Sites como g1.com, gmail.com, google.com funcionarão
- Todo o resto será bloqueado

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | Reset hash + limpar ações antigas |

## Verificação no MikroTik

```routeros
# Verificar se action-processor está OK
:put [/system script get [find name="navspot-action-processor"] source]
```

Se mostrar o script completo com `action=deny`, está OK.
Se mostrar erro ou estiver vazio, precisa reaplicar o recovery.
