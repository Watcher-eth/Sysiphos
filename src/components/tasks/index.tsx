"use client";

import * as React from "react";
import {
  ChevronRight,
  Loader2,
  Plus as PlusIcon,
  MoreHorizontal,
  Bell,
  RotateCcw,
  Clock3,
  Inbox,
  Building2,
  FileSpreadsheet,
  Receipt,
} from "lucide-react";

/* ───────────────── Types ───────────────── */

type TaskStatus = "open" | "in_progress" | "review" | "success" | "error";
type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItem = {
  id: string;
  text: string;
  status?: TodoStatus;
  triggerLabel?: string; // "Feb 10, 16:45"
};

type Task = {
  id: string;
  title: string;
  status?: TaskStatus;
  pinned?: boolean;
  recurring?: boolean;
  dueLabel?: string;
  icon?: React.ReactNode;
  todos: TodoItem[];
};

/* ───────────────── Data ───────────────── */

/* ───────────────── tiny utils ───────────────── */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ───────────────── Marks + row end indicators (reused) ───────────────── */

function TodoMark({ status }: { status: TodoStatus }) {
  return (
    <span
      className={cn(
        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] border bg-white p-[1.5px]",
        status === "pending"
          ? "border-neutral-300"
          : status === "in_progress"
          ? "border-sky-500"
          : "border-emerald-500"
      )}
    >
      <span
        className={cn(
          "grid h-full w-full place-items-center rounded-[4px]",
          status === "pending" && "bg-transparent",
          status === "in_progress" && "bg-sky-500",
          status === "completed" && "bg-emerald-500"
        )}
      />
    </span>
  );
}

function RowEnd({ status }: { status: TodoStatus }) {
  if (status === "in_progress") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />;
  }
  if (status === "completed") {
    return <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />;
  }
  return <span className="h-4 w-4 shrink-0" />;
}

/* ───────────────── Section header (match reference) ───────────────── */

function SectionHeader({
  title,
  leftIcon,
  rightMeta,
}: {
  title: string;
  leftIcon?: React.ReactNode;
  rightMeta?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex min-w-0 items-center gap-1.5">
        {leftIcon ? <div className="grid h-6 w-6 place-items-center">{leftIcon}</div> : null}

        {/* bigger, not bold, dark gray like reference */}
        <div className="min-w-0 truncate text-[15px] font-normal text-neutral-700">
          {title}
        </div>
      </div>

      <div className="flex items-center gap-1 text-neutral-400">
        {rightMeta}
        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100">
          <PlusIcon className="h-4 w-4" />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TaskMetaIcons({
  pinned,
  recurring,
  dueLabel,
}: {
  pinned?: boolean;
  recurring?: boolean;
  dueLabel?: string;
}) {
  return (
    <div className="mr-1 hidden items-center gap-2 text-[12px] text-neutral-400 md:flex">
      {pinned ? <Bell className="h-4 w-4" /> : null}
      {dueLabel ? <span className="tabular-nums">{dueLabel}</span> : null}
      {recurring ? <RotateCcw className="h-4 w-4" /> : null}
    </div>
  );
}

/* ───────────────── Todos list ───────────────── */

function TodosList({
  items,
  showTrigger = true,
}: {
  items: Array<TodoItem & { taskId?: string; taskTitle?: string }>;
  showTrigger?: boolean;
}) {
  return (
    <div className="py-2">
      <div className="space-y-5">
        {items.map((t) => {
          const status: TodoStatus = t.status ?? "pending";

          return (
            <div key={t.id} className="flex items-center justify-between gap-10">
              <div className="flex min-w-0 items-center gap-3">
                <TodoMark status={status} />

                <div className="min-w-0">
               

                  <div
                    className={cn(
                      "truncate text-[17px] leading-6",
                      status === "completed"
                        ? "text-neutral-400 line-through"
                        : "text-neutral-900"
                    )}
                  >
                    {t.text}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                {showTrigger && t.triggerLabel ? (
                  <div className="text-[12px] text-neutral-400 tabular-nums">
                    {t.triggerLabel}
                  </div>
                ) : null}
                <RowEnd status={status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────── In Process section (only non-task section) ───────────────── */

function InProcessSection({ tasks }: { tasks: Task[] }) {
  const inProcess = tasks
    .flatMap((task) =>
      (task.todos ?? [])
      .filter((x) => (x.status ?? "pending") === "in_progress")
        .map((x) => ({
          ...x,
          taskId: task.id,
          taskTitle: task.title,
        }))
    )
    .sort((a, b) => (a.triggerLabel ?? "").localeCompare(b.triggerLabel ?? ""));

  if (!inProcess.length) return null;

  return (
    <div>
      <SectionHeader
        title="In Process"
        leftIcon={<Clock3 className="h-4 w-4 text-neutral-400" />}
      />
      <div className="border-t border-neutral-100">
        <div className="py-4">
          <TodosList items={inProcess} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Each task becomes its own section ───────────────── */

function TaskSection({ task }: { task: Task }) {
  return (
    <div>
      <SectionHeader
        title={task.title}
        leftIcon={task.icon ?? <Building2 className="h-4 w-4 text-neutral-400" />}
        rightMeta={
          <TaskMetaIcons
            pinned={task.pinned}
            recurring={task.recurring}
            dueLabel={task.dueLabel}
          />
        }
      />
      <div className="border-t border-neutral-100">
        <div className="py-4">
          <TodosList items={task.todos} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Page ───────────────── */

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const rows = Array.isArray(data?.tasks) ? data.tasks : [];
        const mapped: Task[] = rows.map((t: any) => ({
          id: String(t.id),
          title: String(t.title ?? "Untitled task"),
          status: "open",
          pinned: false,
          recurring: false,
          todos: [],
        }));
        if (!cancelled) setTasks(mapped);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message ?? "Failed to load tasks"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[1100px] px-10 pt-8 pb-16">
        {/* tighter like reference */}
        <div className="space-y-10">
          {loading ? (
            <div className="text-sm text-neutral-400">Loading tasks…</div>
          ) : error ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : tasks.length ? (
            <>
              <InProcessSection tasks={tasks} />
              {tasks.map((t) => (
                <TaskSection key={t.id} task={t} />
              ))}
            </>
          ) : (
            <div className="text-sm text-neutral-400">No tasks yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}