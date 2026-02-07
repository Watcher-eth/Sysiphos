import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

type GrantReq =
  | { kind: "tool"; toolName: string }
  | { kind: "cap"; capability: string; scope?: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const runId = String(req.query.runId ?? "").trim();
  if (!runId) return res.status(400).json({ ok: false, error: "missing_runId" });

  const body = (req.body ?? {}) as { grants?: GrantReq[] };
  const grants = Array.isArray(body.grants) ? body.grants : [];
  if (!grants.length) return res.status(200).json({ ok: true, granted: [] });

  const inserted: GrantReq[] = [];

  for (const g of grants) {
    if (g?.kind === "tool") {
      const toolName = String(g.toolName ?? "").trim();
      if (!toolName) continue;

      const exists = await db
        .select({ id: schema.runPermissions.id })
        .from(schema.runPermissions)
        .where(and(eq(schema.runPermissions.runId, runId as any), eq(schema.runPermissions.capability, "tools.use" as any), eq(schema.runPermissions.scope, toolName)))
        .limit(1);

      if (!exists[0]) {
        await db.insert(schema.runPermissions).values({
          runId: runId as any,
          capability: "tools.use" as any,
          scope: toolName,
        });
        inserted.push({ kind: "tool", toolName });
      }
      continue;
    }

    if (g?.kind === "cap") {
      const capability = String(g.capability ?? "").trim();
      if (!capability) continue;

      const scope = g.scope == null ? null : String(g.scope);

      const exists = await db
        .select({ id: schema.runPermissions.id })
        .from(schema.runPermissions)
        .where(and(eq(schema.runPermissions.runId, runId as any), eq(schema.runPermissions.capability, capability as any), eq(schema.runPermissions.scope, scope)))
        .limit(1);

      if (!exists[0]) {
        await db.insert(schema.runPermissions).values({
          runId: runId as any,
          capability: capability as any,
          scope,
        });
        inserted.push({ kind: "cap", capability, scope });
      }
      continue;
    }
  }

  return res.status(200).json({ ok: true, granted: inserted });
}