

# Desbloquear tripulantes ao aumentar quota do perfil

## Problema

Quando o perfil "Tripulacao Googlemarine" tinha quota de 50MB, o sistema bloqueou corretamente o Alexandre Silva ao atingir o limite. Porem, ao atualizar o perfil para 100MB, o tripulante permanece bloqueado com 76.21MB de consumo -- abaixo do novo limite.

Isso acontece porque o codigo atual de `useUpdatePerfilVelocidade` apenas atualiza a configuracao do perfil no MikroTik, mas **nao verifica se existem tripulantes bloqueados por quota que agora estariam dentro do novo limite**.

O desbloqueio automatico so ocorre no `resetExpiredQuotas` (quando o periodo da quota expira, ex: virada do dia), mas nao quando o limite e aumentado.

## Solucao

Adicionar logica no `useUpdatePerfilVelocidade` que, ao detectar aumento de `limite_dados_mb`, automaticamente:

1. Busca tripulantes bloqueados (`status = 'bloqueado'`, `bloqueio_motivo = 'quota_exceeded'`) vinculados ao perfil atualizado
2. Filtra apenas aqueles cujo `bytes_consumidos` esta abaixo do novo limite
3. Reativa esses tripulantes (`status = 'ativo'`, limpa `bloqueio_motivo`)
4. Cria acoes `unblock_quota` no MikroTik para remover o ip-binding e firewall filter que bloqueiam o acesso

## Detalhes Tecnicos

### Arquivo: `src/hooks/usePerfisVelocidade.ts`

No `useUpdatePerfilVelocidade`, apos a atualizacao do perfil no banco e antes do `return data`, adicionar:

```typescript
// v7.8.7: Auto-unblock tripulantes when quota limit is increased
const oldLimitBytes = oldData.limite_dados_mb 
  ? oldData.limite_dados_mb * 1024 * 1024 
  : null;
const newLimitBytes = data.limite_dados_mb 
  ? data.limite_dados_mb * 1024 * 1024 
  : null;

if (newLimitBytes && (!oldLimitBytes || newLimitBytes > oldLimitBytes)) {
  // Quota was increased - check for blocked tripulantes
  const { data: blockedTripulantes } = await supabase
    .from('tripulantes')
    .select('id, login_wifi, bytes_consumidos, embarcacao_id')
    .eq('perfil_id', id)
    .eq('status', 'bloqueado')
    .eq('bloqueio_motivo', 'quota_exceeded');

  if (blockedTripulantes && blockedTripulantes.length > 0) {
    for (const t of blockedTripulantes) {
      if (t.bytes_consumidos < newLimitBytes) {
        // Reactivate in database
        await supabase
          .from('tripulantes')
          .update({
            status: 'ativo',
            bloqueio_motivo: null,
            bloqueado_at: null,
          })
          .eq('id', t.id);

        // Get devices to unblock on MikroTik
        const { data: devices } = await supabase
          .from('dispositivos_registrados')
          .select('mac_address')
          .eq('tripulante_id', t.id);

        // Create unblock_quota + enable_user actions
        for (const d of devices || []) {
          await createMikrotikAction({
            embarcacaoId: t.embarcacao_id,
            tipo: 'unblock_quota' as any,
            payload: { mac: d.mac_address },
          });
        }
        await createMikrotikAction({
          embarcacaoId: t.embarcacao_id,
          tipo: 'enable_user',
          payload: { user: t.login_wifi },
        });
      }
    }
  }
}
```

### Arquivo: `src/hooks/useMikrotikSync.ts`

Adicionar `'unblock_quota'` e `'block_quota'` ao tipo `MikrotikActionType` para que o TypeScript aceite esses valores.

### Fluxo completo

```text
1. Admin altera quota de 50MB para 100MB
2. useUpdatePerfilVelocidade detecta aumento
3. Busca tripulantes bloqueados por quota no perfil
4. Alexandre Silva: 76MB consumidos < 100MB novo limite
5. Banco: status -> 'ativo', bloqueio_motivo -> null
6. Cria acao 'unblock_quota' (remove ip-binding + firewall)
7. Cria acao 'enable_user' (reativa no hotspot)
8. Proximo sync: MikroTik processa acoes e libera acesso
```

### Arquivos alterados

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/usePerfisVelocidade.ts` | Adicionar logica de auto-unblock ao aumentar quota |
| `src/hooks/useMikrotikSync.ts` | Adicionar `unblock_quota` e `block_quota` ao tipo |

