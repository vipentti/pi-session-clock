import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { fmtTime } from "../src/format.js";
import { fmtDuration } from "../src/format.js";

type Handler = (event: any, ctx: ExtensionContext) => void;

function setup() {
  const handlers = new Map<string, Handler>();
  const statuses = new Map<string, string | undefined>();
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(),
    isProjectTrusted: () => false,
    ui: {
      setStatus: (key: string, text: string | undefined) => statuses.set(key, text),
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;

  extension(pi);
  handlers.get("session_start")!({}, ctx);
  return { handlers, statuses, ctx };
}

function withNow<T>(now: Date, fn: () => T): T {
  const RealDate = globalThis.Date;
  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? now.getTime() : value);
    }

    static now() {
      return now.getTime();
    }
  }
  globalThis.Date = MockDate as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

describe("message footer status handlers", () => {
  it("tracks sent time and receive completion time", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      const sent = new Date(2025, 3, 7, 14, 2, 9);
      const streamStarted = new Date(2025, 3, 7, 14, 4, 9);
      const completion = new Date(2025, 3, 7, 14, 5, 9);

      handlers.get("message_start")!({ message: { role: "user", timestamp: sent.getTime() } }, ctx);
      assert.equal(statuses.get("session-clock-messages"), `↑${fmtTime("%H:%M", sent)}  ↓--:--`);

      withNow(completion, () => {
        handlers.get("message_end")!({ message: { role: "assistant", timestamp: streamStarted.getTime() } }, ctx);
      });
      assert.equal(
        statuses.get("session-clock-messages"),
        `↑${fmtTime("%H:%M", sent)}  ↓${fmtTime("%H:%M", completion)}`,
      );
      // receive time is completion time (new Date()), not the stream-start event timestamp
      assert.notEqual(fmtTime("%H:%M", completion), fmtTime("%H:%M", streamStarted));
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("renders placeholders from session start, sent before received", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      assert.equal(statuses.get("session-clock-messages"), "↑--:--  ↓--:--");
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("keeps sent before received after messages arrive", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      const sent = new Date(2025, 3, 7, 14, 2, 9);
      const completion = new Date(2025, 3, 7, 14, 5, 9);

      handlers.get("message_start")!({ message: { role: "user", timestamp: sent.getTime() } }, ctx);
      withNow(completion, () => {
        handlers.get("message_end")!({ message: { role: "assistant", timestamp: completion.getTime() } }, ctx);
      });
      const status = statuses.get("session-clock-messages");
      assert.ok(status !== undefined);
      assert.ok(status.indexOf("↑") < status.indexOf("↓"), "↑ must come before ↓ in the merged status");
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("omits disabled directions and clears the status when both are disabled", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      process.env.PI_SESSION_CLOCK_SHOW_SENT = "false";
      process.env.PI_SESSION_CLOCK_SHOW_RECEIVED = "false";
      handlers.get("session_start")!({}, ctx);
      assert.equal(statuses.get("session-clock-messages"), undefined);

      process.env.PI_SESSION_CLOCK_SHOW_SENT = "false";
      process.env.PI_SESSION_CLOCK_SHOW_RECEIVED = "true";
      handlers.get("session_start")!({}, ctx);
      assert.equal(statuses.get("session-clock-messages"), "↓--:--");

      process.env.PI_SESSION_CLOCK_SHOW_SENT = "true";
      process.env.PI_SESSION_CLOCK_SHOW_RECEIVED = "false";
      handlers.get("session_start")!({}, ctx);
      assert.equal(statuses.get("session-clock-messages"), "↑--:--");
    } finally {
      delete process.env.PI_SESSION_CLOCK_SHOW_SENT;
      delete process.env.PI_SESSION_CLOCK_SHOW_RECEIVED;
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("resets message timestamps at session start", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      handlers.get("message_start")!({ message: { role: "user", timestamp: Date.now() } }, ctx);
      handlers.get("message_end")!({ message: { role: "assistant", timestamp: Date.now() } }, ctx);
      handlers.get("session_start")!({}, ctx);
      assert.equal(statuses.get("session-clock-messages"), "↑--:--  ↓--:--");
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });
});

// ── Prompt timer + tool counter ──────────────────────────────────────────
// Helpers for deterministic clock + interval control.
function withFakeTimers<T>(fn: (intervals: Map<number, { cb: () => void; ms: number }>) => T): T {
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;
  const intervals = new Map<number, { cb: () => void; ms: number }>();
  let nextId = 1;
  // Capture setInterval calls made by the extension. Return id as unknown to satisfy ReturnType.
  (globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((cb: () => void, ms?: number) => {
    const id = nextId++;
    intervals.set(id, { cb, ms: ms ?? 0 });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  (globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = ((id: unknown) => {
    intervals.delete(id as number);
  }) as unknown as typeof clearInterval;
  try {
    return fn(intervals);
  } finally {
    (globalThis as unknown as { setInterval: typeof setInterval }).setInterval = origSetInterval;
    (globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = origClearInterval;
  }
}

function setupWithFakeTimers() {
  const handlers = new Map<string, Handler>();
  const statuses = new Map<string, string | undefined>();
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(),
    isProjectTrusted: () => false,
    ui: {
      setStatus: (key: string, text: string | undefined) => statuses.set(key, text),
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;
  extension(pi);
  return { handlers, statuses, ctx };
}

describe("prompt timer and tool counter", () => {
  it("has no prompt status after session_start until first prompt", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      assert.equal(statuses.get("session-clock-prompt"), undefined);
      // tool_call with no active prompt is ignored
      handlers.get("tool_call")!({ toolName: "read", toolCallId: "1", input: {} }, ctx);
      assert.equal(statuses.get("session-clock-prompt"), undefined);
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("arms on before_agent_start with 0s and 0 tools", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          // session_start was not yet with fake timers - do it inside mock
          handlers.get("session_start")!({}, ctx);
          assert.equal(statuses.get("session-clock-prompt"), undefined);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
        });
        // Immediate paint: 0s is fmtDuration(0, auto) === "0s"
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(0, "auto")}  🔧0`);
        // Two intervals: session tick + prompt tick
        assert.equal(intervals.size, 2);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("tick advances the prompt delta once per second", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
        });
        // Find prompt interval (the one added after before_agent_start).
        // Trigger a tick 1s later.
        const t1 = new Date(t0.getTime() + 1000);
        withNow(t1, () => {
          // invoke each captured interval's cb to simulate tick; session tick does not affect prompt key
          for (const { cb } of intervals.values()) cb();
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(1000, "auto")}  🔧0`);

        const t3 = new Date(t0.getTime() + 3500);
        withNow(t3, () => {
          for (const { cb } of intervals.values()) cb();
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(3500, "auto")}  🔧0`);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("tool_call increments the counter and repaints immediately", () => {
    withFakeTimers(() => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(0, "auto")}  🔧0`);

        const tMid = new Date(t0.getTime() + 2000);
        withNow(tMid, () => {
          handlers.get("tool_call")!({ toolName: "read", toolCallId: "a", input: { path: "x" } }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(2000, "auto")}  🔧1`);

        withNow(tMid, () => {
          handlers.get("tool_call")!({ toolName: "bash", toolCallId: "b", input: { command: "echo hi" } }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(2000, "auto")}  🔧2`);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("tool_call counter accumulates across turns", () => {
    withFakeTimers(() => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
          handlers.get("tool_call")!({ toolName: "read", toolCallId: "1", input: {} }, ctx);
          handlers.get("tool_call")!({ toolName: "bash", toolCallId: "2", input: {} }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(0, "auto")}  🔧2`);

        // Another turn in same prompt (no new before_agent_start)
        const t1 = new Date(t0.getTime() + 5000);
        withNow(t1, () => {
          handlers.get("tool_call")!({ toolName: "edit", toolCallId: "3", input: {} }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(5000, "auto")}  🔧3`);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("agent_settled freezes the delta and clears the prompt interval; idle does not advance", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
          handlers.get("tool_call")!({ toolName: "read", toolCallId: "1", input: {} }, ctx);
        });
        const tSettle = new Date(t0.getTime() + 4200);
        withNow(tSettle, () => {
          handlers.get("agent_settled")!({}, ctx);
        });
        const frozen = `⏱ ${fmtDuration(4200, "auto")}  🔧1`;
        assert.equal(statuses.get("session-clock-prompt"), frozen);
        // prompt interval cleared, only session tick remains
        assert.equal(intervals.size, 1);

        // Advance 5s more while idle; frozen value must not change even if we trigger remaining interval
        const tIdle = new Date(tSettle.getTime() + 5000);
        withNow(tIdle, () => {
          for (const { cb } of intervals.values()) cb();
        });
        assert.equal(statuses.get("session-clock-prompt"), frozen);

        // tool_call after settle is ignored (attempted calls after done)
        withNow(tIdle, () => {
          handlers.get("tool_call")!({ toolName: "bash", toolCallId: "2", input: {} }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), frozen);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("next prompt resets the timer and counter", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "first" }, ctx);
          handlers.get("tool_call")!({ toolName: "read", toolCallId: "1", input: {} }, ctx);
        });
        const tSettle = new Date(t0.getTime() + 3000);
        withNow(tSettle, () => handlers.get("agent_settled")!({}, ctx));
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(3000, "auto")}  🔧1`);

        const t1 = new Date(t0.getTime() + 8000);
        withNow(t1, () => {
          handlers.get("before_agent_start")!({ prompt: "second" }, ctx);
        });
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(0, "auto")}  🔧0`);
        // prompt interval re-armed
        assert.equal(intervals.size, 2);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("session_start resets prompt state and clears the frozen value", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
          handlers.get("tool_call")!({ toolName: "read", toolCallId: "1", input: {} }, ctx);
          handlers.get("agent_settled")!({}, ctx);
        });
        assert.notEqual(statuses.get("session-clock-prompt"), undefined);
        // New session boundary
        const t1 = new Date(t0.getTime() + 10000);
        withNow(t1, () => handlers.get("session_start")!({}, ctx));
        assert.equal(statuses.get("session-clock-prompt"), undefined);
        // only session tick remains
        assert.equal(intervals.size, 1);
        // tool_call after session reset with no active prompt is ignored
        handlers.get("tool_call")!({ toolName: "bash", toolCallId: "2", input: {} }, ctx);
        assert.equal(statuses.get("session-clock-prompt"), undefined);
      } finally {
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("session_shutdown clears prompt interval", () => {
    withFakeTimers((intervals) => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
        });
        assert.equal(intervals.size, 2);
        handlers.get("session_shutdown")!({}, ctx);
        assert.equal(intervals.size, 0);
        // statuses map not auto-cleared on shutdown - provider disposes, but timer gone
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(0, "auto")}  🔧0`);
      } finally {
        // already shut down - ensure no leak
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });

  it("prompt duration respects configured durationStyle", () => {
    withFakeTimers(() => {
      const { handlers, statuses, ctx } = setupWithFakeTimers();
      try {
        process.env.PI_SESSION_CLOCK_DURATION_STYLE = "seconds";
        const t0 = new Date(2025, 3, 7, 14, 0, 0);
        withNow(t0, () => {
          handlers.get("session_start")!({}, ctx);
          handlers.get("before_agent_start")!({ prompt: "hello" }, ctx);
        });
        const t1 = new Date(t0.getTime() + 65_000);
        withNow(t1, () => handlers.get("agent_settled")!({}, ctx));
        // seconds style always shows total seconds
        assert.equal(statuses.get("session-clock-prompt"), `⏱ ${fmtDuration(65_000, "seconds")}  🔧0`);
      } finally {
        delete process.env.PI_SESSION_CLOCK_DURATION_STYLE;
        handlers.get("session_shutdown")!({}, ctx);
      }
    });
  });
});
