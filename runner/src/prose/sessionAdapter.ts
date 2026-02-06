// runner/src/prose/sessionAdapter.ts

import { makeClaudeAdapter } from "./adapters/claudeV2";

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export interface SessionAdapter {
  createSession(args: SessionCreateArgs): Promise<SessionHandle>;
  resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle>;
}
// runner/src/prose/sessionAdapter.ts
export type AgentEvent =
  | { type: "session_started"; sessionId?: string; agentName?: string; principalId?: string }
  | { type: "session_resumed"; sessionId: string; agentName?: string; principalId?: string }
  | { type: "thinking"; text: string } // optional; can be redacted/disabled
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string; data?: any }
  | { type: "step"; status: "started" | "completed" | "failed"; name: string; detail?: string }
  | { type: "todo"; op: "add" | "update" | "complete"; id: string; text?: string; status?: string }
  | { type: "artifact"; name: string; contentRef: string; mime?: string; size?: number; sha256?: string }
  | { type: "result_text"; text: string } // final extracted <result> payload (or equivalent)
  | { type: "raw"; provider: "claude"; payload: any };

export type SessionTurnResult = {
  sessionId?: string;
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
  event?: AgentEvent;
  // legacy support (optional)
  text?: string;
};

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;

  sessionId?: string | null;
  idempotencyKey?: string | null;

  // ✅ new: help routing/debugging + scoping
  principalId?: string;
  agentName?: string;
};

export function makeMockAdapter(): SessionAdapter {
  return {
    async createSession(_args) {
      let lastUser = "";
      const sid = `mock_${crypto.randomUUID()}`;
      return {
        async send(userText) {
          lastUser = userText;
        },
        async *stream() {
          yield {
            sessionId: sid,
            text:
              `Mock assistant response\n\n` +
              `<result>\n` +
              `I received:\n${lastUser}\n` +
              `</result>\n`,
            usage: { costCredits: 1 },
          };
        },
        close() {},
      };
    },

    async resumeSession(args) {
      const h = await this.createSession(args);
      const sid = args.sessionId;
      return {
        ...h,
        async *stream() {
          for await (const t of h.stream()) {
            yield { ...t, sessionId: sid };
          }
        },
      };
    },
  };
}

export async function makeAdapterFromEnv(): Promise<SessionAdapter> {
    const provider = (process.env.AGENT_PROVIDER ?? "claude").toLowerCase();
  
    if (provider === "claude") return makeClaudeAdapter();
  
    // fallback for dev
    return makeClaudeAdapter();
  }