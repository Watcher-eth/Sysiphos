// src/lib/tenant.ts
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function getDefaultWorkspaceIdForUser(userId: string) {
  const rows = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId));

  return rows[0]?.workspaceId ?? null;
}