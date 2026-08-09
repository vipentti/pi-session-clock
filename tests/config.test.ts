import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, resolveConfig, type RawConfig, type DurationStyle } from "../src/config.js";

describe("resolveConfig", () => {
  it("returns defaults when nothing provided", () => {
    assert.deepEqual(resolveConfig(), DEFAULTS);
    assert.equal(DEFAULTS.showSent, true);
    assert.equal(DEFAULTS.showReceived, true);
  });

  it("project config fills in over defaults", () => {
    const project: RawConfig = { timeFormat: "%H:%M:%S" };
    const cfg = resolveConfig(project);
    assert.equal(cfg.timeFormat, "%H:%M:%S");
    assert.equal(cfg.durationStyle, DEFAULTS.durationStyle);
  });

  it("user config overrides project", () => {
    const project: RawConfig = { durationStyle: "full" };
    const user: RawConfig = { durationStyle: "compact" };
    const cfg = resolveConfig(project, user);
    assert.equal(cfg.durationStyle, "compact");
  });

  it("env vars override everything", () => {
    const project: RawConfig = { timeFormat: "%H:%M:%S" };
    const user: RawConfig = { timeFormat: "%a %H:%M" };
    const env = { PI_SESSION_CLOCK_TIME_FORMAT: "%Y-%m-%d" };
    const cfg = resolveConfig(project, user, env);
    assert.equal(cfg.timeFormat, "%Y-%m-%d");
  });

  it("empty strings in files are ignored", () => {
    const project: RawConfig = { timeFormat: "" };
    const cfg = resolveConfig(project);
    assert.equal(cfg.timeFormat, DEFAULTS.timeFormat);
  });

  it("wrong types in files are ignored", () => {
    const project: RawConfig = { timeFormat: 42 as unknown as string };
    const cfg = resolveConfig(project);
    assert.equal(cfg.timeFormat, DEFAULTS.timeFormat);
  });

  it("invalid durationStyle in files is ignored", () => {
    const project: RawConfig = { durationStyle: "bogus" };
    const cfg = resolveConfig(project);
    assert.equal(cfg.durationStyle, DEFAULTS.durationStyle);
  });

  it("invalid durationStyle in env is ignored", () => {
    const cfg = resolveConfig(undefined, undefined, {
      PI_SESSION_CLOCK_DURATION_STYLE: "bogus",
    });
    assert.equal(cfg.durationStyle, DEFAULTS.durationStyle);
  });

  it("valid durationStyle via env works", () => {
    const cfg = resolveConfig(undefined, undefined, {
      PI_SESSION_CLOCK_DURATION_STYLE: "full",
    });
    assert.equal(cfg.durationStyle, "full" satisfies DurationStyle);
  });

  it("message statuses resolve through project, user, and env layers", () => {
    const cfg = resolveConfig(
      { showSent: false, showReceived: true },
      { showSent: true },
      { PI_SESSION_CLOCK_SHOW_SENT: "false", PI_SESSION_CLOCK_SHOW_RECEIVED: "false" },
    );
    assert.equal(cfg.showSent, false);
    assert.equal(cfg.showReceived, false);
  });

  it("message statuses can be disabled individually", () => {
    const cfg = resolveConfig({ showSent: false });
    assert.equal(cfg.showSent, false);
    assert.equal(cfg.showReceived, true);
  });

  it("invalid message status values are ignored", () => {
    const cfg = resolveConfig(
      { showSent: "false", showReceived: 0 },
      undefined,
      { PI_SESSION_CLOCK_SHOW_SENT: "no", PI_SESSION_CLOCK_SHOW_RECEIVED: "1" },
    );
    assert.equal(cfg.showSent, DEFAULTS.showSent);
    assert.equal(cfg.showReceived, DEFAULTS.showReceived);
  });

  it("missing env vars don't override lower layers", () => {
    const project: RawConfig = { durationStyle: "compact" };
    const cfg = resolveConfig(project, undefined, {});
    assert.equal(cfg.durationStyle, "compact");
  });

  it("project + user + env together — env wins on conflict", () => {
    const project: RawConfig = { timeFormat: "p", durationStyle: "full" };
    const user: RawConfig = { timeFormat: "u" };
    const env = { PI_SESSION_CLOCK_TIME_FORMAT: "e" };
    const cfg = resolveConfig(project, user, env);
    assert.equal(cfg.timeFormat, "e");         // env
    assert.equal(cfg.durationStyle, "full");   // project (user didn't set, env didn't set)
  });

  it("all configs can be undefined", () => {
    assert.deepEqual(resolveConfig(undefined, undefined, undefined), DEFAULTS);
  });

  it("user config can be empty object", () => {
    assert.deepEqual(resolveConfig(undefined, {}), DEFAULTS);
  });

  // ── Lifecycle isolation ──────────────────────────────────────
  it("env + no project file → env wins", () => {
    const cfg = resolveConfig(
      {},
      {},
      { PI_SESSION_CLOCK_TIME_FORMAT: "%a" },
    );
    assert.equal(cfg.timeFormat, "%a");
    assert.equal(cfg.durationStyle, "auto");
  });

  it("trusted project A with overrides", () => {
    const projectA: RawConfig = { timeFormat: "%H:%M:%S", durationStyle: "compact" };
    const cfg = resolveConfig(projectA, {});
    assert.equal(cfg.timeFormat, "%H:%M:%S");
    assert.equal(cfg.durationStyle, "compact");
  });

  it("subsequent untrusted project B isolates from A", () => {
    // Simulate: project A had config, now switched to untrusted B (project={})
    const projectA: RawConfig = { timeFormat: "%H:%M:%S" };
    const cfgA = resolveConfig(projectA, {});
    assert.equal(cfgA.timeFormat, "%H:%M:%S");

    const projectB: RawConfig = {};
    const cfgB = resolveConfig(projectB, {});
    assert.equal(cfgB.timeFormat, DEFAULTS.timeFormat);
    assert.notEqual(cfgB.timeFormat, cfgA.timeFormat);
  });

  it("user > project and env > user through actual wiring", () => {
    const project: RawConfig = { timeFormat: "proj", durationStyle: "seconds" };
    const user: RawConfig = { timeFormat: "user", durationStyle: "compact" };
    const env = { PI_SESSION_CLOCK_TIME_FORMAT: "env" };
    const cfg = resolveConfig(project, user, env);
    assert.equal(cfg.timeFormat, "env");       // env > user > project
    assert.equal(cfg.durationStyle, "compact"); // user > project, no env
  });
});
