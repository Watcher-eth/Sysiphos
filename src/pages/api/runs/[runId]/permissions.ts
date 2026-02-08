import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VALID_CAPABILITIES = new Set([
  "tools.use",
  "files.read",
  "files.write",
  "net.egress",
  "connectors.use",
]);

type PermissionInput = { capability: string; scope?: string | null };

function normalizePermission(p: PermissionInput) {
  const capability = String(p.capability ?? "").trim();
  if (!VALID_CAPABILITIES.has(capability)) throw new Error("invalid_capability");
  const scope = p.scope != null ? String(p.scope).trim() : null;
  if (capability === "tools.use" && !scope) throw new Error("tool_scope_required");
  return { capability, scope };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  const runRow = await db
    .select({ workspaceId: schema.runs.workspaceId })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const run = runRow[0];
  if (!run) return res.status(404).send("Run not found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, run.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  if (req.method === "GET") {
    const permissions = await db
      .select({
        id: schema.runPermissions.id,
        capability: schema.runPermissions.capability,
        scope: schema.runPermissions.scope,
        createdAt: schema.runPermissions.createdAt,
      })
      .from(schema.runPermissions)
      .where(eq(schema.runPermissions.runId, runId as any));

    return res.status(200).json({ ok: true, permissions });
  }

  if (req.method === "POST") {
    const permissions = req.body?.permissions;
    if (!Array.isArray(permissions)) return res.status(400).send("permissions_required");

    let normalized: Array<{ capability: string; scope: string | null }> = [];
    try {
      normalized = permissions.map((p: PermissionInput) => normalizePermission(p));
    } catch (err: any) {
      return res.status(400).send(String(err?.message ?? "invalid_permissions"));
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.runPermissions).where(eq(schema.runPermissions.runId, runId as any));
      if (normalized.length) {
        await tx
          .insert(schema.runPermissions)
          .values(
            normalized.map((p) => ({
              runId: runId as any,
              capability: p.capability as any,
              scope: p.scope,
            })) as any
          );
      }
    });

    return res.status(200).json({ ok: true, count: normalized.length });
  }

  return res.status(405).end();
}
