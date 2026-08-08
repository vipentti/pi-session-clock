/**
 * pi-session-clock — Session duration + wall clock + optional message timestamps.
 *
 * Config precedence (highest first):
 *   1. Environment variables (PI_SESSION_CLOCK_*)
 *   2. User-level JSON: $XDG_CONFIG_HOME/pi-session-clock.json (~/.config/pi-session-clock.json)
 *   3. Project-level JSON: <cwd>/.pi/pi-session-clock.json (trust-gated)
 *
 * JSON keys: timeFormat, durationStyle, messageTimestamps
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { fmtDuration, fmtTime } from "../src/format.js";
import { loadJSON, projectConfigPath, resolveConfig, userConfigPath } from "../src/config.js";

// ── Config ──────────────────────────────────────────────────────────
// User config (loaded once at startup, no trust needed)
const userConfig = loadJSON(userConfigPath()) ?? {};

// Runtime config (mutated in session_start when project config loads)
let cfg = resolveConfig(userConfig);
// ─────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Session clock ──────────────────────────────────────────────
  let sessionStart = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(ctx: ExtensionContext) {
    const now = new Date();
    const elapsed = now.getTime() - sessionStart;
    const duration = fmtDuration(elapsed, cfg.durationStyle!);
    const clock = fmtTime(cfg.timeFormat!, now);
    ctx.ui.setStatus("session-clock", ctx.ui.theme.fg("dim", `${duration}  ${clock}`));
  }

  pi.on("session_start", (_event, ctx) => {
    // Load project config (trust-gated, lowest precedence)
    if (ctx.isProjectTrusted()) {
      const projectConfig = loadJSON(projectConfigPath(ctx.cwd, CONFIG_DIR_NAME));
      if (projectConfig) {
        cfg = resolveConfig(projectConfig, userConfig, process.env as Record<string, string | undefined>);
      }
    }

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

  // ── Message timestamps ──────────────────────────────────────────
  // Always register; gated at runtime via cfg.messageTimestamps

  let lastTs: { user?: number; assistant?: number } = {};

  pi.on("message_start", (event) => {
    const ts = (event.message as { timestamp?: number }).timestamp ?? Date.now();
    if (event.message.role === "user") lastTs.user = ts;
    else if (event.message.role === "assistant") lastTs.assistant = ts;
  });

  pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
    if (!cfg.messageTimestamps || isStreaming || markdown === "") return markdown;

    const ts =
      messageType === "user"
        ? lastTs.user
        : messageType === "assistant"
          ? lastTs.assistant
          : undefined;

    if (ts == null) return markdown;

    const time = new Date(ts).toLocaleTimeString("en", { hour12: false });
    return `\`${time}\`  \n${markdown}`;
  });
}
