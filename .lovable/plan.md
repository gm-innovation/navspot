

# Plano: collapseSourceBlocks no gen7post

## Estado confirmado

| Verificação | Resultado |
|---|---|
| Banco tem `\n` literais? | Nao — 0 ocorrencias |
| Banco tem newlines reais? | Sim — posicao 44+ |
| Padrao de abertura | `source="\n` (aspas + newline) |
| Padrao de fechamento | `\n"\n` (newline, aspas sozinha, newline) |
| Templates afetados | `sync-standalone`, `guardian-standalone` |

O banco esta correto. O problema e exclusivamente no RouterOS: o parser do `/import` nao consegue processar blocos `source="..."` multi-linha com 187 linhas. Precisa entregar como linha unica com `\r\n`.

## Abordagem: parser linha-a-linha (nao regex)

Conforme a sua sugestao, a abordagem segura e processar linha a linha em vez de regex fragil:

```typescript
function collapseSourceBlocks(script: string): string {
  const lines = script.split("\n");
  const out: string[] = [];
  let inSource = false;
  let sourceLines: string[] = [];
  let sourcePrefix = "";

  for (const line of lines) {
    if (!inSource) {
      if (line.endsWith('source="')) {
        inSource = true;
        sourceLines = [];
        sourcePrefix = line;  // ex: /system script add name="navspot-sync" ... source="
      } else {
        out.push(line);
      }
    } else {
      if (line === '"') {
        // Fecha o bloco — colapsar tudo numa linha
        const collapsed = sourceLines.join("\\r\\n");
        out.push(sourcePrefix + collapsed + '"');
        inSource = false;
        sourceLines = [];
        sourcePrefix = "";
      } else {
        sourceLines.push(line);
      }
    }
  }

  // Seguranca: se ficou aberto (nao encontrou fechamento), retorna original
  if (inSource) {
    return script;
  }

  return out.join("\n");
}
```

Deteccao de abertura: qualquer linha que termina exatamente com `source="` (cobre `add` e `set`).

Deteccao de fechamento: linha que e exatamente `"` (aspas sozinha).

Fallback: se o bloco nunca fecha, retorna o script original sem modificacao.

## Alteracao no gen7post

Uma unica mudanca: adicionar `collapseSourceBlocks` e chama-la no final da funcao `tpl()`.

Na linha 8 do `gen7post/index.ts`, a funcao `tpl` atual:

```typescript
const tpl=async(id:string,v:Record<string,string>)=>{
  ...
  return c.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
};
```

Passa a ser:

```typescript
const tpl=async(id:string,v:Record<string,string>)=>{
  ...
  c = c.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  return collapseSourceBlocks(c);
};
```

A funcao `collapseSourceBlocks` e adicionada antes do `Deno.serve`.

## O que muda no output

**Antes** (multi-linha — RouterOS falha no /import):
```
/system script add name="navspot-sync" policy=read,write,test source="
:log info \"NAVSPOT-SYNC: START\"
:global navspotSyncLock
...
"
```

**Depois** (linha unica — RouterOS parseia corretamente):
```
/system script add name="navspot-sync" policy=read,write,test source=":log info \"NAVSPOT-SYNC: START\"\r\n:global navspotSyncLock\r\n..."
```

O RouterOS interpreta `\r\n` como newline real ao armazenar o script. O script executado tera quebras de linha normais.

## Impacto

- Modo `serve` (download direto pelo router): afetado — output colapsado
- Modo `generate` (painel → Storage): afetado — arquivos .rsc no Storage ja vem colapsados
- Templates no banco: inalterados — continuam legiveis com newlines reais
- Templates sem `source="`: inalterados — o `infra` nao tem blocos source, passa direto

## Apos implementacao

Regenerar scripts pelo painel e reimportar no router. Nenhuma alteracao de banco necessaria.

