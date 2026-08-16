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
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { fmtDuration, fmtPlaceholder, fmtTime } from "../src/format.js";
import { loadJSON, projectConfigPath, resolveConfig, userConfigPath, type ResolvedConfig, DEFAULTS } from "../src/config.js";

// User config (loaded once at startup, no trust needed)
const userConfig = loadJSON(userConfigPath()) ?? {};

export default function (pi: ExtensionAPI) {
  // Effective config — always recomputed unconditionally at session_start.
  let cfg: ResolvedConfig = DEFAULTS;
  let sessionStart = 0;
  let lastSentAt: Date | undefined;
  let lastReceivedAt: Date | undefined;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Per-prompt agent-processing timer + tool-call counter (always-on, section 6).
  // Measures from before_agent_start to the idle agent_settled (submission/expansion/
  // compaction before the loop is excluded). promptStartMs is wall-time at
  // before_agent_start; undefined until the first prompt. promptSettledAt is the
  // frozen wall-time at the idle agent_settled; undefined while the prompt is in
  // flight (including continuations that keep isIdle()==false). promptToolCount
  // counts tool_execution_start events between before_agent_start and the idle
  // agent_settled so a blocking tool_call handler before us cannot hide attempts.
  // The single session tick repaints the prompt band while active; execution and
  // settle handlers repaint immediately.
  let promptStartMs: number | undefined;
  let promptSettledAt: number | undefined;
  let promptToolCount = 0;

  function promptStatus(ctx: ExtensionContext): string | undefined {
    if (promptStartMs === undefined) return undefined;
    const end = promptSettledAt ?? Date.now();
    const delta = end - promptStartMs;
    const elapsed = fmtDuration(delta, cfg.durationStyle);
    return ctx.ui.theme.fg("dim", `⏱ ${elapsed}  🔧${promptToolCount}`);
  }

  // One merged status key: sent part first, then received part, so the order
  // survives Pi's alphabetical footer key sorting. Each direction shows a
  // dash placeholder until its first message arrives.
  function messagesStatus(ctx: ExtensionContext): string | undefined {
    if (!cfg.showSent && !cfg.showReceived) return undefined;
    const parts: string[] = [];
    if (cfg.showSent) {
      const t = lastSentAt !== undefined ? fmtTime(cfg.timeFormat, lastSentAt) : fmtPlaceholder(cfg.timeFormat);
      parts.push(`↑${t}`);
    }
    if (cfg.showReceived) {
      const t = lastReceivedAt !== undefined ? fmtTime(cfg.timeFormat, lastReceivedAt) : fmtPlaceholder(cfg.timeFormat);
      parts.push(`↓${t}`);
    }
    return ctx.ui.theme.fg("dim", parts.join("  "));
  }

  function tick(ctx: ExtensionContext) {
    const now = new Date();
    const elapsed = now.getTime() - sessionStart;
    const duration = fmtDuration(elapsed, cfg.durationStyle);
    const clock = fmtTime(cfg.timeFormat, now);
    ctx.ui.setStatus("session-clock", ctx.ui.theme.fg("dim", `${duration}  ${clock}`));
    ctx.ui.setStatus("session-clock-messages", messagesStatus(ctx));
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  }

  pi.on("session_start", (_event, ctx) => {
    // Unconditionally recompute config — prevents project-config leaks across sessions.
    const projectConfig = ctx.isProjectTrusted()
      ? (loadJSON(projectConfigPath(ctx.cwd, CONFIG_DIR_NAME)) ?? {})
      : {};
    cfg = resolveConfig(projectConfig, userConfig, process.env as Record<string, string | undefined>);

    sessionStart = Date.now();
    lastSentAt = undefined;
    lastReceivedAt = undefined;
    if (timer !== null) clearInterval(timer);
    tick(ctx);
    timer = setInterval(() => tick(ctx), 1000);

    // Reset prompt timer: frozen value does not survive session boundary.
    promptStartMs = undefined;
    promptSettledAt = undefined;
    promptToolCount = 0;
    ctx.ui.setStatus("session-clock-prompt", undefined);
  });

  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "user") return;
    lastSentAt = new Date(event.message.timestamp);
    tick(ctx);
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    lastReceivedAt = new Date();
    tick(ctx);
  });

  pi.on("before_agent_start", (_event, ctx) => {
    promptStartMs = Date.now();
    promptSettledAt = undefined;
    promptToolCount = 0;
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  });

  pi.on("tool_execution_start", (_event, ctx) => {
    if (promptStartMs === undefined || promptSettledAt !== undefined) return;
    promptToolCount++;
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (promptStartMs === undefined) return;
    // Only freeze when truly idle. A continuation (triggerTurn:true custom message)
    // keeps isIdle()==false and must keep the timer and counter live.
    if (!ctx.isIdle()) return;
    promptSettledAt = Date.now();
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  });

  pi.on("session_shutdown", () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });
}
