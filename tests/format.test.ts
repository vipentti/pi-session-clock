import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtDuration, fmtPlaceholder, fmtTime } from "../src/format.js";
import type { DurationStyle } from "../src/config.js";

function d(ms: number, style: DurationStyle) {
  return fmtDuration(ms, style);
}

describe("fmtDuration", () => {
  // ── auto ─────────────────────────────────────────────────────
  describe("auto", () => {
    it("shows seconds under 60s", () => {
      assert.equal(d(0, "auto"), "0s");
      assert.equal(d(42_000, "auto"), "42s");
      assert.equal(d(59_999, "auto"), "59s");
    });
    it("shows m:ss from 60s to <1h", () => {
      assert.equal(d(60_000, "auto"), "1:00");
      assert.equal(d(90_000, "auto"), "1:30");
      assert.equal(d(3_599_000, "auto"), "59:59");
    });
    it("shows h:mm:ss from 1h", () => {
      assert.equal(d(3_600_000, "auto"), "1:00:00");
      assert.equal(d(3_660_000, "auto"), "1:01:00");
      assert.equal(d(86_400_000, "auto"), "24:00:00");
    });
    it("pads minutes and seconds", () => {
      assert.equal(d(61_000, "auto"), "1:01");
      assert.equal(d(3_661_000, "auto"), "1:01:01");
    });
  });

  // ── seconds ──────────────────────────────────────────────────
  describe("seconds", () => {
    it("always shows total seconds", () => {
      assert.equal(d(0, "seconds"), "0s");
      assert.equal(d(42_000, "seconds"), "42s");
      assert.equal(d(3_600_000, "seconds"), "3600s");
      assert.equal(d(86_400_000, "seconds"), "86400s");
    });
  });

  // ── compact ──────────────────────────────────────────────────
  describe("compact", () => {
    it("shows m:ss under 1h (no leading hour)", () => {
      assert.equal(d(0, "compact"), "0:00");
      assert.equal(d(42_000, "compact"), "0:42");
      assert.equal(d(3_599_000, "compact"), "59:59");
    });
    it("shows h:mm:ss from 1h", () => {
      assert.equal(d(3_600_000, "compact"), "1:00:00");
      assert.equal(d(86_400_000, "compact"), "24:00:00");
    });
  });

  // ── full ─────────────────────────────────────────────────────
  describe("full", () => {
    it("always shows h:mm:ss", () => {
      assert.equal(d(0, "full"), "0:00:00");
      assert.equal(d(42_000, "full"), "0:00:42");
      assert.equal(d(3_600_000, "full"), "1:00:00");
      assert.equal(d(3_661_000, "full"), "1:01:01");
    });
  });
});

describe("fmtTime", () => {
  // Use local-time constructor to avoid timezone flakiness.
  // 2025-04-07 Mon 14:05:09 (local time)
  const date = new Date(2025, 3, 7, 14, 5, 9);

  it("formats %H:%M", () => {
    assert.equal(fmtTime("%H:%M", date), "14:05");
  });
  it("formats %H:%M:%S", () => {
    assert.equal(fmtTime("%H:%M:%S", date), "14:05:09");
  });
  it("formats %Y-%m-%d", () => {
    assert.equal(fmtTime("%Y-%m-%d", date), "2025-04-07");
  });
  it("formats combined date+time", () => {
    assert.equal(fmtTime("%Y-%m-%d %H:%M:%S", date), "2025-04-07 14:05:09");
  });
  it("formats %a and %b", () => {
    assert.equal(fmtTime("%a %d %b %H:%M", date), "Mon 07 Apr 14:05");
  });
  it("pads single-digit values", () => {
    const early = new Date(2025, 0, 5, 3, 4, 5);
    assert.equal(fmtTime("%Y-%m-%d %H:%M:%S", early), "2025-01-05 03:04:05");
  });
  it("passes through unknown specifiers", () => {
    assert.equal(fmtTime("%x %Z", date), "%x %Z");
  });
  it("handles literal text", () => {
    assert.equal(fmtTime("at %H:%M", date), "at 14:05");
  });
});

describe("fmtPlaceholder", () => {
  it("replaces specifiers with same-width dashes, keeps literals", () => {
    assert.equal(fmtPlaceholder("%H:%M"), "--:--");
    assert.equal(fmtPlaceholder("%Y-%m-%d"), "----------");
    assert.equal(fmtPlaceholder("%a %d %b %H:%M:%S"), "--- -- --- --:--:--");
    assert.equal(fmtPlaceholder("at %H:%M"), "at --:--");
  });
  it("passes through unknown specifiers", () => {
    assert.equal(fmtPlaceholder("%x %Z"), "%x %Z");
  });
});
