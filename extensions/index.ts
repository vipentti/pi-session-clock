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
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Config ──────────────────────────────────────────────────────────
interface Config {
  timeFormat?: string;
  durationStyle?: string;
  messageTimestamps?: boolean;
}

const DEFAULTS: Config = {
  timeFormat: "%H:%M",
  durationStyle: "auto",
  messageTimestamps: false,
};

function loadJSON(path: string): Config | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch {
    return null;
  }
}

function userConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "pi-session-clock.json");
}

function projectConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, "pi-session-clock.json");
}

// User config (loaded once at startup, no trust needed)
const userConfig = loadJSON(userConfigPath()) ?? {};

function resolveConfig(overrides?: Config): Config {
  const merged = { ...DEFAULTS, ...overrides, ...userConfig };
  // Env vars override everything
  if (process.env.PI_SESSION_CLOCK_TIME_FORMAT !== undefined) merged.timeFormat = process.env.PI_SESSION_CLOCK_TIME_FORMAT;
  if (process.env.PI_SESSION_CLOCK_DURATION_STYLE !== undefined) merged.durationStyle = process.env.PI_SESSION_CLOCK_DURATION_STYLE;
  if (process.env.PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS !== undefined) merged.messageTimestamps = process.env.PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS === "true";
  return merged;
}

// Runtime config (mutated in session_start when project config loads)
let cfg = resolveConfig();
// ─────────────────────────────────────────────────────────────────────

function fmtTime(format: string, d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return format
    .replace(/%Y/g, String(d.getFullYear()))
    .replace(/%m/g, pad(d.getMonth() + 1))
    .replace(/%d/g, pad(d.getDate()))
    .replace(/%H/g, pad(d.getHours()))
    .replace(/%M/g, pad(d.getMinutes()))
    .replace(/%S/g, pad(d.getSeconds()))
    .replace(/%a/g, d.toLocaleDateString("en", { weekday: "short" }))
    .replace(/%b/g, d.toLocaleDateString("en", { month: "short" }));
}

function fmtDuration(ms: number, style: string): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (style) {
    case "seconds":
      return `${totalSec}s`;
    case "compact":
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    case "full":
      return `${h}:${pad(m)}:${pad(s)}`;
    default: // auto
      if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
      if (m > 0) return `${m}:${pad(s)}`;
      return `${s}s`;
  }
}

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
      const projectConfig = loadJSON(projectConfigPath(ctx.cwd));
      if (projectConfig) {
        cfg = resolveConfig(projectConfig);
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
