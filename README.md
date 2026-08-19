# pi-session-clock

Pi extension: session duration + configurable clock in the footer status bar.

![pi-session-clock in action](https://raw.githubusercontent.com/vipentti/pi-session-clock/main/assets/demo.png)

## Install

Install from npm:

```bash
pi install npm:pi-session-clock
```

Alternatively, install directly from GitHub:

```bash
pi install git:github.com/vipentti/pi-session-clock
```

## What it does

- **Session duration** in the footer — elapsed time since session start. Auto-scales: `12s` → `3:42` → `1:02:33`.
- **Wall clock** in the footer - configurable strftime format alongside the duration.
- **Message times** in one footer status - `↑` for the last message you sent and `↓` for the last message received. Both arrows are always visible (`↑14:02  ↓14:05`), showing a dash placeholder (`↑--:--`) until each direction has its first message.
- **Prompt timer** in the footer — agent-processing time from `before_agent_start` to the idle `agent_settled` (`⏱ 4s`) plus attempted tool calls (`🔧2`), shown as `⏱ 4s  🔧2`. Ticks live once per second while the agent is working and freezes at `agent_settled` (fully done, no retries or queued follow-ups) through idle until the next prompt. Submission/expansion/compaction latency before the agent loop is excluded; the duration reuses `durationStyle`. The tool count is attempted invocations between `before_agent_start` and the idle `agent_settled` counted via `tool_execution_start` (one per invocation including parallel batches, before any blocking; extensions that block later at `tool_call` cannot hide attempts). Hidden until the first prompt after session start, cleared on session boundary.

## Config

Three layers, highest precedence first:

1. **Environment variables** — `PI_SESSION_CLOCK_*`
2. **User JSON** — `$XDG_CONFIG_HOME/pi-session-clock.json` (default `~/.config/pi-session-clock.json`)
3. **Project JSON** — `<project>/.pi/pi-session-clock.json` (only read when project is trusted)

All keys are optional; missing keys fall through to the next layer. Defaults shown below.

### JSON files

```json
{
  "timeFormat": "%H:%M",
  "durationStyle": "auto",
  "showSent": true,
  "showReceived": true
}
```

### Environment variables

```bash
# Clock format (strftime subset: %Y %m %d %H %M %S %a %b)
PI_SESSION_CLOCK_TIME_FORMAT="%H:%M"

# Duration style: "auto" | "seconds" | "compact" | "full"
PI_SESSION_CLOCK_DURATION_STYLE="auto"

# Message footer statuses, both default to true
PI_SESSION_CLOCK_SHOW_SENT="true"
PI_SESSION_CLOCK_SHOW_RECEIVED="true"
```

Set `showSent` or `showReceived` to `false`, or set its environment variable to `false`, to hide that direction's arrow (both `false` hides the message status entirely). Missing keys keep message statuses enabled.

### Precedence example

With project JSON `{"timeFormat": "%H:%M:%S"}`, user JSON `{"durationStyle": "compact"}`, and `PI_SESSION_CLOCK_TIME_FORMAT="%a %H:%M"`:
- `timeFormat` → `"%a %H:%M"` (env wins)
- `durationStyle` → `"compact"` (user JSON, no env set)

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
