/**
 * pi-session-clock — Session duration + wall clock + optional message timestamps.
 *
 * Config (env vars):
 *   PI_SESSION_CLOCK_TIME_FORMAT        – strftime format (default: "%H:%M")
 *   PI_SESSION_CLOCK_DURATION_STYLE     – "auto" | "seconds" | "compact" | "full" (default: "auto")
 *   PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS – "true" to decorate messages with HH:MM:SS (default: off)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Config ──────────────────────────────────────────────────────────
const TIME_FORMAT = process.env.PI_SESSION_CLOCK_TIME_FORMAT ?? "%H:%M";
const DURATION_STYLE = process.env.PI_SESSION_CLOCK_DURATION_STYLE ?? "auto";
const MESSAGE_TIMESTAMPS = process.env.PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS === "true";
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
    const duration = fmtDuration(elapsed, DURATION_STYLE);
    const clock = fmtTime(TIME_FORMAT, now);
    ctx.ui.setStatus("session-clock", ctx.ui.theme.fg("dim", `${duration}  ${clock}`));
  }

  pi.on("session_start", (_event, ctx) => {
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
  if (!MESSAGE_TIMESTAMPS) return;

  let lastTs: { user?: number; assistant?: number } = {};

  pi.on("message_start", (event) => {
    const ts = (event.message as { timestamp?: number }).timestamp ?? Date.now();
    if (event.message.role === "user") lastTs.user = ts;
    else if (event.message.role === "assistant") lastTs.assistant = ts;
  });

  pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
    if (isStreaming || markdown === "") return markdown;

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
