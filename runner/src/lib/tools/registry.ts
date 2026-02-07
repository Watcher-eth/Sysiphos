import { z } from "zod";
import type { ToolCtx, ToolResult } from "./types";

export type ToolDef<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = {
  name: string;
  input: I;
  output: O;
  required: { tool?: string; caps?: string[] };
  handler: (ctx: ToolCtx, input: z.infer<I>) => Promise<z.infer<O>>;
};

export class ToolRegistry {
  private readonly byName = new Map<string, ToolDef<any, any>>();

  register<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(def: ToolDef<I, O>) {
    if (this.byName.has(def.name)) throw new Error(`tool_duplicate:${def.name}`);
    this.byName.set(def.name, def);
  }

  get(name: string) {
    return this.byName.get(name);
  }

  listNames() {
    return [...this.byName.keys()].sort();
  }
}

export function err(code: string, message: string, data?: any): ToolResult {
  return { ok: false, error: { code, message, data } };
}