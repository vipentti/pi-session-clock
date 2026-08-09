/**
 * Pure formatting functions — testable, no side effects.
 */

import type { DurationStyle } from "./config.js";

type TimeToken = { format: (d: Date) => string; width: number };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Single source of strftime token knowledge: specifier -> formatter and
 * placeholder width. Both fmtTime and fmtPlaceholder consume this table, so
 * the supported specifier set lives in exactly one place.
 */
const TIME_TOKENS: Record<string, TimeToken> = {
  "%Y": { format: (d) => String(d.getFullYear()), width: 4 },
  "%m": { format: (d) => pad(d.getMonth() + 1), width: 2 },
  "%d": { format: (d) => pad(d.getDate()), width: 2 },
  "%H": { format: (d) => pad(d.getHours()), width: 2 },
  "%M": { format: (d) => pad(d.getMinutes()), width: 2 },
  "%S": { format: (d) => pad(d.getSeconds()), width: 2 },
  "%a": { format: (d) => d.toLocaleDateString("en", { weekday: "short" }), width: 3 },
  "%b": { format: (d) => d.toLocaleDateString("en", { month: "short" }), width: 3 },
};

// Derived from the token keys so the specifier set is not duplicated here.
const TOKEN_RE = new RegExp(
  "%[" + Array.from(Object.keys(TIME_TOKENS), (k) => k[1]).join("") + "]",
  "g",
);

/** Format a Date with the supported strftime subset; unknown specifiers and literal text pass through. */
export function fmtTime(format: string, d: Date): string {
  return format.replace(TOKEN_RE, (tok) => TIME_TOKENS[tok].format(d));
}

/**
 * Shape-matching placeholder for a timeFormat: each known specifier becomes
 * dashes of the same width (%Y -> ----, %m/%d/%H/%M/%S -> --, %a/%b -> ---),
 * literal text is kept. Used before the first message of a direction arrives.
 */
export function fmtPlaceholder(format: string): string {
  return format.replace(TOKEN_RE, (tok) => "-".repeat(TIME_TOKENS[tok].width));
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
