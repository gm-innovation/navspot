

# Ajustar mikrotik-script-generator para retornar plain text

## Esclarecimento Importante

O endpoint `mikrotik-scripts` (que gera Sync, Guardian e Action Processor) **ja retorna `text/plain`** -- o MikroTik recebe o `.rsc` corretamente via `/tool fetch`. Nenhuma mudanca necessaria nesse endpoint.

O unico endpoint que ainda retorna JSON e o `mikrotik-script-generator` (Bootstrap), que e consumido pelo frontend web. Esse e o alvo desta mudanca.

## Mudancas

### 1. `supabase/functions/mikrotik-script-generator/index.ts` (linhas 247-261)

Alterar a resposta de sucesso de JSON para plain text com metadados nos headers:

```text
De:   JSON.stringify({ success: true, bootstrap_script: ..., version: ... })
Para: Response body = script puro (text/plain)
      Headers: X-Navspot-Version, X-Navspot-Hotspot, X-Navspot-Wan-Interface, X-Navspot-Wan-Type
```

Respostas de erro permanecem em JSON (o frontend precisa da mensagem de erro estruturada).

### 2. `src/hooks/useHotspots.ts` -- `useGenerateHotspotScript` (linhas 164-171)

Atualizar o `mutationFn` para tratar a resposta como texto, com fallback robusto:

- Se `data` for string: extrair versao via regex do header do script
- Se `data` for Blob/object: chamar `.text()` para converter
- Se nenhum dos dois: lancar erro
- Fallback: formato JSON antigo (compatibilidade)

### 3. `src/services/mikrotikService.ts` -- `generateScript` (linhas 71-82)

Mesma logica de deteccao de tipo da resposta:

- `typeof data === 'string'` -> usar diretamente
- Caso contrario -> tentar `.text()` ou usar como JSON antigo

### 4. Nenhuma mudanca em `mikrotik-scripts/index.ts`

Ja retorna `text/plain` com Content-Disposition correto. O MikroTik recebe o `.rsc` com newlines reais.

## Detalhes Tecnicos

O `supabase.functions.invoke()` da lib JS pode retornar o body ja parseado dependendo do Content-Type:
- `application/json` -> objeto JS
- `text/plain` -> string (na maioria das versoes)
- Em versoes mais antigas -> pode vir como Blob

Para cobrir todos os cenarios, o codigo fara:

```typescript
const { data, error } = await supabase.functions.invoke('mikrotik-script-generator', {
  body: { hotspot_id: hotspotId },
});
if (error) throw error;

// Detectar formato da resposta
let scriptText: string;
if (typeof data === 'string') {
  scriptText = data;
} else if (data && typeof data.text === 'function') {
  scriptText = await data.text();
} else if (data?.bootstrap_script) {
  // Fallback JSON antigo
  return data;
} else {
  throw new Error('Formato de resposta inesperado');
}

return {
  bootstrap_script: scriptText,
  finalize_script: '',
  version: scriptText.match(/v(\d+\.\d+\.\d+)/)?.[1] || '7.2.0',
};
```

## Resultado Esperado

- Bootstrap `.rsc` retornado como texto puro com newlines reais
- Frontend continua funcionando, extraindo versao via regex
- Download direto via curl/browser retorna arquivo `.rsc` pronto
- Compatibilidade mantida com formato JSON antigo (fallback)
- Endpoint `mikrotik-scripts` (Sync/AP/Guardian) ja funciona corretamente -- sem mudancas

