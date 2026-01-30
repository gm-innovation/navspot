

# Correção Final v6.7: Consistência de Versão + Delay

## Problemas Identificados

1. **Linha 479**: Comentário ainda diz `v6.5` mas deveria ser `v6.7`
2. **Linha 477**: Falta delay adicional após criação do token para garantir disponibilidade

---

## Correções a Aplicar

### Correção 1: Atualizar Comentário de Versão

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 479 - De:**
```routeros
# 10. SYNC SCRIPT v6.5 + ACTION PROCESSOR
```

**Para:**
```routeros
# 10. SYNC SCRIPT v6.7 + ACTION PROCESSOR
```

---

### Correção 2: Adicionar Delay Após Token

**Linhas 476-477 - De:**
```routeros
}
:log info "NAVSPOT: Token criado"
```

**Para:**
```routeros
}
:delay 1s
:log info "NAVSPOT: Token criado"
```

**Motivo:** Garante que o arquivo de token esteja completamente escrito e disponível no sistema de arquivos antes de criar o script de sync que depende dele.

---

## Resumo das Mudanças

| Linha | Tipo | Mudança |
|-------|------|---------|
| 476-477 | Ajuste | Adicionar `:delay 1s` após fallback do token |
| 479 | Correção | Trocar `v6.5` por `v6.7` no comentário |

---

## Resultado Esperado

Após as correções, o script gerado terá:

1. **Versão consistente:** Todos os comentários e logs referenciando `v6.7`
2. **Delay de segurança:** 2 segundos totais entre criar o token e usar no script sync (1s antes + 1s depois)

