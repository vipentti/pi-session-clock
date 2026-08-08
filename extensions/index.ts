/**
 * pi-session-clock — Session duration + wall clock in the Pi footer.
 *
 * Config precedence (highest first):
 *   1. Environment variables (PI_SESSION_CLOCK_*)
 *   2. User-level JSON: $XDG_CONFIG_HOME/pi-session-clock.json (~/.config/pi-session-clock.json)
 *   3. Project-level JSON: <cwd>/.pi/pi-session-clock.json (trust-gated)
 *
 * JSON keys: timeFormat, durationStyle
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { fmtDuration, fmtTime } from "../src/format.js";
import { loadJSON, projectConfigPath, resolveConfig, userConfigPath, type ResolvedConfig, DEFAULTS } from "../src/config.js";

// User config (loaded once at startup, no trust needed)
const userConfig = loadJSON(userConfigPath()) ?? {};

export default function (pi: ExtensionAPI) {
  // Effective config — always recomputed unconditionally at session_start.
  let cfg: ResolvedConfig = DEFAULTS;
  let sessionStart = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(ctx: ExtensionContext) {
    const now = new Date();
    const elapsed = now.getTime() - sessionStart;
    const duration = fmtDuration(elapsed, cfg.durationStyle);
    const clock = fmtTime(cfg.timeFormat, now);
    ctx.ui.setStatus("session-clock", ctx.ui.theme.fg("dim", `${duration}  ${clock}`));
  }

  pi.on("session_start", (_event, ctx) => {
    // Unconditionally recompute config — prevents project-config leaks across sessions.
    const projectConfig = ctx.isProjectTrusted()
      ? (loadJSON(projectConfigPath(ctx.cwd, CONFIG_DIR_NAME)) ?? {})
      : {};
    cfg = resolveConfig(projectConfig, userConfig, process.env as Record<string, string | undefined>);

    sessionStart = Date.now();
    tick(ctx);
    timer = setInterval(() => tick(ctx), 1000);
  });

  pi.on("session_shutdown", () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });
}
