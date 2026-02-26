

# v7.9.16 — Fix `tpl()`: strip seletivo + ordem correta

## Mudanças em `supabase/functions/gen7post/index.ts`

### 1. Version bump (linha 2)
`"7.9.15"` → `"7.9.16"`

### 2. `tpl()` reescrita (linha 37)
Ordem atual (errada): `replaceAll` → `CRLF` → (sem strip)

Ordem nova (correta):
1. CRLF normalize
2. `trimStart()` só fora de blocos `source="..."`
3. `replaceAll` variáveis

```typescript
const tpl=async(id:string,v:Record<string,string>)=>{
  const t=await rest("script_templates",{id:"eq."+id,select:"content"});
  if(!t?.content)throw new Error("TPL:"+id);
  let c:string=t.content;
  // 1. Normaliza CRLF
  c=c.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  // 2. Strip leading whitespace só fora de source="..."
  let inSrc=false;
  c=c.split("\n").map((l:string)=>{
    if(!inSrc)l=l.trimStart();
    if(l.includes('source="'))inSrc=true;
    if(inSrc&&l.trimStart()==='"')inSrc=false;
    return l;
  }).join("\n");
  // 3. Substitui variáveis por último
  for(const[k,val]of Object.entries(v))c=c.replaceAll(k,val);
  return c;
};
```

### 3. `replaceSourceWithImport` — adicionar remove antes do import (linha 14-15)
Inserir `:do { /system script remove [find name="navspot-${scriptName}"] } on-error={}` antes da linha `/import`.

### 4. `.lovable/plan.md` — atualizar versão e documentar fix

Nenhum outro arquivo muda.

