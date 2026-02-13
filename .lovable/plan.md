

# Fix: Auto-unblock deve funcionar mesmo sem aumento de quota

## Problema

A logica atual so desbloqueia quando detecta aumento (`newLimitBytes > oldLimitBytes`). Porem, como a quota ja tinha sido alterada de 50MB para 100MB ANTES do codigo ser deployado, ao salvar agora ambos os valores sao 100MB, e a condicao nao dispara.

## Correcao

Mudar a condicao para: se o perfil tem um `limite_dados_mb` definido, SEMPRE verificar se existem tripulantes bloqueados por quota com consumo abaixo do limite. Isso cobre:

1. Aumento de quota (cenario original)
2. Re-save sem mudanca (cenario atual - tripulante ja deveria estar liberado)
3. Qualquer situacao onde o bloqueio ficou "preso"

## Alteracao

Arquivo: `src/hooks/usePerfisVelocidade.ts`

Substituir a condicao:
```typescript
if (newLimitBytes && (!oldLimitBytes || newLimitBytes > oldLimitBytes)) {
```

Por:
```typescript
if (newLimitBytes) {
```

Isso faz o sistema SEMPRE verificar tripulantes bloqueados por quota ao salvar o perfil, independente de ter havido aumento ou nao. O filtro `bytes_consumidos < newLimitBytes` dentro do loop garante que so serao desbloqueados aqueles que realmente estao abaixo do limite.

## Impacto

Nenhum efeito colateral negativo. Se nao houver tripulantes bloqueados por quota, a query retorna vazio e nada acontece. Se houver, mas o consumo estiver acima do limite, o filtro interno impede o desbloqueio.

## Arquivo alterado

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/usePerfisVelocidade.ts` | Remover condicao de aumento, verificar sempre |
