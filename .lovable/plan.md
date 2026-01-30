
# Plano v6.9.10: Correção de Parsing de Usuários Ativos e Ativação Automática

## ✅ IMPLEMENTADO

### Mudanças Realizadas

1. **Função `parseActiveUsersCsv()`** - Converte CSV do MikroTik para `ActiveUser[]`
   - Formato: `"user,mac,bytes_in,bytes_out;user2,mac2,...;"`
   - Adicionada após interfaces (~linha 55)

2. **Parsing automático no início do handler** (~linha 338)
   - Detecta se `active_users_csv` está presente e `active_users` está vazio
   - Invoca `parseActiveUsersCsv()` automaticamente
   - Loga quantidade de usuários parseados

3. **Query de tripulante inclui `status`** (~linha 448)
   - Adicionado campo `status` na query SELECT
   - Permite verificar se usuário está em `pendente_cadastro`

4. **Auto-ativação de usuários** (~linha 543-553)
   - Após atualizar `bytes_consumidos` e `ultimo_login`
   - Se `status === 'pendente_cadastro'`, atualiza para `'ativo'`
   - Loga ativação: `"Auto-activated user {nome} on first login"`

---

## Fluxo Corrigido

```text
Sync recebido:
├── active_users_csv: "alexandre.silva,04:BF:1B:6E:9F:E9,753628,438498;"
├── v6.9.10: Parse CSV → active_users: [{user: "alexandre.silva", mac: "...", bytes_in: 753628, ...}]
├── Bloco de processamento EXECUTA:
│   ├── Busca tripulante no banco (com status) ✓
│   ├── Atualiza bytes_consumidos ✓
│   ├── Atualiza ultimo_login ✓
│   ├── Registra dispositivo (auto-register) ✓
│   ├── Cria/atualiza sessão WiFi ✓
│   └── v6.9.10: Se pendente_cadastro → ativo ✓
└── Dashboard reflete dados reais ✓
```

---

## Testes Esperados

Após o próximo sync do MikroTik, verificar:

1. Log: `"v6.9.10: Parsed X active users from CSV"`
2. `dispositivos_registrados` - novo registro para MAC do usuário
3. `sessoes_wifi` - registro com `status: 'ativa'`
4. `tripulantes.ultimo_login` - atualizado
5. `tripulantes.bytes_consumidos` - incrementado
6. `tripulantes.status` - mudou de `pendente_cadastro` para `ativo`
