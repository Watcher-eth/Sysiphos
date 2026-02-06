// runner/src/prose/sessionAdapter.ts
import type { PromptParts } from "./prompts";

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;

  sessionId?: string | null; // resume when known
  idempotencyKey?: string | null; // ✅ Step 5+ (provider-safe retries)
};

export type SessionTurnResult = {
  text: string;
  sessionId?: string;
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
};

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export interface SessionAdapter {
  createSession(args: SessionCreateArgs): Promise<SessionHandle>;
  resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle>;
}

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
  return makeMockAdapter();
}