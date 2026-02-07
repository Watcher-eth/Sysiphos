// runner/src/prose/sessionAdapter.ts
import { makeClaudeAdapter } from "./adapters/claudeV2";
import type { EventBufferOptions } from "../events/buffer";

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export interface SessionAdapter {
  createSession(args: SessionCreateArgs): Promise<SessionHandle>;
  resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle>;
}

export type TodoEvent = Extract<AgentEvent, { type: "todo" }>;
export type TodoOp = TodoEvent["op"];

export type AgentEventBase = { principalId?: string; agentName?: string };

export type AgentEvent =
  & AgentEventBase
  & (
    | { type: "session_started"; sessionId?: string }
    | { type: "session_resumed"; sessionId: string }
    | { type: "thinking"; text: string }
    | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string; data?: any }
    | { type: "step"; status: "started" | "completed" | "failed"; name: string; detail?: string; data?: any }
    | { type: "todo"; op: "add" | "update" | "complete"; id: string; text?: string; status?: string; data?: any }
    | { type: "artifact"; name: string; contentRef: string; mime?: string; size?: number; sha256?: string; action?: string; path?: string }
    | { type: "result_text"; text: string }
    | { type: "raw"; provider: "claude"; payload: any }
    | {
        type: "checkpoint";
        op: "create" | "restore" | "drop";
        checkpointId: string;
        label?: string;
        fileCount?: number;
        bytesTotal?: number;
        data?: any;
      }
    | {
        type: "file";
        op: "opened" | "read" | "created" | "edited" | "deleted" | "moved" | "copied" | "mkdir" | "rmdir";
        path: string;
        toPath?: string;
        bytesBefore?: number | null;
        bytesAfter?: number | null;
        shaBefore?: string | null;
        shaAfter?: string | null;
        contentRefBefore?: string | null;
        contentRefAfter?: string | null;
        mime?: string | null;
        data?: any;
      }
  );

// ✅ distributive omit over the union (this fixes your error)
export type AgentEventPayload =
  AgentEvent extends infer U
    ? U extends any
      ? Omit<U, "principalId" | "agentName">
      : never
    : never;

export type FileEvent = Extract<AgentEvent, { type: "file" }>;
export type FileOp = FileEvent["op"];
export type CheckpointEvent = Extract<AgentEvent, { type: "checkpoint" }>;
export type CheckpointOp = CheckpointEvent["op"];

export type SessionTurnResult = {
  sessionId?: string;
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
  event?: AgentEvent;
  // legacy support (optional)
  text?: string;
};

export type ToolHandler = (call: {
  name: string;
  input: unknown;
  toolUseId?: string;
}) => Promise<
  | { ok: true; output: any }
  | { ok: false; error: { code: string; message: string; data?: any } }
>;

export type ClaudeToolDef = {
  name: string;
  description?: string;
  input_schema?: any; // Anthropic tools input schema
};

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;

  sessionId?: string | null;
  idempotencyKey?: string | null;

  // ✅ routing/debugging + scoping
  principalId?: string;
  agentName?: string;

  // ✅ run/workspace context for file ops + events
  runId?: string;
  workspaceDir?: string;

  // ✅ Phase 2.4/2.5: control plane streaming
  programHash?: string;
  eventBufferOptions?: EventBufferOptions;

  // ✅ workspace safety controls for WorkspaceFiles
  workspaceAllowlist?: Array<{ path: string; mode: "ro" | "rw" }>;
  maxFileBytes?: number | null;
  maxWorkspaceBytes?: number | null;

  // ✅ Phase 1: tool calling
  toolHandler?: ToolHandler;

  // ✅ tools exposed to model (name/description/schema)
  tools?: ClaudeToolDef[];
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
  return makeClaudeAdapter();
}