"use client";

import * as React from "react";
import {
  Home,
  Users,
  Image as ImageIcon,
  PieChart,
  Plus,
  Paperclip,
  AtSign,
  ArrowUp,
  Loader2,
  Pause,
  RotateCcw,
  MessageSquare,
  ChevronRight,
  Clock3,
  Bot,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* ───────────────── Types ───────────────── */

type AgentStatus = "green" | "yellow" | "red" | "none";
type TodoStatus = "not_started" | "in_progress" | "done" | "error";

type Agent = {
  id: string;
  name: string;
  avatarUrl: string;
  status?: AgentStatus;
};

type Subtask = {
  id: string;
  text: string;
  status: TodoStatus;
  at: string; // "Feb 10, 14:40"
  result?: {
    title?: string;
    body?: string;
    kv?: Array<{ k: string; v: string }>;
  };
};

type TaskRunStatus = "open" | "in_progress" | "paused" | "done" | "error";

type TaskRun = {
  id: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  status: TaskRunStatus;
  agent: Agent;
  subtasks: Subtask[];
  comments: Array<{
    id: string;
    at: string;
    author: "user" | "agent";
    text: string;
  }>;
};

type FeedEvent =
  | {
      id: string;
      kind: "task_run";
      at: string; // timeline position label
      actor: Agent;
      task: TaskRun;
    }
  | {
      id: string;
      kind: "comment";
      at: string;
      actor: Agent;
      author: Agent;
      text: string;
    };

/* ───────────────── Demo data (replace w/ live feed) ───────────────── */

const AGENTS: Agent[] = [
  {
    id: "a1",
    name: "Amie AI",
    avatarUrl:
      "https://api.dicebear.com/8.x/notionists-neutral/png?seed=Amie&backgroundColor=93c5fd",
    status: "green",
  },
  {
    id: "a2",
    name: "Ops Worker",
    avatarUrl:
      "https://api.dicebear.com/8.x/notionists-neutral/png?seed=Ops&backgroundColor=fde68a",
    status: "green",
  },
  {
    id: "a3",
    name: "Finance Agent",
    avatarUrl:
      "https://api.dicebear.com/8.x/notionists-neutral/png?seed=Finance&backgroundColor=c0aede",
    status: "yellow",
  },
];

const DEMO_TASKS: TaskRun[] = [
  {
    id: "tr-1",
    title: "Prepare tenant accounting + update owner balances — Holsteinische 18",
    startedAt: "Feb 10, 14:05",
    updatedAt: "Feb 10, 16:12",
    status: "in_progress",
    agent: AGENTS[0]!,
    subtasks: [
      {
        id: "s1",
        text: "Import rent roll + bank export",
        status: "done",
        at: "Feb 10, 14:05",
        result: {
          title: "Import result",
          kv: [
            { k: "Rows", v: "1,248" },
            { k: "Accounts", v: "3" },
            { k: "Mismatches", v: "0" },
          ],
        },
      },
      {
        id: "s2",
        text: "Reconcile payments vs bank export",
        status: "in_progress",
        at: "Feb 10, 14:40",
        result: {
          title: "Current finding",
          body: "3 tenants missing reference strings; amounts match but IDs don’t.",
        },
      },
      {
        id: "s3",
        text: "Create missing data tracker sheet",
        status: "done",
        at: "Feb 10, 15:10",
        result: {
          title: "Output",
          body: "Tracker sheet created with missing-doc flags and owner notes column.",
        },
      },
      {
        id: "s4",
        text: "Send emails to tenants missing documents",
        status: "not_started",
        at: "Feb 10, 16:45",
      },
    ],
    comments: [
      {
        id: "c1",
        at: "Feb 10, 15:32",
        author: "agent",
        text: "Tracker + draft email template ready. Send automatically or wait for approval?",
      },
    ],
  },
  {
    id: "tr-2",
    title: "Update tenant balance table — normalize + mark missing",
    startedAt: "Feb 09, 17:10",
    updatedAt: "Feb 10, 10:15",
    status: "paused",
    agent: AGENTS[1]!,
    subtasks: [
      { id: "s1", text: "Normalize columns", status: "done", at: "Feb 09, 17:10" },
      {
        id: "s2",
        text: "Mark missing values + add notes column",
        status: "done",
        at: "Feb 09, 17:45",
        result: {
          title: "Missing values",
          kv: [
            { k: "Tenants", v: "7" },
            { k: "Fields", v: "12" },
          ],
        },
      },
      { id: "s3", text: "Cross-check totals vs bank export", status: "in_progress", at: "Feb 10, 10:15" },
    ],
    comments: [],
  },
  {
    id: "tr-3",
    title: "Collect missing tenant documents — March close",
    startedAt: "Feb 10, 12:30",
    updatedAt: "Feb 10, 12:50",
    status: "error",
    agent: AGENTS[2]!,
    subtasks: [
      { id: "s1", text: "Check who is missing ID / SEPA / handover protocol", status: "done", at: "Feb 10, 12:30" },
      {
        id: "s2",
        text: "Pull contact details from CRM",
        status: "error",
        at: "Feb 10, 12:48",
        result: {
          title: "Error",
          body: "Permission denied: CRM.contacts.read. Ask admin to grant access.",
        },
      },
    ],
    comments: [
      {
        id: "c1",
        at: "Feb 10, 12:50",
        author: "agent",
        text: "I hit a permission error. If you grant CRM read access, I can retry immediately.",
      },
    ],
  },
];

function buildFeed(tasks: TaskRun[]): FeedEvent[] {
  const items: FeedEvent[] = [];
  for (const t of tasks) {
    items.push({
      id: `e-${t.id}`,
      kind: "task_run",
      at: t.updatedAt,
      actor: t.agent,
      task: t,
    });
    for (const c of t.comments) {
      items.push({
        id: `e-${t.id}-${c.id}`,
        kind: "comment",
        at: c.at,
        actor: t.agent,
        author: t.agent,
        text: c.text,
      });
    }
  }
  // newest-ish first feels like the reference
  return items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/* ───────────────── Small UI atoms ───────────────── */

function Avatar({
  p,
  size = 26,
  ring = false,
}: {
  p: Agent;
  size?: number;
  ring?: boolean;
}) {
  return (
    <div className="relative">
      <img
        src={p.avatarUrl}
        alt={p.name}
        style={{ width: size, height: size }}
        className={cn("rounded-full object-cover", ring && "ring-2 ring-white shadow-sm")}
      />
      {p.status && p.status !== "none" ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
            p.status === "green" && "bg-emerald-400",
            p.status === "red" && "bg-red-400",
            p.status === "yellow" && "bg-amber-400"
          )}
        />
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-500">
      {children}
    </span>
  );
}

function TodoMark({ status }: { status: TodoStatus }) {
  return (
    <span
      className={cn(
        "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[6px] border bg-white p-[1.5px]",
        status === "not_started"
          ? "border-neutral-300"
          : status === "in_progress"
          ? "border-sky-500"
          : status === "done"
          ? "border-emerald-500"
          : "border-red-500"
      )}
    >
      <span
        className={cn(
          "grid h-full w-full place-items-center rounded-[4px]",
          status === "not_started" && "bg-transparent",
          status === "in_progress" && "bg-sky-500",
          status === "done" && "bg-emerald-500",
          status === "error" && "bg-red-500"
        )}
      />
    </span>
  );
}

function RowEnd({ status }: { status: TodoStatus }) {
  if (status === "in_progress") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />;
  if (status === "done") return <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />;
  if (status === "error") return <span className="h-4 w-4 shrink-0 text-red-500">!</span>;
  return <span className="h-4 w-4 shrink-0" />;
}

function StatusPill({ status }: { status: TaskRunStatus }) {
  const label =
    status === "in_progress"
      ? "Running"
      : status === "paused"
      ? "Paused"
      : status === "done"
      ? "Done"
      : status === "error"
      ? "Error"
      : "Open";

  return (
    <span
      className={cn(
        "rounded-full border bg-white px-2 py-0.5 text-[11px]",
        status === "in_progress" && "border-sky-200 text-sky-600",
        status === "paused" && "border-amber-200 text-amber-600",
        status === "done" && "border-emerald-200 text-emerald-600",
        status === "error" && "border-red-200 text-red-600",
        status === "open" && "border-neutral-200 text-neutral-500"
      )}
    >
      {label}
    </span>
  );
}

/* ───────────────── Timeline wrapper (match ref dots/line) ───────────────── */

function TimelineItem({
  children,
  dotTone = "neutral",
}: {
  children: React.ReactNode;
  dotTone?: "neutral" | "pink";
}) {
  return (
    <div className="relative pl-10">
      <div className="absolute left-[14px] top-0 h-full w-px bg-neutral-200" />
      <div
        className={cn(
          "absolute left-[8px] top-2 h-3 w-3 rounded-full",
          dotTone === "pink" ? "bg-rose-200" : "bg-neutral-200"
        )}
      />
      <div>{children}</div>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      {children}
    </div>
  );
}

/* ───────────────── TaskRun card (looks like ref cards) ───────────────── */

function SubtaskResult({ s }: { s: Subtask }) {
  if (!s.result) return null;

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      {s.result.title ? (
        <div className="text-xs font-medium text-neutral-400">{s.result.title}</div>
      ) : null}

      {s.result.body ? (
        <div className="mt-1 text-sm leading-6 text-neutral-700">{s.result.body}</div>
      ) : null}

      {s.result.kv?.length ? (
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {s.result.kv.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-neutral-500">{x.k}</span>
              <span className="font-medium text-neutral-900 tabular-nums">{x.v}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskRunCard({
  task,
  onPause,
  onRedo,
  onComment,
}: {
  task: TaskRun;
  onPause: (id: string) => void;
  onRedo: (id: string) => void;
  onComment: (id: string, text: string) => void;
}) {
  const [comment, setComment] = React.useState("");

  const canPause = task.status === "in_progress";
  const canRedo = task.status === "done" || task.status === "error" || task.status === "paused";

  return (
    <CardShell>
      <div className="p-5">
        {/* header row like ref: actor line */}
        <div className="flex items-center justify-between gap-4 text-sm text-neutral-600">
          <div className="flex items-center gap-2">
            <Avatar p={task.agent} size={26} />
            <span className="font-medium text-neutral-900">{task.agent.name}</span>
            <span className="text-neutral-500">worked on</span>
            <span className="font-medium text-neutral-900">{task.title}</span>
            <span className="text-neutral-400">•</span>
            <span className="text-neutral-400 tabular-nums">{task.updatedAt}</span>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill status={task.status} />
            <button
              onClick={() => onPause(task.id)}
              disabled={!canPause}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs",
                canPause
                  ? "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  : "border-neutral-200 text-neutral-300"
              )}
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              onClick={() => onRedo(task.id)}
              disabled={!canRedo}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs",
                canRedo
                  ? "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  : "border-neutral-200 text-neutral-300"
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Redo
            </button>
          </div>
        </div>

        {/* subtasks list like your Todos visual language */}
        <div className="mt-5 space-y-5">
          {task.subtasks.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-10">
              <div className="flex min-w-0 items-start gap-3">
                <div className="pt-[3px]">
                  <TodoMark status={s.status} />
                </div>

                <div className="min-w-0">
                  <div
                    className={cn(
                      "truncate text-[17px] leading-6",
                      s.status === "done" ? "text-neutral-400 line-through" : "text-neutral-900"
                    )}
                  >
                    {s.text}
                  </div>
                  <SubtaskResult s={s} />
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-4 pt-1">
                <div className="text-[12px] text-neutral-400 tabular-nums">{s.at}</div>
                <RowEnd status={s.status} />
              </div>
            </div>
          ))}
        </div>

        {/* comments (minimal, same language) */}
        <div className="mt-6 border-t border-neutral-100 pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-400">Comments</div>
            <div className="flex items-center gap-2 text-neutral-400">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {task.comments.length ? (
              task.comments.map((c) => (
                <div key={c.id} className="text-sm text-neutral-700">
                  <span className="font-medium text-neutral-900">
                    {c.author === "user" ? "You" : task.agent.name}
                  </span>{" "}
                  <span className="text-neutral-400 tabular-nums">• {c.at}</span>
                  <div className="mt-1 leading-6">{c.text}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-neutral-400">No comments yet.</div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              className="h-10 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-neutral-300"
            />
            <button
              onClick={() => {
                const text = comment.trim();
                if (!text) return;
                onComment(task.id, text);
                setComment("");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

/* ───────────────── Floating fixed composer (small width) ───────────────── */

function FixedMiniComposer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[520px]", // SMALLER WIDTH
          "rounded-[22px] border border-neutral-200 bg-white/95 backdrop-blur",
          "shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
        )}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ask Amie"
            className="h-9 flex-1 bg-transparent text-sm text-neutral-700 placeholder:text-neutral-300 outline-none"
          />

          <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100">
            <AtSign className="h-4 w-4 text-neutral-400" />
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100">
            <Paperclip className="h-4 w-4 text-neutral-400" />
          </button>

          <button
            onClick={onSend}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-500 hover:bg-sky-600"
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Right sidebar (keeps the ref layout) ───────────────── */

function RightSection({
  title,
  pill,
  people,
}: {
  title: string;
  pill: string;
  people: Agent[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-800">{title}</div>
        <Pill>{pill}</Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <Avatar key={p.id} p={p} size={26} />
        ))}
      </div>
    </div>
  );
}

/* ───────────────── Page ───────────────── */

export default function HomePage() {
  const [tasks, setTasks] = React.useState<TaskRun[]>(DEMO_TASKS);
  const [composer, setComposer] = React.useState("");

  const feed = React.useMemo(() => buildFeed(tasks), [tasks]);

  const pauseTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "in_progress"
          ? { ...t, status: "paused", updatedAt: "now" }
          : t
      )
    );
  };

  const redoTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: "in_progress", updatedAt: "now" } : t
      )
    );
  };

  const addComment = (taskId: string, text: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== taskId
          ? t
          : {
              ...t,
              updatedAt: "now",
              comments: [
                ...t.comments,
                {
                  id: `u-${Date.now()}`,
                  at: "now",
                  author: "user",
                  text,
                },
              ],
            }
      )
    );
  };

  const sendComposer = () => {
    const title = composer.trim();
    if (!title) return;

    const now = "now";
    const newTask: TaskRun = {
      id: `tr-${Date.now()}`,
      title,
      startedAt: now,
      updatedAt: now,
      status: "in_progress",
      agent: AGENTS[0]!,
      subtasks: [
        {
          id: "s1",
          text: "Queued task",
          status: "in_progress",
          at: now,
          result: { title: "Queued", body: "Agent will start shortly." },
        },
      ],
      comments: [],
    };

    setTasks((prev) => [newTask, ...prev]);
    setComposer("");
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-[1400px] gap-6 px-6 py-6">
        {/* Main column */}
        <main className="flex-1 min-w-0">
          {/* Top nav (matches reference) */}
          <div className="flex items-center gap-6 px-2">
            <button className="flex items-center gap-2 border-b-2 border-neutral-900 pb-3 text-sm font-semibold text-neutral-900">
              <Home className="h-4 w-4" />
              Home
            </button>
            <button className="flex items-center gap-2 pb-3 text-sm font-semibold text-neutral-300 hover:text-neutral-500">
              <Users className="h-4 w-4" />
              People
            </button>
          </div>

          {/* top "What's new today?" bar (reference) */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-neutral-200">
                <Bot className="h-4 w-4 text-neutral-600" />
              </div>
              <input
                placeholder="What’s new today?"
                className="h-10 flex-1 bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 outline-none"
              />
              <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-neutral-50">
                <ImageIcon className="h-5 w-5 text-neutral-400" />
              </button>
              <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-neutral-50">
                <PieChart className="h-5 w-5 text-neutral-400" />
              </button>
            </div>
          </div>

          {/* Timeline feed: ONLY agent tasks/subtasks + comments (per your request) */}
          <div className="mt-6 space-y-6 px-2">
            {feed.map((e) => {
              if (e.kind === "task_run") {
                return (
                  <TimelineItem key={e.id} dotTone="pink">
                    <TaskRunCard task={e.task} onPause={pauseTask} onRedo={redoTask} onComment={addComment} />
                  </TimelineItem>
                );
              }

              return (
                <TimelineItem key={e.id} dotTone="neutral">
                  <div className="flex items-start gap-3">
                    <Avatar p={e.author} size={26} />
                    <div className="max-w-[520px] rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-800 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                      <div className="font-medium text-neutral-900">{e.author.name}</div>
                      <div className="mt-1">{e.text}</div>
                    </div>
                  </div>
                </TimelineItem>
              );
            })}
          </div>

          {/* Spacer so last items aren't hidden behind fixed composer */}
          <div className="h-36" />
        </main>

        {/* Right sidebar (keeps the page feeling like the reference) */}
        <aside className="hidden w-[320px] shrink-0 lg:block">
          <div className="sticky top-6 space-y-6">
            <RightSection title="Agents online" pill="LIVE" people={AGENTS} />
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-800">In process</div>
                <Pill>NOW</Pill>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <Clock3 className="h-4 w-4 text-neutral-400" />
                  <span className="font-medium">
                    {tasks.filter((t) => t.status === "in_progress").length}
                  </span>
                  <span className="text-neutral-500">tasks running</span>
                </div>
                <div className="mt-3 space-y-2">
                  {tasks
                    .filter((t) => t.status === "in_progress")
                    .slice(0, 3)
                    .map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3">
                        <div className="truncate text-sm text-neutral-700">{t.title}</div>
                        <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* FIXED bottom-center composer (small width, never scrolls away) */}
      <FixedMiniComposer value={composer} onChange={setComposer} onSend={sendComposer} />
    </div>
  );
}