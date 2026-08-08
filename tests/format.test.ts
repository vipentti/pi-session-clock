import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtDuration, fmtTime } from "../src/format.js";

describe("fmtDuration", () => {
  // ── auto ─────────────────────────────────────────────────────
  describe("auto", () => {
    it("shows seconds under 60s", () => {
      assert.equal(fmtDuration(0, "auto"), "0s");
      assert.equal(fmtDuration(42_000, "auto"), "42s");
      assert.equal(fmtDuration(59_999, "auto"), "59s");
    });
    it("shows m:ss from 60s to <1h", () => {
      assert.equal(fmtDuration(60_000, "auto"), "1:00");
      assert.equal(fmtDuration(90_000, "auto"), "1:30");
      assert.equal(fmtDuration(3_599_000, "auto"), "59:59");
    });
    it("shows h:mm:ss from 1h", () => {
      assert.equal(fmtDuration(3_600_000, "auto"), "1:00:00");
      assert.equal(fmtDuration(3_660_000, "auto"), "1:01:00");
      assert.equal(fmtDuration(86_400_000, "auto"), "24:00:00");
    });
    it("pads minutes and seconds", () => {
      assert.equal(fmtDuration(61_000, "auto"), "1:01");
      assert.equal(fmtDuration(3_661_000, "auto"), "1:01:01");
    });
  });

  // ── seconds ──────────────────────────────────────────────────
  describe("seconds", () => {
    it("always shows total seconds", () => {
      assert.equal(fmtDuration(0, "seconds"), "0s");
      assert.equal(fmtDuration(42_000, "seconds"), "42s");
      assert.equal(fmtDuration(3_600_000, "seconds"), "3600s");
      assert.equal(fmtDuration(86_400_000, "seconds"), "86400s");
    });
  });

  // ── compact ──────────────────────────────────────────────────
  describe("compact", () => {
    it("shows m:ss under 1h (no leading hour)", () => {
      assert.equal(fmtDuration(0, "compact"), "0:00");
      assert.equal(fmtDuration(42_000, "compact"), "0:42");
      assert.equal(fmtDuration(3_599_000, "compact"), "59:59");
    });
    it("shows h:mm:ss from 1h", () => {
      assert.equal(fmtDuration(3_600_000, "compact"), "1:00:00");
      assert.equal(fmtDuration(86_400_000, "compact"), "24:00:00");
    });
  });

  // ── full ─────────────────────────────────────────────────────
  describe("full", () => {
    it("always shows h:mm:ss", () => {
      assert.equal(fmtDuration(0, "full"), "0:00:00");
      assert.equal(fmtDuration(42_000, "full"), "0:00:42");
      assert.equal(fmtDuration(3_600_000, "full"), "1:00:00");
      assert.equal(fmtDuration(3_661_000, "full"), "1:01:01");
    });
  });

  // ── edge ─────────────────────────────────────────────────────
  it("unknown style falls back to auto", () => {
    assert.equal(fmtDuration(42_000, "bogus"), "42s");
    assert.equal(fmtDuration(3_600_000, "bogus"), "1:00:00");
  });
});

describe("fmtTime", () => {
  // Use local-time constructor to avoid timezone flakiness.
  // 2025-04-07 Mon 14:05:09 (local time)
  const d = new Date(2025, 3, 7, 14, 5, 9);

  it("formats %H:%M", () => {
    assert.equal(fmtTime("%H:%M", d), "14:05");
  });
  it("formats %H:%M:%S", () => {
    assert.equal(fmtTime("%H:%M:%S", d), "14:05:09");
  });
  it("formats %Y-%m-%d", () => {
    assert.equal(fmtTime("%Y-%m-%d", d), "2025-04-07");
  });
  it("formats combined date+time", () => {
    assert.equal(fmtTime("%Y-%m-%d %H:%M:%S", d), "2025-04-07 14:05:09");
  });
  it("formats %a and %b", () => {
    assert.equal(fmtTime("%a %d %b %H:%M", d), "Mon 07 Apr 14:05");
  });
  it("pads single-digit values", () => {
    const early = new Date(2025, 0, 5, 3, 4, 5);
    assert.equal(fmtTime("%Y-%m-%d %H:%M:%S", early), "2025-01-05 03:04:05");
  });
  it("passes through unknown specifiers", () => {
    assert.equal(fmtTime("%x %Z", d), "%x %Z");
  });
  it("handles literal text", () => {
    assert.equal(fmtTime("at %H:%M", d), "at 14:05");
  });
});
