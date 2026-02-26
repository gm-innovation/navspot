

# Fix: Strip `\r` from template lines in `extractSourceBody`

## Problem

The database templates have CRLF (`\r\n`) line endings. `extractSourceBody` splits on `\n` but leaves trailing `\r` on each line. When served via `/tool fetch` → `/file get`, RouterOS interprets the `\r` as command separators, producing the `\;     \n` pattern in the stored source.

## Fix in `gen7post/index.ts` (line 3)

Add `line.replace(/\r$/, "")` to strip trailing `\r` from each line before processing. The `body.join("\n")` stays as real newline (not escaped) — the fetch-based approach relies on `/file get` delivering real newlines.

```typescript
function extractSourceBody(script:string):string{
  const lines=script.split("\n");
  let inSource=false;
  const body:string[]=[];
  for(const line of lines){
    const cl=line.replace(/\r$/,"");
    if(!inSource){
      if(cl.endsWith('source="')){inSource=true;continue;}
      continue;
    }
    if(cl==='"'){break;}
    body.push(cl);
  }
  return body.join("\n")
    .replace(/\\\\/g,'\x00')
    .replace(/\\"/g,'"')
    .replace(/\\\$/g,'$')
    .replace(/\x00/g,'\\');
}
```

## Version bump

`7.9.13` → `7.9.14`

## No other changes

