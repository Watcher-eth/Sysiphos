export type FileOp =
  | "opened"
  | "read"
  | "created"
  | "edited"
  | "deleted"
  | "moved"
  | "copied"
  | "mkdir"
  | "rmdir";

export const runFileOps = pgTable(
  "run_file_ops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),

    op: text("op").notNull().$type<FileOp>(),
    path: text("path").notNull(),

    // optional: for diffs / tracking
    beforeContentRef: text("before_content_ref"),
    afterContentRef: text("after_content_ref"),

    // links to checkpoints (5.6)
    checkpointId: text("checkpoint_id"),

    toolName: text("tool_name"),
    toolUseId: text("tool_use_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => ({
    byRun: index("run_file_ops__run_idx").on(t.runId, t.createdAt),
    byPath: index("run_file_ops__path_idx").on(t.runId, t.path, t.createdAt),
  })
);