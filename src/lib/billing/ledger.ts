// src/lib/billing/ledger.ts
import { db, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function workspaceBalance(workspaceId: string): Promise<number> {
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

async function workspaceBalanceForUpdate(tx: any, workspaceId: string): Promise<number> {
  // Lock the workspace’s ledger rows so two starters don't both "see" the same balance.
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
  return Number((rows as any)?.rows?.[0]?.balance ?? 0);
}

export async function reserveForRun(params: {
  workspaceId: string;
  runId: string;
  estCost: number; // int credits
  reason?: string;
}): Promise<
  | { ok: true; balanceAfter: number; alreadyHeld: boolean }
  | { ok: false; balance: number }
> {
  const { workspaceId, runId, estCost, reason } = params;

  return await db.transaction(async (tx) => {
    // If hold already exists, return ok immediately (idempotent).
    const existing = await tx.execute(sql`
      SELECT id, amount
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
        AND run_id = ${runId}::uuid
        AND kind = 'hold'
      LIMIT 1
      FOR UPDATE
    `);

    const ex = (existing as any)?.rows?.[0];
    if (ex) {
      // held amount might differ; for v1 we accept "already held" as ok
      const bal = await workspaceBalanceForUpdate(tx, workspaceId);
      return { ok: true as const, balanceAfter: bal, alreadyHeld: true };
    }

    const balance = await workspaceBalanceForUpdate(tx, workspaceId);
    if (balance < estCost) return { ok: false as const, balance };

    try {
      // Insert hold. If a concurrent request inserted first, the unique partial index will conflict.
      await tx.insert(schema.creditLedger).values({
        workspaceId: workspaceId as any,
        kind: "hold",
        amount: estCost,
        runId: runId as any,
        reason: reason ?? "reserve_for_run",
      } as any);
    } catch (e: any) {
      // On conflict, treat as idempotent success.
      const msg = String(e?.message ?? e);
      if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
        throw e;
      }
    }

    const balanceAfter = await workspaceBalanceForUpdate(tx, workspaceId);
    return { ok: true as const, balanceAfter, alreadyHeld: false };
  });
}

export async function settleRunHold(params: {
  workspaceId: string;
  runId: string;
  actualCost: number; // int credits
  reason?: string;
}): Promise<{ ok: true; debited: boolean; released: boolean; held: number; remainder: number }> {
  const { workspaceId, runId, actualCost, reason } = params;

  return await db.transaction(async (tx) => {
    // Lock run-scoped ledger rows so settle is idempotent under retries.
    const heldRows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS held
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
        AND run_id = ${runId}::uuid
        AND kind = 'hold'
      FOR UPDATE
    `);
    const held = Number((heldRows as any)?.rows?.[0]?.held ?? 0);

    // If already debited, do nothing (idempotent).
    const debitRows = await tx.execute(sql`
      SELECT id, amount
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
        AND run_id = ${runId}::uuid
        AND kind = 'debit'
      LIMIT 1
      FOR UPDATE
    `);
    const alreadyDebited = Boolean((debitRows as any)?.rows?.[0]);

    let debited = false;
    if (!alreadyDebited) {
      try {
        await tx.insert(schema.creditLedger).values({
          workspaceId: workspaceId as any,
          kind: "debit",
          amount: actualCost,
          runId: runId as any,
          reason: reason ?? "run_usage",
        } as any);
        debited = true;
      } catch (e: any) {
        // In case two settle attempts race, unique debit index will conflict.
        const msg = String(e?.message ?? e);
        if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
          throw e;
        }
      }
    }

    // Release remainder once (idempotent)
    const remainder = Math.max(0, held - actualCost);

    const releaseRows = await tx.execute(sql`
      SELECT id
      FROM credit_ledger
      WHERE workspace_id = ${workspaceId}::uuid
        AND run_id = ${runId}::uuid
        AND kind = 'release'
      LIMIT 1
      FOR UPDATE
    `);

    const alreadyReleased = Boolean((releaseRows as any)?.rows?.[0]);

    let released = false;
    if (remainder > 0 && !alreadyReleased) {
      try {
        await tx.insert(schema.creditLedger).values({
          workspaceId: workspaceId as any,
          kind: "release",
          amount: remainder,
          runId: runId as any,
          reason: "release_remainder",
        } as any);
        released = true;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
          throw e;
        }
      }
    }

    return { ok: true as const, debited, released, held, remainder };
  });
}