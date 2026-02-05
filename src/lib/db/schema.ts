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
    imageUrl: text("image_url"),
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
  
  export const tasks = pgTable(
    "tasks",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
  
      title: text("title").notNull(),
      description: text("description").notNull().default(""),
  
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
  
  export const runs = pgTable(
    "runs",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
  
      // source of run
      sourceType: text("source_type").notNull(), // "task" | "workflow_version"
      taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
      workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: "set null" }),
  
      parentRunId: uuid("parent_run_id"),  
      status: text("status").notNull().$type<RunStatus>().default("queued"),
      title: text("title").notNull(),
      description: text("description").notNull().default(""),
  
      // Temporal linkage
      temporalWorkflowId: text("temporal_workflow_id"),
      temporalRunId: text("temporal_run_id"),
  
      createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  
      // credits/budgeting (v1: optional)
      creditsBudget: integer("credits_budget"),
      creditsSpent: integer("credits_spent").notNull().default(0),
    },
    (t) => ({
      byWorkspace: index("runs__workspace_idx").on(t.workspaceId),
      byTask: index("runs__task_idx").on(t.taskId),
      byWorkflowVersion: index("runs__workflow_version_idx").on(t.workflowVersionId),
    })
  );
  
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
  
  // Programs / prose text stored per run (Phase 1 uses dummy; later you’ll store compiled prose)
  export const runPrograms = pgTable("run_programs", {
    runId: uuid("run_id")
      .primaryKey()
      .references(() => runs.id, { onDelete: "cascade" }),
  
    programText: text("program_text").notNull(), // .prose
    programSource: text("program_source").notNull().default("generated"),
    programHash: text("program_hash"),
  
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  
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
    | "RUN_CREATED"
    | "RUN_STATUS"
    | "VM_LOG"
    | "STEP_STARTED"
    | "STEP_COMPLETED"
    | "BINDING_WRITTEN"
    | "TODO_CREATED"
    | "TODO_UPDATED"
    | "ARTIFACT_CREATED"
    | "ERROR";
  
  export const runEvents = pgTable(
    "run_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      // monotonic sequence per run (we'll compute as max+1 in code v1)
      seq: integer("seq").notNull(),
      type: text("type").notNull().$type<RunEventType>(),
      payload: jsonb("payload").notNull().default({}),
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      uniq: uniqueIndex("run_events__uniq").on(t.runId, t.seq),
      byRun: index("run_events__run_idx").on(t.runId, t.seq),
    })
  );
  
  export type ArtifactType = "document" | "spreadsheet" | "email" | "file" | "patch" | "log";
  
  export const artifacts = pgTable(
    "artifacts",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      type: text("type").notNull().$type<ArtifactType>(),
      title: text("title").notNull(),
      // stored externally (or inline later)
      blobKey: text("blob_key"),
      mime: text("mime"),
      size: integer("size"),
  
      createdBy: text("created_by").notNull().default("agent"), // "agent" | "user"
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byRun: index("artifacts__run_idx").on(t.runId),
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
  
  export type TodoStatus = "not_started" | "in_progress" | "done";
  
  export const todos = pgTable(
    "todos",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
  
      text: text("text").notNull(),
      description: text("description").notNull().default(""),
      status: text("status").notNull().$type<TodoStatus>().default("not_started"),
      order: integer("order").notNull().default(0),
  
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      byRun: index("todos__run_idx").on(t.runId, t.order),
    })
  );