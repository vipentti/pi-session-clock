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

describe("message footer status handlers", () => {
  it("tracks sent and received timestamps without streaming redraw corruption", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      const sent = new Date(2025, 3, 7, 14, 2, 9);
      const received = new Date(2025, 3, 7, 14, 5, 9);

      handlers.get("message_start")!({ message: { role: "user", timestamp: sent.getTime() } }, ctx);
      assert.equal(statuses.get("session-clock-sent"), `↑${fmtTime("%H:%M", sent)}`);
      assert.equal(statuses.get("session-clock-received"), undefined);

      handlers.get("message_end")!({ message: { role: "assistant", timestamp: received.getTime() } }, ctx);
      assert.equal(statuses.get("session-clock-sent"), `↑${fmtTime("%H:%M", sent)}`);
      assert.equal(statuses.get("session-clock-received"), `↓${fmtTime("%H:%M", received)}`);
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });

  it("resets message timestamps at session start", () => {
    const { handlers, statuses, ctx } = setup();
    try {
      handlers.get("message_start")!({ message: { role: "user", timestamp: Date.now() } }, ctx);
      handlers.get("message_end")!({ message: { role: "assistant", timestamp: Date.now() } }, ctx);
      handlers.get("session_start")!({}, ctx);
      assert.equal(statuses.get("session-clock-sent"), undefined);
      assert.equal(statuses.get("session-clock-received"), undefined);
    } finally {
      handlers.get("session_shutdown")!({}, ctx);
    }
  });
});
