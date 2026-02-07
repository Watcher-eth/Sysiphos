import { db, schema } from "@/lib/db";

type ToolSeed = {
  toolName: string;
  description: string;
  requiredCaps: string[];
  tags: string[];
  inputSchema: any;
  outputSchema: any;
};

const SEEDS: ToolSeed[] = [
  {
    toolName: "tools.search",
    description: "Search available tools by name/description/tags and return tool references.",
    requiredCaps: ["tools.use"],
    tags: ["tools", "registry"],
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        tools: {
          type: "array",
          items: {
            type: "object",
            properties: {
              toolName: { type: "string" },
              description: { type: "string" },
              requiredCaps: { type: "array", items: { type: "string" } },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["toolName"],
          },
        },
      },
      required: ["tools"],
    },
  },
  {
    toolName: "tools.request",
    description: "Request additional tool/capability grants for the current run.",
    requiredCaps: ["tools.use"],
    tags: ["tools", "permissions"],
    inputSchema: {
      type: "object",
      properties: {
        grants: {
          type: "array",
          items: {
            oneOf: [
              { type: "object", properties: { kind: { const: "tool" }, toolName: { type: "string" } }, required: ["kind", "toolName"] },
              { type: "object", properties: { kind: { const: "cap" }, capability: { type: "string" }, scope: { type: ["string", "null"] } }, required: ["kind", "capability"] },
            ],
          },
        },
        reason: { type: "string" },
      },
      required: ["grants"],
    },
    outputSchema: {
      type: "object",
      properties: { granted: { type: "array" } },
      required: ["granted"],
    },
  },
  {
    toolName: "files.list",
    description: "List files in the run workspace, constrained to declared run files and mounts.",
    requiredCaps: ["files.read"],
    tags: ["files"],
    inputSchema: { type: "object", properties: { prefix: { type: "string" } }, required: [] },
    outputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } } }, required: ["paths"] },
  },
  {
    toolName: "files.get",
    description: "Read a text file from the run workspace (must be ro or rw in manifest).",
    requiredCaps: ["files.read"],
    tags: ["files"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    outputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    toolName: "files.put",
    description: "Write a text file to the run workspace (must be rw in manifest).",
    requiredCaps: ["files.write"],
    tags: ["files"],
    inputSchema: { type: "object", properties: { path: { type: "string" }, text: { type: "string" } }, required: ["path", "text"] },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  },
  {
    toolName: "http.fetch",
    description: "Fetch a URL over the network (requires net.egress and domain allowlist scope).",
    requiredCaps: ["net.egress"],
    tags: ["http", "network"],
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string" } },
      required: ["url"],
    },
    outputSchema: {
      type: "object",
      properties: { status: { type: "number" }, text: { type: "string" } },
      required: ["status", "text"],
    },
  },
];

export async function seedToolCatalog() {
  for (const t of SEEDS) {
    await db
      .insert(schema.toolCatalog)
      .values({
        toolName: t.toolName,
        description: t.description,
        requiredCaps: t.requiredCaps,
        tags: t.tags,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      })
      .onConflictDoUpdate({
        target: schema.toolCatalog.toolName,
        set: {
          description: t.description,
          requiredCaps: t.requiredCaps,
          tags: t.tags,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
          updatedAt: new Date(),
        },
      });
  }
}