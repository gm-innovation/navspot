

# Fix: Hotspot Auto-Start on Router Reboot

## Root Cause

After a router reboot, the hotspot server `hs-navspot` is found disabled or missing. The current system has **no mechanism to detect or fix this**:

- The **guardian** script checks for scripts, schedulers, login-url, and version -- but never checks if the hotspot server is actually **enabled and running**.
- The **installer** creates schedulers with `start-time=startup` for sync and guardian, but neither re-enables the hotspot on boot.
- On MikroTik hAP ax2 and similar models, if `bridge1` isn't fully initialized when the hotspot tries to bind on boot, the hotspot can auto-disable itself silently.

## Solution: Two-Layer Protection

### Layer 1: Guardian Self-Healing (template update)

Add a hotspot-enabled check to the `guardian` template. If `hs-navspot` exists but is disabled, re-enable it immediately:

```
:local hsId [/ip hotspot find name="hs-navspot"]
:if ([:len $hsId] > 0) do={
  :local hsDisabled [/ip hotspot get $hsId disabled]
  :if ($hsDisabled = true) do={
    /ip hotspot enable $hsId
    :log warning "NAVSPOT-GUARDIAN: Hotspot estava desligado - reativado!"
    :set needsRepair 1
    :set missing ($missing . "hs-disabled ")
  }
} else={
  :set needsRepair 1
  :set missing ($missing . "hs-missing ")
}
```

This runs every 10 minutes, catching hotspots that disable themselves at any time.

### Layer 2: Startup Enabler (installer template update)

Add a dedicated startup scheduler to the `installer` template that waits for interfaces to initialize and then ensures the hotspot is enabled:

```
:do { /system scheduler remove [find where name="navspot-startup"] } on-error={}
/system scheduler add name="navspot-startup" interval=0 start-time=startup start-date=jan/01/1970 on-event=":delay 15s; :do { /ip hotspot enable [find name=hs-navspot] } on-error={}; :log info \"NAVSPOT-STARTUP: Hotspot habilitado\""
```

The 15-second delay ensures `bridge1` and WiFi interfaces are fully initialized before enabling the hotspot.

## Files Modified

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_hotspot_autostart.sql` | UPDATE `guardian` and `installer` templates in `script_templates` |

## Migration SQL

A single migration will:

1. **UPDATE `guardian` template**: Add the hotspot-enabled check block before the existing `needsRepair` decision, and add a check for hotspot server existence.

2. **UPDATE `installer` template**: Add the `navspot-startup` scheduler after the existing scheduler creation block (after line 94 of the current template).

3. **UPDATE `bootstrap` template**: Add the same startup scheduler creation in the bootstrap flow, ensuring new installations also get the protection.

4. Set `version = '7.8.26'` on all updated templates.

## Execution Order

1. SQL migration updates 3 templates (guardian, installer, bootstrap)
2. Existing routers: the guardian running on the next cycle won't have the new code yet -- but new script generations via "Regenerar Scripts" will include the fix
3. To propagate to existing routers: user must click "Regenerar Scripts" and update the router, OR trigger a recovery

## Expected Result

- **Immediate on reboot**: The `navspot-startup` scheduler fires 15s after boot and enables the hotspot
- **Ongoing**: Guardian checks every 10 minutes and re-enables if disabled
- **New installs**: Both protections are included from the start

