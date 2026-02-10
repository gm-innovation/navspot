

# Fix: Separate Profile Properties into Individual Commands + Remove Quotes

## Root Cause (Updated Analysis)

The error `expected end of command (line 198 column 29)` persists because:

1. The quotes around `"$lu"` and `"$dn"` may confuse the parser in this deeply nested context (the working Action Processor at line 1031 uses `login-url=$lu` WITHOUT quotes)
2. Combining `login-url` and `dns-name` on the same `/set` command increases parser complexity

The memory note (profile-configuration-pattern) explicitly states: "A configuracao do perfil de hotspot deve separar as propriedades em comandos /set distintos".

## Change -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Line 941: Remove quotes + split into separate commands

**Before (line 941):**
```
/ip hotspot profile set $hp login-url="$lu" dns-name="$dn"
```

**After (lines 941-942, adds 1 line):**
```
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
```

Two changes:
1. Removed quotes around `$lu` and `$dn` to match the proven AP pattern (line 1031)
2. Split into separate `/set` commands per the v7.1.62c separation guideline

The `login-by` command on the next line already follows this pattern (separate command, no quotes on enum).

## Why This Should Work

The Action Processor uses the exact same command at line 1031 (`/ip hotspot profile set $hp login-url=$lu dns-name=$dn`) and it works. However, the AP is at ~9 nesting levels while the fallback is at ~13. By separating into simpler single-property commands, we reduce the parser complexity at each line and eliminate any interaction between `login-url` value parsing and the `dns-name` parameter.

## Technical Detail

```text
Nesting at line 941:
 1. :do {              (main error handler, TS 751)
 2. :if ($ok) do={     (fetch success, TS 830)
 3. :if (($s>=0)..     (markers found, TS 841)
 4. :if ([:len $a]>0)  (has actions, TS 849)
 5. :if ($wok)         (write OK, TS 865)
 6. else {             (AP section, TS 879)
 7. :if ($navspotLock="0") (lock free, TS 897)
 8. else {             (AP failed, TS 915)
 9. :if ([:len $fallD]>0)  (has data, TS 920)
10. :do {              (fallback error handler, TS 924)
11. :while ... do={    (action loop, TS 925)
12. :if (configure_hp) (match, TS 929)
13. :if ($pp2>=0)      (has pipe, TS 933)
14. :if ([:len $hp]>0) (profile found, TS 940)
     --> /ip hotspot profile set  <-- 14 levels deep
```

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. `/system script run navspot-sync` -- no more `expected end of command`
4. `/ip hotspot profile print` -- confirm `login-url`, `dns-name`, and `login-by` are set

