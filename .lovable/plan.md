

# Fix applied: "can not remove dynamic" error in infra template

## Problem

The cleanup section used `comment~"navspot"` wildcard which matched **dynamic** firewall rules auto-created by the Hotspot server. RouterOS does not allow removing dynamic rules manually.

## Fix (applied)

Added `dynamic=no` filter to 4 cleanup `find` commands:

```routeros
:do { /ip firewall nat remove [find comment~"navspot" dynamic=no] } on-error={}
:do { /ip firewall filter remove [find comment~"navspot" dynamic=no] } on-error={}
:do { /ip hotspot walled-garden remove [find comment="navspot" dynamic=no] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment="navspot" dynamic=no] } on-error={}
```

## Files modified

1. **SQL UPDATE `script_templates` (id='infra')** — added `dynamic=no` to 4 cleanup lines
2. **`gen7post/index.ts`** — no change needed (version stays 7.9.27)
3. **`.lovable/plan.md`** — documented fix
