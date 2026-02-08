// src/lib/db/schema.ts
import {
    pgTable,
    text,
    varchar,
    timestamp,
    boolean,
    integer,
    jsonb,
    uuid,
    primaryKey,
    index,
    uniqueIndex,
  } from "drizzle-orm/pg-core";
  
  export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    image: text("image"), // <-- rename from imageUrl/image_url
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  
  export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  
  export const workspaceMembers = pgTable(
    "workspace_members",
    {
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      role: text("role").notNull().default("member"), // "owner" | "member"
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
      byUser: index("workspace_members__user_idx").on(t.userId),
    })
  );

  // Accounts (OAuth)
export const accounts = pgTable(
    "accounts",
    {
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
  
      type: text("type").notNull(), // "oauth" | "oidc" | "email"
      provider: text("provider").notNull(),
      providerAccountId: text("provider_account_id").notNull(),
  
      refresh_token: text("refresh_token"),
      access_token: text("access_token"),
      expires_at: integer("expires_at"),
      token_type: text("token_type"),
      scope: text("scope"),
      id_token: text("id_token"),
      session_state: text("session_state"),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
      byUser: index("accounts__user_idx").on(t.userId),
    })
  );
  
  // Sessions
  export const sessions = pgTable(
    "sessions",
    {
      sessionToken: text("session_token").primaryKey(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      expires: timestamp("expires", { withTimezone: true }).notNull(),
    },
    (t) => ({
      byUser: index("sessions__user_idx").on(t.userId),
    })
  );
  
  // Email verification tokens (magic link)
  export const verificationTokens = pgTable(
    "verification_tokens",
    {
      identifier: text("identifier").notNull(),
      token: text("token").notNull(),
      expires: timestamp("expires", { withTimezone: true }).notNull(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.identifier, t.token] }),
    })
  );
  
  export const tasks = pgTable(
    "tasks",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
  
      title: text("title").notNull(),
      description: text("description").notNull().default(""),
      executionSpec: jsonb("execution_spec").notNull().default({}),
      // deliverables: documents / spreadsheets / emails (created/edited)
      // store the request-side spec; actual produced artifacts attach to runs
      deliverablesSpec: jsonb("deliverables_spec").notNull().default([]),
  
      // context: guidelines, notes, links, etc
      contextSpec: jsonb("context_spec").notNull().default([]),
  
      // requested filesystem mounts (paths). real access happens via desktop bridge later.
      mountsSpec: jsonb("mounts_spec").notNull().default([]),
  
      createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byWorkspace: index("tasks__workspace_idx").on(t.workspaceId),
    })
  );
  
  export const workflows = pgTable(
    "workflows",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
  
      name: text("name").notNull(),
      description: text("description").notNull().default(""),
  
      createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byWorkspace: index("workflows__workspace_idx").on(t.workspaceId),
    })
  );
  
  export const workflowVersions = pgTable(
    "workflow_versions",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workflowId: uuid("workflow_id")
        .notNull()
        .references(() => workflows.id, { onDelete: "cascade" }),
  
      version: integer("version").notNull(),
      // immutable snapshot
      definition: jsonb("definition").notNull(), // includes deliverables/context/mounts/tools/schedule template
      createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      uniq: uniqueIndex("workflow_versions__uniq").on(t.workflowId, t.version),
    })
  );
  
  export type RunStatus =
    | "queued"
    | "running"
    | "paused"
    | "needs_input"
    | "needs_review"
    | "succeeded"
    | "failed"
    | "canceled";
  
// --- runs: add pinned program fields
export const runs = pgTable(
    "runs",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
  
      sourceType: text("source_type").notNull(),
      taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
      workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: "set null" }),
      nextEventSeq: integer("next_event_seq").notNull().default(1),
      parentRunId: uuid("parent_run_id"),
      status: text("status").notNull().$type<RunStatus>().default("queued"),
      title: text("title").notNull(),
      description: text("description").notNull().default(""),
      executionSpec: jsonb("execution_spec").notNull().default({}),
      temporalWorkflowId: text("temporal_workflow_id"),
      temporalRunId: text("temporal_run_id"),
  
      createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  
      creditsBudget: integer("credits_budget"),
      creditsSpent: integer("credits_spent").notNull().default(0),
  
      // ✅ pin compiler result on run
      compilerVersion: text("compiler_version"),
      programHash: text("program_hash"),
    },
    (t) => ({
      byWorkspace: index("runs__workspace_idx").on(t.workspaceId),
      byTask: index("runs__task_idx").on(t.taskId),
      byWorkflowVersion: index("runs__workflow_version_idx").on(t.workflowVersionId),
      byProgram: index("runs__program_idx").on(t.programHash),
    })
  );
  
  // --- run_programs: make it authoritative
  export const runPrograms = pgTable("run_programs", {
    runId: uuid("run_id")
      .primaryKey()
      .references(() => runs.id, { onDelete: "cascade" }),
  
    compilerVersion: text("compiler_version").notNull(),
    sourceHash: text("source_hash").notNull(),
  
    programText: text("program_text").notNull(),
    programSource: text("program_source").notNull().default("generated"),
    programHash: text("program_hash").notNull(),
  
    // ✅ NEW: store exact canonical compiler inputs for reproducibility
    compilerInputsJson: text("compiler_inputs_json").notNull().default(""),
  
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
    // Run mounts: filesystem paths requested by user (future desktop companion enforces actual access)
  export type MountType = "file" | "folder" | "path" | "multi";
  
  export const runMounts = pgTable(
    "run_mounts",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      type: text("type").notNull().$type<MountType>(),
      label: text("label").notNull().default(""),
      path: text("path").notNull(), // user-specified path
      // resolved / verified later by desktop bridge:
      verified: boolean("verified").notNull().default(false),
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byRun: index("run_mounts__run_idx").on(t.runId),
    })
  );
  

  
  export type BindingKind = "input" | "let" | "const" | "output";
  
  export const bindings = pgTable(
    "bindings",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      // e.g. "research" or "result__43"
      name: text("name").notNull(),
      kind: text("kind").notNull().$type<BindingKind>(),
      executionId: integer("execution_id"), // null for root scope
      sourceProse: text("source_prose"), // statement text that produced it
  
      // Keep VM lean: store big content in object store later
      contentRef: text("content_ref"), // s3/r2 key
      contentPreview: text("content_preview"), // small preview for UI
      summary: text("summary"), // runner returns summary to VM
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      uniq: uniqueIndex("bindings__uniq").on(t.runId, t.name, t.executionId),
      byRun: index("bindings__run_idx").on(t.runId),
    })
  );
  
  export type RunEventType =
  | "RUN_STATUS"
  | "LOG"
  | "TODO"
  | "STEP"
  | "ARTIFACT"
  | "FILE"
  | "CHECKPOINT"
  | "RESULT"
  | "ERROR";
  
  export const runEvents = pgTable(
    "run_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  
      // ✅ server-assigned, monotonic within run
      seq: integer("seq").notNull(),
  
      // ✅ producer idempotency
      source: text("source").notNull().default("runner"),      // "runner" | "worker" | "control_plane"
      sourceSeq: integer("source_seq").notNull().default(0),   // producer-local seq
  
      type: text("type").notNull().$type<RunEventType>(),
  
      agentName: text("agent_name"),
      sessionId: text("session_id"),
  
      action: text("action"),
      level: text("level"),
  
      todoId: text("todo_id"),
      stepId: text("step_id"),
      artifactId: text("artifact_id"),
      filePath: text("file_path"),
      checkpointId: text("checkpoint_id"),
  
      payload: jsonb("payload").notNull().default({}),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      // ✅ ordering + replay
      uniqSeq: uniqueIndex("run_events__uniq_seq").on(t.runId, t.seq),
      byRun: index("run_events__run_idx").on(t.runId, t.seq),
  
      // ✅ idempotency across multiple producers
      uniqProducer: uniqueIndex("run_events__uniq_prod").on(t.runId, t.source, t.sourceSeq),
  
      byType: index("run_events__type_idx").on(t.runId, t.type, t.seq),
      bySession: index("run_events__session_idx").on(t.runId, t.sessionId, t.seq),
      byStep: index("run_events__step_idx").on(t.runId, t.stepId, t.seq),
      byTodo: index("run_events__todo_idx").on(t.runId, t.todoId, t.seq),
      byFile: index("run_events__file_idx").on(t.runId, t.filePath, t.seq),
    })
  );
  
  export type StepStatus = "started" | "completed" | "failed" | "canceled";

  export const runSteps = pgTable(
    "run_steps",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  
      stepKey: text("step_key").notNull(), // stable identifier from events (tool_use_id or generated)
      name: text("name").notNull(),        // "tool:Write"
      status: text("status").notNull().$type<StepStatus>().default("started"),
  
      toolName: text("tool_name"),
      toolUseId: text("tool_use_id"),
  
      startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
      endedAt: timestamp("ended_at", { withTimezone: true }),
  
      detail: text("detail").notNull().default(""),
      payload: jsonb("payload").notNull().default({}),
    },
    (t) => ({
      uniq: uniqueIndex("run_steps__uniq").on(t.runId, t.stepKey),
      byRun: index("run_steps__run_idx").on(t.runId, t.startedAt),
      byStatus: index("run_steps__status_idx").on(t.runId, t.status, t.startedAt),
    })
  );


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

export type CheckpointStatus = "created" | "restored" | "dropped";

export const runCheckpoints = pgTable(
  "run_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),

    provider: text("provider").notNull().default("claude_sdk"),
    providerCheckpointId: text("provider_checkpoint_id").notNull(),

    status: text("status").notNull().$type<CheckpointStatus>().default("created"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => ({
    uniq: uniqueIndex("run_checkpoints__uniq").on(t.runId, t.providerCheckpointId),
    byRun: index("run_checkpoints__run_idx").on(t.runId, t.createdAt),
  })
);

    export type ArtifactType = "document" | "spreadsheet" | "email" | "file" | "patch" | "log";


    export const artifacts = pgTable(
        "artifacts",
        {
          id: uuid("id").primaryKey().defaultRandom(),
          runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
      
          type: text("type").notNull().$type<ArtifactType>(),
          title: text("title").notNull(),
      
      deliverableKey: text("deliverable_key"),
          contentRef: text("content_ref"), // <-- add this (matches protocol)
          sha256: text("sha256"),
          mime: text("mime"),
          size: integer("size"),
      
          createdBy: text("created_by").notNull().default("agent"),
          createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        },
        (t) => ({
          byRun: index("artifacts__run_idx").on(t.runId),
          uniqContent: uniqueIndex("artifacts__content_uniq").on(t.runId, t.contentRef),
        })
      );


  export const comments = pgTable(
    "comments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  
      targetType: text("target_type").notNull(), // "run" | "artifact" | "binding" | "todo"
      targetId: uuid("target_id"),
  
      body: text("body").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byRun: index("comments__run_idx").on(t.runId),
    })
  );
  
export type TodoStatus = "pending" | "in_progress" | "completed";
  
  export const todos = pgTable(
    "todos",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  
      externalId: text("external_id"), // agent todo id like "t1"
      text: text("text").notNull(),
      description: text("description").notNull().default(""),
    status: text("status").notNull().$type<TodoStatus>().default("pending"),
      order: integer("order").notNull().default(0),
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byRun: index("todos__run_idx").on(t.runId, t.order),
      byExternal: uniqueIndex("todos__external_uniq").on(t.runId, t.externalId),
    })
  );

  export const contentBlobs = pgTable(
    "content_blobs",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      contentRef: text("content_ref").notNull(), // bucket key (or full URI later)
  
      sha256: text("sha256"),
      mime: text("mime"),
      size: integer("size"),
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      uniq: uniqueIndex("content_blobs__uniq").on(t.contentRef),
    })
  );

  export type AgentSessionStatus = "running" | "succeeded" | "failed" | "canceled";

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),

    runnerSessionId: text("runner_session_id").notNull(),
    provider: text("provider").notNull().default("anthropic"),
    model: text("model"),

    agentType: text("agent_type").notNull().default("mock"),
    status: text("status").notNull().$type<AgentSessionStatus>().default("running"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    byRun: index("agent_sessions__run_idx").on(t.runId),
    uniq: uniqueIndex("agent_sessions__uniq").on(t.runnerSessionId),
  })
);

export type MemoryScope = "workspace" | "task" | "run" | "session";
export type MemoryKind = "note" | "fact" | "preference" | "decision" | "summary";

export const agentMemoryItems = pgTable(
  "agent_memory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),

    scope: text("scope").notNull().$type<MemoryScope>().default("workspace"),
    kind: text("kind").notNull().$type<MemoryKind>().default("note"),

    text: text("text").notNull(),
    sourceRunId: uuid("source_run_id").references(() => runs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("agent_memory_items__workspace_idx").on(t.workspaceId, t.createdAt),
  })
);

export type RunPermissionCapability =
  | "tools.use"
  | "files.read"
  | "files.write"
  | "net.egress"
  | "connectors.use";

export const runPermissions = pgTable(
  "run_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),

    capability: text("capability").notNull().$type<RunPermissionCapability>(),
    // optional scoping (e.g. tool name, connector id, domain allowlist, etc)
    scope: text("scope"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("run_permissions__run_idx").on(t.runId),
  })
);

export type RunFileMode = "ro" | "rw";

export const runFiles = pgTable(
  "run_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),

    contentRef: text("content_ref").notNull(), // object store key
    path: text("path").notNull(), // path inside runner workspace
    mode: text("mode").notNull().$type<RunFileMode>().default("ro"),

    sha256: text("sha256"),
    mime: text("mime"),
    size: integer("size"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("run_files__run_idx").on(t.runId),
    uniq: uniqueIndex("run_files__uniq").on(t.runId, t.path),
  })
);

export type CreditLedgerKind = "credit" | "debit" | "hold" | "release";

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),

    kind: text("kind").notNull().$type<CreditLedgerKind>(),
    amount: integer("amount").notNull(), // credits (int). keep cents later if you want.
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    reason: text("reason").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("credit_ledger__workspace_idx").on(t.workspaceId, t.createdAt),
    byRun: index("credit_ledger__run_idx").on(t.runId),
  })
);

// --- tool catalog (Phase 1)
export const toolCatalog = pgTable(
    "tool_catalog",
    {
      toolName: text("tool_name").primaryKey(),
      description: text("description").notNull().default(""),
      inputSchema: jsonb("input_schema").notNull().default({}),
      outputSchema: jsonb("output_schema").notNull().default({}),
      requiredCaps: jsonb("required_caps").notNull().default([]),
      tags: jsonb("tags").notNull().default([]),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byName: index("tool_catalog__name_idx").on(t.toolName),
    })
  );