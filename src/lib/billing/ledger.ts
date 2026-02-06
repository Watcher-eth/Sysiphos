// src/lib/billing/ledger.ts
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export async function workspaceBalance(workspaceId: string): Promise<number> {
  // balance = credits - debits - holds + releases
  // release is “give back” so it increases balance
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN kind = 'credit' THEN amount
        WHEN kind = 'debit' THEN -amount
        WHEN kind = 'hold' THEN -amount
        WHEN kind = 'release' THEN amount
        ELSE 0
      END
    ), 0) AS balance
    FROM credit_ledger
    WHERE workspace_id = ${workspaceId}::uuid
  `);

  const first = (rows as any)?.rows?.[0];
  return Number(first?.balance ?? 0);
}

export async function reserveForRun(params: {
  workspaceId: string;
  runId: string;
  estCost: number; // int credits
  reason?: string;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; balance: number }> {
  const { workspaceId, runId, estCost, reason } = params;

  return await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN kind = 'credit' THEN amount
          WHEN kind = 'debit' THEN -amount
          WHEN kind = 'hold' THEN -amount
          WHEN kind = 'release' THEN amount
          ELSE 0
        END
      ), 0) AS balance
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
      FOR UPDATE
    `);

    const balance = Number((rows as any)?.rows?.[0]?.balance ?? 0);
    if (balance < estCost) return { ok: false as const, balance };

    await tx.insert(schema.creditLedger).values({
      workspaceId: workspaceId as any,
      kind: "hold",
      amount: estCost,
      runId: runId as any,
      reason: reason ?? "reserve_for_run",
    } as any);

    return { ok: true as const, balanceAfter: balance - estCost };
  });
}

export async function settleRunHold(params: {
  workspaceId: string;
  runId: string;
  actualCost: number; // int credits
  reason?: string;
}) {
  const { workspaceId, runId, actualCost, reason } = params;

  await db.transaction(async (tx) => {
    // sum holds for this run
    const heldRows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS held
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
        AND run_id = ${runId}::uuid
        AND kind = 'hold'
      FOR UPDATE
    `);

    const held = Number((heldRows as any)?.rows?.[0]?.held ?? 0);

    // debit actual
    await tx.insert(schema.creditLedger).values({
      workspaceId: workspaceId as any,
      kind: "debit",
      amount: actualCost,
      runId: runId as any,
      reason: reason ?? "run_usage",
    } as any);

    // release remainder if over-held
    const remainder = held - actualCost;
    if (remainder > 0) {
      await tx.insert(schema.creditLedger).values({
        workspaceId: workspaceId as any,
        kind: "release",
        amount: remainder,
        runId: runId as any,
        reason: "release_remainder",
      } as any);
    }
  });
}