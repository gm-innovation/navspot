

# Fix Sync Template: Split Multi-Property Set Command

## Problem

The `sync-standalone` template (v7.8.6) has a line in the `configure_hotspot_profile` handler that sets two properties in one command:

```routeros
:do { /ip hotspot profile set $hsp login-by=http-pap http-cookie-lifetime=1d } on-error={}
```

RouterOS 7 rejects this with "expected end of command" at column 64 (`http-cookie-lifetime` is parsed as a second command rather than a second property).

## Root Cause

This violates **RouterOS 7 Atomic Commands rule**: inside `:do {}` blocks, each property must be set individually.

## Fix

**Target:** `script_templates` table, row `id = 'sync-standalone'`

Replace template line 171:
```routeros
:do { /ip hotspot profile set $hsp login-by=http-pap http-cookie-lifetime=1d } on-error={}
```

With two separate commands:
```routeros
:do { /ip hotspot profile set $hsp login-by=cookie,http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsp http-cookie-lifetime=3d } on-error={}
```

This also aligns `login-by` with the recovery script's value (`cookie,http-pap,http-chap` and `3d` lifetime) instead of just `http-pap` and `1d`.

## Implementation

One SQL UPDATE to patch the template content, replacing the single multi-property line with two single-property lines. Bump version to `7.8.7`.

## Verification

After the database update, trigger a new recovery or sync. The `navspot-sync` script should execute without syntax errors.

