import type { PromptParts } from "./prompts";

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;
};

export type SessionTurnResult = {
  text: string;
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
      return {
        async send(userText) {
          lastUser = userText;
        },
        async *stream() {
          yield {
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
      // same mock behavior, memoryText is available in args.memoryText
      return this.createSession(args);
    },
  };
}