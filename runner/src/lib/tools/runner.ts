// runner/src/prose/tools/runner.ts
import type { ToolCtx, ToolResult } from "./types";
import type { ToolRegistry } from "./registry";
import type { ClaudeToolDef } from "../prose/sessionAdapter"; // ✅ fix path

type Ok = Extract<ToolResult, { ok: true }>;
type Err = Extract<ToolResult, { ok: false }>;

function ok(output: any): Ok {
  return { ok: true, output };
}

function err(code: string, message: string, data?: any): Err {
  return { ok: false, error: { code, message, data } };
}

export class ToolRunner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly emit?: (ev: any) => void
  ) {}

  // These are ONLY our custom tools. Claude built-ins remain default.
  getClaudeToolDefs(ctx: ToolCtx): ClaudeToolDef[] {
    const out: ClaudeToolDef[] = [];
    const allow = ctx.toolAllowlist;
    const caps = ctx.capabilities;

    for (const name of this.registry.listNames()) {
      const def = this.registry.get(name);
      if (!def) continue;

      if (allow && allow.size > 0 && !allow.has(name)) continue;

      const reqCaps: string[] = Array.isArray(def.required?.caps) ? def.required.caps : [];
      if (reqCaps.length) {
        for (const c of reqCaps) {
          if (!caps.has(c)) {
            // missing cap -> tool not exposed
            continue;
          }
        }
      }

      out.push({
        name,
        description: def.description ?? "",
        input_schema: { type: "object", additionalProperties: true },
      });
    }

    return out;
  }

  async run(
    ctx: ToolCtx,
    call: { name: string; input: unknown; toolUseId?: string }
  ): Promise<ToolResult> {
    const name = String(call.name || "");
    const def = this.registry.get(name);
    if (!def) return err("tool_not_found", `tool_not_found:${name}`);

    if (ctx.toolAllowlist && ctx.toolAllowlist.size > 0 && !ctx.toolAllowlist.has(name)) {
      return err("tool_forbidden", `tool_forbidden:${name}`);
    }

    const reqCaps: string[] = Array.isArray(def.required?.caps) ? def.required.caps : [];
    for (const c of reqCaps) {
      if (!ctx.capabilities.has(c)) return err("capability_missing", `capability_missing:${c}`, { tool: name });
    }

    const parsed = def.input.safeParse(call.input);
    if (!parsed.success) {
      return err("tool_bad_input", "tool_bad_input", { issues: parsed.error.issues });
    }

    const detail = call.toolUseId ? `tool_use_id=${call.toolUseId}` : "";
    this.emit?.({ type: "step", op: "start", name, detail });

    try {
      const out = await def.handler(ctx, parsed.data);

      const outParsed = def.output.safeParse(out);
      if (!outParsed.success) {
        const e = err("tool_bad_output", "tool_bad_output", { issues: outParsed.error.issues });
        this.emit?.({ type: "step", op: "finish", ok: false, name, detail, error: e.error });
        return e;
      }

      this.emit?.({ type: "step", op: "finish", ok: true, name, detail });
      return ok(outParsed.data);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "tool_failed");
      const r = err("tool_failed", msg);
      this.emit?.({ type: "step", op: "finish", ok: false, name, detail, error: r.error });
      return r;
    }
  }
}