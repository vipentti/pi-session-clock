/**
 * Config loading and precedence resolution.
 * Pure merge logic is testable; file I/O is at the edges.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  timeFormat?: string;
  durationStyle?: string;
  messageTimestamps?: boolean;
}

export const DEFAULTS: Config = {
  timeFormat: "%H:%M",
  durationStyle: "auto",
  messageTimestamps: false,
};

/**
 * Merge config layers: project → user → env, each overriding the previous.
 * The `env` argument is a snapshot of process.env (injected for testability).
 */
export function resolveConfig(
  project?: Config,
  user?: Config,
  env?: Record<string, string | undefined>,
): Config {
  const merged: Config = { ...DEFAULTS, ...project, ...user };
  if (env?.["PI_SESSION_CLOCK_TIME_FORMAT"] !== undefined) {
    merged.timeFormat = env["PI_SESSION_CLOCK_TIME_FORMAT"];
  }
  if (env?.["PI_SESSION_CLOCK_DURATION_STYLE"] !== undefined) {
    merged.durationStyle = env["PI_SESSION_CLOCK_DURATION_STYLE"];
  }
  if (env?.["PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS"] !== undefined) {
    merged.messageTimestamps = env["PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS"] === "true";
  }
  return merged;
}

/** Load a JSON file, returning null on any failure. */
export function loadJSON(path: string): Config | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Config;
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
