/**
 * pi-session-clock - Session duration + wall clock in the Pi footer.
 *
 * Config precedence (highest first):
 *   1. Environment variables (PI_SESSION_CLOCK_*)
 *   2. User-level JSON: $XDG_CONFIG_HOME/pi-session-clock.json (~/.config/pi-session-clock.json)
 *   3. Project-level JSON: <cwd>/.pi/pi-session-clock.json (trust-gated)
 *
 * JSON keys: timeFormat, durationStyle, showSent, showReceived
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fmtDuration, fmtTime, fmtTimestamp } from "../src/format.js";
import { loadJSON, projectConfigPath, resolveConfig, userConfigPath, type ResolvedConfig, DEFAULTS } from "../src/config.js";

// User config (loaded once at startup, no trust needed)
const userConfig = loadJSON(userConfigPath()) ?? {};

export default function (pi: ExtensionAPI) {
  // Effective config — always recomputed unconditionally at session_start.
  let cfg: ResolvedConfig = DEFAULTS;
  let sessionStart = 0;
  let lastSent: number | undefined;
  let lastReceived: number | undefined;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(ctx: ExtensionContext) {
    const now = new Date();
    const elapsed = now.getTime() - sessionStart;
    const duration = fmtDuration(elapsed, cfg.durationStyle);
    const clock = fmtTime(cfg.timeFormat, now);
    ctx.ui.setStatus("session-clock", ctx.ui.theme.fg("dim", `${duration}  ${clock}`));
    ctx.ui.setStatus(
      "session-clock-sent",
      cfg.showSent && lastSent !== undefined
        ? ctx.ui.theme.fg("dim", `↑${fmtTimestamp(cfg.timeFormat, lastSent)}`)
        : undefined,
    );
    ctx.ui.setStatus(
      "session-clock-received",
      cfg.showReceived && lastReceived !== undefined
        ? ctx.ui.theme.fg("dim", `↓${fmtTimestamp(cfg.timeFormat, lastReceived)}`)
        : undefined,
    );
  }

  pi.on("session_start", (_event, ctx) => {
    // Unconditionally recompute config — prevents project-config leaks across sessions.
    const projectConfig = ctx.isProjectTrusted()
      ? (loadJSON(projectConfigPath(ctx.cwd)) ?? {})
      : {};
    cfg = resolveConfig(projectConfig, userConfig, process.env as Record<string, string | undefined>);

    sessionStart = Date.now();
    lastSent = undefined;
    lastReceived = undefined;
    if (timer !== null) clearInterval(timer);
    tick(ctx);
    timer = setInterval(() => tick(ctx), 1000);
  });

  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "user") return;
    lastSent = event.message.timestamp;
    tick(ctx);
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    lastReceived = event.message.timestamp;
    tick(ctx);
  });

  pi.on("session_shutdown", () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });
}
