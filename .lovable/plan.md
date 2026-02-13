

# Fix: Adicionar reconexao automatica ao fluxo de desbloqueio de quota

## Situacao Atual

Os logs do MikroTik confirmam que as 3 acoes foram aplicadas com sucesso:
- IP binding removido para MAC 04:BF:1B:6E:9F:E9
- Quota unblock para MAC 12:8E:E9:84:F8:5B
- Firewall filter removido
- Usuario alexandre.silva habilitado (disabled=no)

Porem o usuario continua sem internet porque:
1. O `block_quota` original removeu a sessao ativa do hotspot
2. O dispositivo ficou "conectado ao WiFi" mas sem autenticacao no hotspot
3. O desbloqueio removeu os bloqueios mas nao forcou re-autenticacao
4. O dispositivo precisa desconectar e reconectar ao WiFi manualmente

## Solucao Imediata

Para o Alexandre Silva agora: **ele precisa desligar e religar o WiFi no celular**. Isso forcara o re-login no hotspot e ele tera acesso novamente.

## Correcao no Codigo (para evitar no futuro)

Adicionar um `create_user` ao fluxo de auto-unblock. O handler `create_user` no MikroTik faz "remove + add" do usuario, o que forca o re-provisionamento e permite que o dispositivo re-autentique automaticamente no proximo ciclo de sync (via reconciliacao).

### Arquivo: `src/hooks/usePerfisVelocidade.ts`

Apos as acoes `unblock_quota` e `enable_user`, adicionar uma acao `create_user` que re-provisiona o usuario no MikroTik, garantindo que a reconciliacao de estado corrija a sessao:

```typescript
// Apos enable_user, re-criar o usuario para forcar re-provisionamento
await createMikrotikAction({
  embarcacaoId: t.embarcacao_id,
  tipo: 'create_user',
  payload: { 
    user: t.login_wifi, 
    password: '(manter senha atual)', 
    profile: '(perfil atual)' 
  },
});
```

Porem, o `create_user` faz remove+add e isso zera os contadores de bytes. Uma alternativa mais segura e confiar na reconciliacao automatica do `mikrotik-sync`, que ja detecta usuarios "registrados mas sem sessao ativa" e os re-provisiona no proximo ciclo.

### Alternativa mais segura: Confiar na reconciliacao

Na verdade, o fluxo correto ja esta coberto pela reconciliacao automatica do `mikrotik-sync`:
1. O usuario esta habilitado (disabled=no)
2. No proximo sync, o roteador reporta o usuario como "registrado" mas sem sessao ativa
3. A reconciliacao detecta isso e o sistema funciona normalmente quando o dispositivo tenta reconectar

O problema real e que o dispositivo precisa tentar reconectar. Isso pode ser resolvido enviando um comando extra: enviar `kick_device` para os MACs desbloqueados, o que forca o dispositivo a desconectar da rede e reconectar automaticamente, disparando o re-login no hotspot.

### Solucao final: Adicionar `kick_device` ao fluxo de unblock

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/usePerfisVelocidade.ts` | Adicionar `kick_device` para cada MAC apos `unblock_quota`, forcando reconexao automatica |

Dentro do loop de dispositivos, apos o `unblock_quota`, adicionar:

```typescript
// Forcar reconexao do dispositivo para re-autenticar
await createMikrotikAction({
  embarcacaoId: t.embarcacao_id,
  tipo: 'kick_device',
  payload: { mac: d.mac_address },
});
```

Isso fara com que o dispositivo seja desconectado e reconecte automaticamente ao WiFi, disparando o fluxo de autenticacao do hotspot. Como os bloqueios ja foram removidos, o login sera bem-sucedido.

## Resumo das acoes

1. **Agora**: Pedir ao Alexandre para desligar/religar o WiFi
2. **Codigo**: Adicionar `kick_device` ao fluxo de auto-unblock para que funcione automaticamente no futuro
