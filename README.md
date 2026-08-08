# pi-session-clock

Pi extension: session duration + configurable clock in the footer status bar.
Optional per-message timestamps in chat.

## Install

```bash
pi install git+https://github.com/vipentti/pi-session-clock.git
```

## What it does

- **Session duration** in the footer — elapsed time since session start. Auto-scales: `12s` → `3:42` → `1:02:33`.
- **Wall clock** in the footer — configurable strftime format alongside the duration.
- **Message timestamps** (opt-in) — decorates each user/assistant message with `HH:MM:SS` prefix.

## Config

All config via environment variables. Defaults shown:

```bash
# Clock format (strftime subset: %Y %m %d %H %M %S %a %b)
PI_SESSION_CLOCK_TIME_FORMAT="%H:%M"

# Duration style: "auto" | "seconds" | "compact" | "full"
PI_SESSION_CLOCK_DURATION_STYLE="auto"

# Enable per-message timestamps in chat
PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS="true"
```

### Duration styles

| Style | < 60s | < 1h | ≥ 1h |
|-------|-------|------|------|
| `auto` | `42s` | `3:42` | `1:02:33` |
| `seconds` | `42s` | `252s` | `3753s` |
| `compact` | `0:42` | `3:42` | `1:02:33` |
| `full` | `0:00:42` | `0:03:42` | `1:02:33` |

### Time format examples

| Format | Output |
|--------|--------|
| `%H:%M` | `14:35` |
| `%H:%M:%S` | `14:35:02` |
| `%a %d %b %H:%M` | `Mon 07 Apr 14:35` |
| `%Y-%m-%d %H:%M:%S` | `2025-04-07 14:35:02` |
