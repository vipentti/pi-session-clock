import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, resolveConfig, type Config } from "../src/config.js";

describe("resolveConfig", () => {
  it("returns defaults when nothing provided", () => {
    const cfg = resolveConfig();
    assert.deepEqual(cfg, DEFAULTS);
  });

  it("project config fills in over defaults", () => {
    const project: Config = { timeFormat: "%H:%M:%S" };
    const cfg = resolveConfig(project);
    assert.equal(cfg.timeFormat, "%H:%M:%S");
    assert.equal(cfg.durationStyle, DEFAULTS.durationStyle);
    assert.equal(cfg.messageTimestamps, DEFAULTS.messageTimestamps);
  });

  it("user config overrides project", () => {
    const project: Config = { durationStyle: "full" };
    const user: Config = { durationStyle: "compact" };
    const cfg = resolveConfig(project, user);
    assert.equal(cfg.durationStyle, "compact");
  });

  it("env vars override everything", () => {
    const project: Config = { timeFormat: "%H:%M:%S" };
    const user: Config = { timeFormat: "%a %H:%M" };
    const env = { PI_SESSION_CLOCK_TIME_FORMAT: "%Y-%m-%d" };
    const cfg = resolveConfig(project, user, env);
    assert.equal(cfg.timeFormat, "%Y-%m-%d");
  });

  it("env var messageTimestamps=true sets boolean", () => {
    const cfg = resolveConfig(undefined, undefined, {
      PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS: "true",
    });
    assert.equal(cfg.messageTimestamps, true);
  });

  it("env var messageTimestamps=false sets boolean", () => {
    const cfg = resolveConfig(undefined, undefined, {
      PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS: "false",
    });
    assert.equal(cfg.messageTimestamps, false);
  });

  it("env var messageTimestamps with garbage string is false", () => {
    const cfg = resolveConfig(undefined, undefined, {
      PI_SESSION_CLOCK_MESSAGE_TIMESTAMPS: "yes",
    });
    assert.equal(cfg.messageTimestamps, false);
  });

  it("missing env vars don't override lower layers", () => {
    const project: Config = { messageTimestamps: true };
    const cfg = resolveConfig(project, undefined, {});
    assert.equal(cfg.messageTimestamps, true);
  });

  it("project + user + env together — env wins on conflict", () => {
    const project: Config = { timeFormat: "p", durationStyle: "p", messageTimestamps: false };
    const user: Config = { timeFormat: "u", durationStyle: "u" };
    const env = { PI_SESSION_CLOCK_TIME_FORMAT: "e" };
    const cfg = resolveConfig(project, user, env);
    assert.equal(cfg.timeFormat, "e");       // env
    assert.equal(cfg.durationStyle, "u");    // user (no env)
    assert.equal(cfg.messageTimestamps, false); // project (no user, no env)
  });

  it("all configs can be undefined", () => {
    const cfg = resolveConfig(undefined, undefined, undefined);
    assert.deepEqual(cfg, DEFAULTS);
  });

  it("user config can be empty object", () => {
    const cfg = resolveConfig(undefined, {});
    assert.deepEqual(cfg, DEFAULTS);
  });
});
