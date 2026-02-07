import { z } from "zod";
import type { ToolCall, ToolCtx, ToolResult } from "./types";
import { ToolCallZ } from "./types";
import { ToolRegistry, err } from "./registry";

export class ToolRunner {
  constructor(private readonly registry: ToolRegistry, private readonly emit: (ev: any) => void) {}

  async run(ctx: ToolCtx, callRaw: unknown): Promise<ToolResult> {
    const parsed = ToolCallZ.safeParse(callRaw);
    if (!parsed.success) return err("tool_bad_call", "Invalid tool call", parsed.error.flatten());

    const call: ToolCall = parsed.data;
    const def = this.registry.get(call.name);
    if (!def) return err("tool_unknown", `Unknown tool: ${call.name}`);

    if (def.required.tool) {
      if (!ctx.toolAllowlist.has(def.required.tool)) return err("tool_not_allowed", `Tool not allowed: ${def.required.tool}`);
    } else {
      if (!ctx.toolAllowlist.has(call.name)) return err("tool_not_allowed", `Tool not allowed: ${call.name}`);
    }

    const reqCaps = def.required.caps ?? [];
    for (const c of reqCaps) {
      if (!ctx.capabilities.has(c)) return err("capability_missing", `Missing capability: ${c}`, { capability: c });
    }

    const inputParsed = def.input.safeParse(call.input);
    if (!inputParsed.success) return err("tool_bad_input", `Invalid input for ${call.name}`, inputParsed.error.flatten());

    const stepKey = call.toolUseId ? `tool:${call.name}:${call.toolUseId}` : `tool:${call.name}:${Date.now()}`;
    this.emit({ type: "step", op: "start", stepKey, toolName: call.name, toolUseId: call.toolUseId, input: scrub(inputParsed.data) });

    try {
      const out = await def.handler(ctx, inputParsed.data);
      const outParsed = def.output.safeParse(out);
      if (!outParsed.success) return err("tool_bad_output", `Invalid output from ${call.name}`, outParsed.error.flatten());

      this.emit({ type: "step", op: "finish", stepKey, toolName: call.name, toolUseId: call.toolUseId, ok: true });
      return { ok: true, output: outParsed.data };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      this.emit({ type: "step", op: "finish", stepKey, toolName: call.name, toolUseId: call.toolUseId, ok: false, error: msg });
      return err("tool_failed", msg);
    }
  }
}

function scrub(v: any) {
  if (v && typeof v === "object") return v;
  return v;
}