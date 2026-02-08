// runner/src/lib/prose/tools/userTools.ts
import { z } from "zod";

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

   const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_\-]{0,63}$/;

   // allow:
   // - mcp__server__tool
   // - mcp__server__*
   // - mcp__*__*   (global wildcard)
   const MCP_TOOL_RE = /^mcp__(\*|[a-zA-Z0-9_\-]{1,64})__(\*|[a-zA-Z0-9_\-]{1,128})$/;
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Optional env interpolation: "${FOO}" -> process.env.FOO (or empty string)
// Keep this conservative; you can also choose to reject unresolved vars instead.
function expandEnvTemplate(input: string, env: Record<string, string | undefined>): string {
  return input.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => env[key] ?? "");
}

function normalizeUrl(url: string): string {
  // basic URL validation; the SDK will also validate later.
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return url;
  } catch {
    throw new Error(`invalid_url: ${url}`);
  }
}

/* ──────────────────────────────────────────────────────────────
   JSON Schema (local tool input_schema) validator
   - Strict enough to avoid garbage
   - Not a full JSON Schema implementation (by design)
   ────────────────────────────────────────────────────────────── */

const JSONSchemaTypeEnum = z.enum([
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "null",
]);

const JsonSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      type: z.union([JSONSchemaTypeEnum, z.array(JSONSchemaTypeEnum)]).optional(),
      title: z.string().optional(),
      description: z.string().optional(),

      // object
      properties: z.record(z.string(), JsonSchema).optional(),
      required: z.array(z.string()).optional(),
      additionalProperties: z.union([z.boolean(), JsonSchema]).optional(),

      // array
      items: z.union([JsonSchema, z.array(JsonSchema)]).optional(),
      minItems: z.number().int().nonnegative().optional(),
      maxItems: z.number().int().nonnegative().optional(),

      // scalars
      enum: z.array(z.any()).optional(),
      const: z.any().optional(),
      default: z.any().optional(),

      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),

      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      pattern: z.string().optional(),
      format: z.string().optional(),

      // composition (light support)
      oneOf: z.array(JsonSchema).optional(),
      anyOf: z.array(JsonSchema).optional(),
      allOf: z.array(JsonSchema).optional(),
      not: JsonSchema.optional(),
    })
    .passthrough() // allow harmless extra keys (keeps compatibility with JSON Schema drafts)
);

/** Enforce local tool input schema is an OBJECT schema */
function assertObjectInputSchema(schema: any) {
  const parsed = JsonSchema.safeParse(schema);
  if (!parsed.success) {
    throw new Error(`invalid_input_schema: ${parsed.error.issues[0]?.message ?? "bad schema"}`);
  }

  const t = parsed.data?.type;
  const isObject =
    t === "object" ||
    (Array.isArray(t) && t.includes("object")) ||
    (t == null && parsed.data?.properties != null);

  if (!isObject) {
    throw new Error(`invalid_input_schema: local tool input_schema must be type:"object"`);
  }
}

/* ──────────────────────────────────────────────────────────────
   User-facing JSON shape (supports MCP + local tools)
   ────────────────────────────────────────────────────────────── */

const LocalToolDef = z.object({
  name: z.string().regex(NAME_RE, "invalid local tool name"),
  description: z.string().max(2_000).optional(),
  input_schema: z.any().optional(), // validated separately
});

const McpStdioServer = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const McpHttpServer = z.object({
  type: z.enum(["http", "sse"]),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
});

const McpServerDef = z.union([McpStdioServer, McpHttpServer]);

const UserToolsConfigSchema = z.object({
  // local tools that YOUR runner implements via toolHandler
  tools: z.array(LocalToolDef).optional(),

  // MCP servers (stdio/http/sse)
  mcpServers: z.record(z.string(), McpServerDef).optional(),

  // tool allow list: can include local tool names + MCP names "mcp__server__tool" (+ wildcard)
  allowedTools: z.array(z.string().min(1)).optional(),

  // enable MCP tool search (maps to env.ENABLE_TOOL_SEARCH)
  toolSearch: z.string().optional(), // e.g. "auto", "auto:5", "true", "false"

  // optional: extra env your SDK should see (non-secret)
  env: z.record(z.string(), z.string()).optional(),
});

export type UserToolsConfig = z.infer<typeof UserToolsConfigSchema>;

/* ──────────────────────────────────────────────────────────────
   Normalized output types (fits your SessionCreateArgs)
   ────────────────────────────────────────────────────────────── */

export type NormalizedTooling = {
  localTools: Array<{
    name: string;
    description?: string;
    input_schema: any; // JSON Schema
  }>;

  mcpServers?: Record<string, any>;
  allowedTools?: string[];

  env?: Record<string, string>;
};

/* ──────────────────────────────────────────────────────────────
   Main entry: validate + normalize
   - Enforces naming rules
   - Enforces schema rules
   - Expands ${ENV_VAR} in mcp server fields if you want
   ────────────────────────────────────────────────────────────── */

export function validateAndNormalizeUserToolsConfig(params: {
  raw: unknown;
  // use process.env in your runner, or pass manifest.env merged with process.env
  templateEnv?: Record<string, string | undefined>;
  // avoid collisions with SDK native tool names, your own reserved tools, etc.
  reservedToolNames?: string[];
}): NormalizedTooling {
  const { raw, templateEnv = process.env, reservedToolNames = [] } = params;

  const parsed = UserToolsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`invalid_tools_config: ${issue.path.join(".")}: ${issue.message}`);
  }

  const cfg = parsed.data;

  // Normalize local tools
  const reserved = new Set(reservedToolNames);
  const localTools = (cfg.tools ?? []).map((t) => {
    if (t.name.startsWith("mcp__")) {
      throw new Error(`invalid_local_tool_name: ${t.name} (reserved prefix "mcp__")`);
    }
    if (reserved.has(t.name)) {
      throw new Error(`tool_name_collision: ${t.name}`);
    }

    const inputSchema = t.input_schema ?? {
      type: "object",
      properties: {},
      additionalProperties: false,
    };

    assertObjectInputSchema(inputSchema);

    return {
      name: t.name,
      description: t.description ?? "",
      input_schema: inputSchema,
    };
  });

  // Normalize MCP servers
  let mcpServers: Record<string, any> | undefined;
  if (cfg.mcpServers && Object.keys(cfg.mcpServers).length) {
    mcpServers = {};
    for (const [serverName, def] of Object.entries(cfg.mcpServers)) {
      if (!NAME_RE.test(serverName)) {
        throw new Error(`invalid_mcp_server_name: ${serverName}`);
      }

      // stdio
      if ("command" in def) {
        const command = expandEnvTemplate(def.command, templateEnv);
        const args = (def.args ?? []).map((a) => expandEnvTemplate(a, templateEnv));
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(def.env ?? {})) {
          env[k] = expandEnvTemplate(v, templateEnv);
        }

        mcpServers[serverName] = { command, args, env };
        continue;
      }

      // http/sse
      if ("type" in def) {
        const url = normalizeUrl(expandEnvTemplate(def.url, templateEnv));
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(def.headers ?? {})) {
          headers[k] = expandEnvTemplate(v, templateEnv);
        }

        mcpServers[serverName] = { type: def.type, url, headers };
        continue;
      }

      throw new Error(`invalid_mcp_server_def: ${serverName}`);
    }
  }

  // Normalize allowedTools: permit local names + mcp__server__tool (+ wildcard)
  const allowedTools = (cfg.allowedTools ?? []).length ? [...(cfg.allowedTools ?? [])] : undefined;
  if (allowedTools) {
    for (const entry of allowedTools) {
        if (entry.startsWith("mcp__")) {
            const m = entry.match(MCP_TOOL_RE);
            if (!m) throw new Error(`invalid_allowed_mcp_tool: ${entry}`);
            const server = m[1];
          
            // If server is "*", allow even without explicit mcpServers configured.
            if (server !== "*" && mcpServers && !(server in mcpServers)) {
              throw new Error(`unknown_mcp_server_in_allowedTools: ${server} for ${entry}`);
            }
          } else {
        // local tool entry
        if (!NAME_RE.test(entry)) throw new Error(`invalid_allowed_local_tool: ${entry}`);
        // allow listing tools that exist either in localTools or native ones
        // (your runner will still enforce actual availability)
      }
    }
  }

  // SDK env: include tool search flag + optional extra env
  const env: Record<string, string> = { ...(cfg.env ?? {}) };
  if (cfg.toolSearch) env.ENABLE_TOOL_SEARCH = cfg.toolSearch;

  return {
    localTools,
    mcpServers,
    allowedTools,
    env: Object.keys(env).length ? env : undefined,
  };
}

/* ──────────────────────────────────────────────────────────────
   Adapter-facing normalization (fits your existing ToolDefForModel union)
   ────────────────────────────────────────────────────────────── */

// This matches your runner/src/lib/prose/sessionAdapter.ts ToolDefForModel "custom tools" shape
export function normalizeLocalToolsForSessionArgs(localTools: NormalizedTooling["localTools"]) {
  return localTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.input_schema ?? { type: "object", properties: {}, additionalProperties: false },
  }));
}