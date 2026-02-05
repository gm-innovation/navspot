

# Correção Cirúrgica v7.1.21: Fix de Sanitização e Parsing de Profile

## ✅ IMPLEMENTADO

### Bug 1: `sanitizePipeForFileContents` quebra placeholders
**Correção**: Removido `.replace(/\\/g, "/")` - backslash agora preservado

### Bug 2: Parser de `create_profile` não suporta 4 parâmetros
**Correção**: Adicionado parsing de 4º parâmetro (p4) para isolar `pShared`

### Fallback Inline
**Correção**: Atualizado para v7.1.21F com parsing robusto de 4 parâmetros

---

## Validação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.21.rsc

# Verificar logs de instalação
/log print where message~"NAVSPOT-INSTALL" last=30

# Testar sync e ver se action-processor executa sem erro
/system script run navspot-sync
/log print where message~"NAVSPOT" last=40

# Esperado:
# - "NAVSPOT-ACTION v7.1.21: Start"
# - "NAVSPOT-ACTION: len=XXX"
# - "NAVSPOT: Perfil criado - tripulacao-padrao" (ou similar)
# - "NAVSPOT-ACTION v7.1.21: OK - X acoes"
```

---

## Checklist de Implementação

- [x] Remover `.replace(/\\/g, "/")` em `mikrotik-sync/index.ts`
- [x] Atualizar parsing de `create_profile` para 4 parâmetros em `mikrotik-scripts/index.ts`
- [x] Atualizar fallback inline para parsing robusto (v7.1.21F)
- [x] Bump VERSION para 7.1.21 em todos os arquivos
- [x] Deploy edge functions
- [ ] Testar em MikroTik
