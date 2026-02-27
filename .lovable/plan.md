

# Fix: remaining "can not remove dynamic" errors in infra template

## Root cause

The previous fix added `dynamic=no` to 4 cleanup lines, but TWO other commands are not wrapped in `:do {} on-error={}`:

1. `/interface bridge host remove [find]` — at the bottom, bridge MAC table entries are dynamic and cannot be removed manually
2. `/ip firewall filter disable [find action=fasttrack-connection]` — at the top, fails if no fasttrack rule exists

Both cause the import to abort because they're executed raw without error handling.

## Fix (SQL UPDATE on `script_templates` id='infra')

### Line at top (FastTrack):
```routeros
# Before:
/ip firewall filter disable [find action=fasttrack-connection]

# After:
:do { /ip firewall filter disable [find action=fasttrack-connection] } on-error={}
```

### Line at bottom (bridge hosts):
```routeros
# Before:
/interface bridge host remove [find]

# After:
:do { /interface bridge host remove [find dynamic=no] } on-error={}
```

## Files modified

1. **SQL UPDATE `script_templates` (id='infra')** — wrap FastTrack disable + bridge host remove in error handlers, add `dynamic=no` to host cleanup
2. **`.lovable/plan.md`** — document fix

