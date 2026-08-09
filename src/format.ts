/**
 * Pure formatting functions — testable, no side effects.
 */

import type { DurationStyle } from "./config.js";

export function fmtTime(format: string, d: Date): string {
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

/**
 * Shape-matching placeholder for a timeFormat: each known specifier becomes
 * dashes of the same width (%Y -> ----, %m/%d/%H/%M/%S -> --, %a/%b -> ---),
 * literal text is kept. Used before the first message of a direction arrives.
 */
export function fmtPlaceholder(format: string): string {
  return format
    .replace(/%Y/g, "----")
    .replace(/%m/g, "--")
    .replace(/%d/g, "--")
    .replace(/%H/g, "--")
    .replace(/%M/g, "--")
    .replace(/%S/g, "--")
    .replace(/%a/g, "---")
    .replace(/%b/g, "---");
}

export function fmtDuration(ms: number, style: DurationStyle): string {
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
