

# Add Android Connectivity Check Domains to Walled Garden (v7.2.0)

## Context

Android devices perform connectivity checks by reaching `connectivitycheck.gstatic.com`. If this domain is blocked by the hotspot captive portal, devices show "Internet Indisponible" and may auto-disconnect from Wi-Fi before the user ever sees the login page. Adding these domains to the initial Walled Garden rules ensures a smooth captive portal experience on all Android devices.

## Reinstall Safety

The cleanup block (line 344) already removes all entries with `comment="navspot-initial"` before re-creating them, so running v7.2.0 over v7.1.62 will NOT cause duplicates.

## Changes

### File: `supabase/functions/mikrotik-script-generator/index.ts`

**1. Version bump** (line 8): `"7.1.62"` to `"7.2.0"`

**2. Update login-by** (line 460): Add `http-chap` for device compatibility:
```
login-by=cookie,http-pap,http-chap
```

**3. Add cookie lifetime** (after line 461): New line:
```
/ip hotspot profile set [find name="hsprof-navspot"] http-cookie-lifetime=3d
```

**4. Add Walled Garden rules** (after line 463, right after "Hotspot criado" log): Insert 5 entries covering all infrastructure + Android connectivity:
```routeros
# 10.1 WALLED GARDEN INICIAL (infraestrutura + Android CNA)
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.navspot.com.br" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.googleapis.com" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-initial"
:log info "NAVSPOT v7.2.0: Walled Garden inicial configurado (5 regras)"
```

### File: `supabase/functions/mikrotik-scripts/index.ts`

**5. Version bump** (line 38): `"7.1.62"` to `"7.2.0"`

**6. Update login-by in sync fallback, AP Core, and AP Full**: Change all occurrences of `login-by=cookie,http-pap` to `login-by=cookie,http-pap,http-chap` for consistency with the bootstrap.

## Verification

1. Generate a new script from the panel -- confirm header shows `v7.2.0`
2. Search the `.rsc` file for `connectivitycheck.gstatic.com` -- must be present
3. Confirm `login-by=cookie,http-pap,http-chap` in the hotspot profile section
4. On router after import: `/ip hotspot walled-garden print` should show 5 `navspot-initial` entries
5. Re-run import over existing install: `/ip hotspot walled-garden print` should still show exactly 5 entries (no duplicates)

