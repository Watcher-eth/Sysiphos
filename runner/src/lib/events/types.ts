import type { AgentEvent } from "../prose/sessionAdapter";

export type AgentEventEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName: string;
  sessionId?: string;

  // ✅ producer seq
  sourceSeq: number;

  ts: string;
  event: any;
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
};