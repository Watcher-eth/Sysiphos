import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

type ToolRef = {
  toolName: string;
  description: string;
  requiredCaps: string[];
  tags: string[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(10, Math.max(1, Number(req.query.limit ?? 5)));

  if (!q) return res.status(200).json({ ok: true, tools: [] as ToolRef[] });

  // Simple FTS-like ranking without needing tsvector migrations yet:
  // rank by ILIKE hits in name/description; good enough for Phase 1
  const rows = await db.execute(sql`
    select
      tool_name as "toolName",
      description as "description",
      required_caps as "requiredCaps",
      tags as "tags",
      (
        (case when tool_name ilike ${"%" + q + "%"} then 10 else 0 end) +
        (case when description ilike ${"%" + q + "%"} then 3 else 0 end)
      ) as score
    from tool_catalog
    where tool_name ilike ${"%" + q + "%"} or description ilike ${"%" + q + "%"}
    order by score desc, tool_name asc
    limit ${limit};
  `);

  const tools = (rows.rows as any[]).map((r) => ({
    toolName: String(r.toolName),
    description: String(r.description ?? ""),
    requiredCaps: Array.isArray(r.requiredCaps) ? r.requiredCaps.map(String) : [],
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
  }));

  return res.status(200).json({ ok: true, tools });
}