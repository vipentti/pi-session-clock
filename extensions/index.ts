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

  // Per-prompt completion timer + tool-call counter (always-on, section 6).
  // promptStartMs is the wall-time at before_agent_start; undefined when no prompt has run yet.
  // promptToolCount counts attempted tool_call events between before_agent_start and agent_settled.
  // promptTick repaints "⏱ <delta>  🔧<count>" once per second while a prompt is in flight.
  // agent_settled freezes the value and clears the tick; idle keeps the frozen value.
  let promptStartMs: number | undefined;
  let promptSettledAt: number | undefined;
  let promptToolCount = 0;
  let promptTick: ReturnType<typeof setInterval> | null = null;
  let promptCtx: ExtensionContext | null = null;

  function promptStatus(ctx: ExtensionContext): string | undefined {
    if (promptStartMs === undefined) return undefined;
    const end = promptSettledAt ?? Date.now();
    const delta = end - promptStartMs;
    const elapsed = fmtDuration(delta, cfg.durationStyle);
    return ctx.ui.theme.fg("dim", `⏱ ${elapsed}  🔧${promptToolCount}`);
  }

  function tickPrompt() {
    if (promptStartMs !== undefined && promptSettledAt === undefined && promptCtx !== null) {
      promptCtx.ui.setStatus("session-clock-prompt", promptStatus(promptCtx));
    }
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
    if (promptTick !== null) {
      clearInterval(promptTick);
      promptTick = null;
    }
    promptCtx = null;
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
    promptCtx = ctx;
    if (promptTick !== null) clearInterval(promptTick);
    ctx.ui.setStatus("session-clock-prompt", ctx.ui.theme.fg("dim", `⏱ ${fmtDuration(0, cfg.durationStyle)}  🔧0`));
    promptTick = setInterval(tickPrompt, 1000);
  });

  pi.on("tool_call", (_event, ctx) => {
    if (promptStartMs === undefined || promptTick === null) return;
    promptToolCount++;
    // Reuse the latest ctx for subsequent ticks.
    promptCtx = ctx;
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (promptStartMs === undefined) return;
    if (promptTick !== null) {
      clearInterval(promptTick);
      promptTick = null;
    }
    // Freeze to settled wall-time; keep value visible through idle until next prompt.
    promptSettledAt = Date.now();
    promptCtx = ctx;
    ctx.ui.setStatus("session-clock-prompt", promptStatus(ctx));
  });

  pi.on("session_shutdown", () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (promptTick !== null) {
      clearInterval(promptTick);
      promptTick = null;
    }
    promptCtx = null;
  });
}
