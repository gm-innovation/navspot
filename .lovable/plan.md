

# Fix: Simplify update_user Handler — Too Many Properties on Set Line

## Root Cause

The error at **line 158 column 95** points to the `update_user` handler's `:do { /ip hotspot user set ... }` line (my line count is off by ~2 due to infra template rendering differences). This line has **135 characters** and **5 properties** after `set`:

```text
:do { /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr comment=navspot disabled=no } on-error={
                                                                                          ^col 95
```

Column 95 falls right at `comment=navspot` or `disabled=no`. The parser resolves `profile=\$pr` and then fails at the next property — too many properties on a single `set` command at this nesting depth (L6).

**Proof**: The `create_user` handler uses the **exact same pattern** with only 3 properties (`password`, `profile` via find) and **works perfectly**:
```routeros
:do { /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr } on-error={
```

## Fix

Make `update_user` identical to `create_user` — only set `password` and `profile`. The `comment` doesn't need updating (already set at creation), and `disabled=no` goes on a separate line:

**Before (fails — 5 properties at L6):**
```routeros
:do { /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr comment=navspot disabled=no } on-error={
    /ip hotspot user add name=\$un password=\$pw profile=\$pr comment=navspot
}
```

**After (works — 3 properties at L6, matching create_user):**
```routeros
:do { /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr } on-error={
    /ip hotspot user add name=\$un password=\$pw profile=\$pr comment=navspot
}
:do { /ip hotspot user set [find name=\$un] disabled=no } on-error={}
```

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Split the `update_user` set into two lines (password+profile, then disabled=no separately)
- Remove `comment=navspot` from the `set` (already set on creation)
- Bump version to `7.8.13`

## Why This Works

The `create_user` handler with 3 properties on `set [find ...]` works at the same depth. The `update_user` handler with 5 properties fails. By reducing to 3 properties (matching `create_user` exactly) and moving `disabled=no` to a separate command, we stay within the parser's tolerance at L6.

## Risk

Very low. The `comment=navspot` is set during user creation and never changes — no need to re-set it on update. The `disabled=no` on a separate line uses `on-error={}` so it won't crash if the user doesn't exist (the previous set already handled the user).

