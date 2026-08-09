import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { fmtTime } from "../src/format.js";

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
