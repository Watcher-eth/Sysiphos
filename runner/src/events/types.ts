import type { AgentEvent } from "../prose/sessionAdapter";

export type AgentEventEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName: string;

  // correlation
  sessionId?: string;

  // ordering
  seq: number;
  ts: string;

  event: AgentEvent;

  // optional usage increments
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
};