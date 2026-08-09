/**
 * Config loading, validation, and precedence resolution.
 * Pure merge logic is testable; file I/O is at the edges.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Types ───────────────────────────────────────────────────────────
export type DurationStyle = "auto" | "seconds" | "compact" | "full";

/** Shape of the JSON files / env vars (input, unvalidated). */
export interface RawConfig {
  timeFormat?: unknown;
  durationStyle?: unknown;
  showSent?: unknown;
  showReceived?: unknown;
}

/** Fully resolved, validated config — no optional fields, no unknowns. */
export interface ResolvedConfig {
  timeFormat: string;
  durationStyle: DurationStyle;
  showSent: boolean;
  showReceived: boolean;
}

export const DEFAULTS: ResolvedConfig = {
  timeFormat: "%H:%M",
  durationStyle: "auto",
  showSent: true,
  showReceived: true,
};

const VALID_DURATION_STYLES = new Set<string>(["auto", "seconds", "compact", "full"]);

// ── Validation ──────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * A timeFormat containing any C0 control char (\x00-\x1F) or DEL (\x7F) is
 * unsafe: terminal escape sequences originate in that range. Such values are
 * rejected like any other invalid config, never partially stripped or rewritten.
 */
function isSafeTimeFormat(v: string): boolean {
  return !/[\x00-\x1f\x7f]/.test(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function validate(raw: RawConfig): Partial<ResolvedConfig> {
  const out: Partial<ResolvedConfig> = {};
  if (isString(raw.timeFormat) && isSafeTimeFormat(raw.timeFormat) && raw.timeFormat.length > 0) {
    out.timeFormat = raw.timeFormat;
  }
  if (isString(raw.durationStyle) && VALID_DURATION_STYLES.has(raw.durationStyle)) {
    out.durationStyle = raw.durationStyle as DurationStyle;
  }
  if (isBoolean(raw.showSent)) out.showSent = raw.showSent;
  if (isBoolean(raw.showReceived)) out.showReceived = raw.showReceived;
  return out;
}

// ── Merge ───────────────────────────────────────────────────────────

/**
 * Merge config layers: project → user → env, each overriding the previous.
 * The `env` argument is a snapshot of process.env (injected for testability).
 * Returns a fully resolved config — every field is required.
 */
export function resolveConfig(
  project?: RawConfig,
  user?: RawConfig,
  env?: Record<string, string | undefined>,
): ResolvedConfig {
  const projectValid = project ? validate(project) : {};
  const userValid = user ? validate(user) : {};
  const merged: ResolvedConfig = { ...DEFAULTS, ...projectValid, ...userValid };

  if (env?.["PI_SESSION_CLOCK_TIME_FORMAT"] !== undefined) {
    const v = env["PI_SESSION_CLOCK_TIME_FORMAT"];
    if (v.length > 0 && isSafeTimeFormat(v)) {
      merged.timeFormat = v;
    }
  }
  if (env?.["PI_SESSION_CLOCK_DURATION_STYLE"] !== undefined) {
    const v = env["PI_SESSION_CLOCK_DURATION_STYLE"];
    if (VALID_DURATION_STYLES.has(v)) {
      merged.durationStyle = v as DurationStyle;
    }
  }
  if (env?.["PI_SESSION_CLOCK_SHOW_SENT"] === "true" || env?.["PI_SESSION_CLOCK_SHOW_SENT"] === "false") {
    merged.showSent = env["PI_SESSION_CLOCK_SHOW_SENT"] === "true";
  }
  if (env?.["PI_SESSION_CLOCK_SHOW_RECEIVED"] === "true" || env?.["PI_SESSION_CLOCK_SHOW_RECEIVED"] === "false") {
    merged.showReceived = env["PI_SESSION_CLOCK_SHOW_RECEIVED"] === "true";
  }
  return merged;
}

// ── File I/O ────────────────────────────────────────────────────────

/** Load and validate a JSON file, returning null on any failure. */
export function loadJSON(path: string): RawConfig | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  } catch {
    return null;
  }
}

export function userConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "pi-session-clock.json");
}

export function projectConfigPath(cwd: string, configDirName?: string): string {
  return join(cwd, configDirName ?? ".pi", "pi-session-clock.json");
}
