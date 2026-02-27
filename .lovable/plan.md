

# Fix: "can not remove dynamic" error in infra template

## Problem

The cleanup section uses `comment~"navspot"` wildcard which matches **dynamic** firewall rules auto-created by the Hotspot server. RouterOS does not allow removing dynamic rules manually.

## Fix

Add `dynamic=no` filter to all cleanup `find` commands that can match dynamic entries:

```routeros
# Section 1 - these two lines change:
:do { /ip firewall nat remove [find comment~"navspot" dynamic=no] } on-error={}
:do { /ip firewall filter remove [find comment~"navspot" dynamic=no] } on-error={}
:do { /ip hotspot walled-garden remove [find comment="navspot" dynamic=no] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment="navspot" dynamic=no] } on-error={}
```

## Files to modify

1. **SQL UPDATE `script_templates` (id='infra')** — add `dynamic=no` to 4 cleanup lines
2. **`gen7post/index.ts`** — no change needed (version stays 7.9.27)
3. **`.lovable/plan.md`** — document fix

