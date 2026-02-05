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
type TodoStatus = "not_started" | "in_progress" | "done";

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

/* ───────────────── Demo tasks (replace later) ───────────────── */

const TASKS: Task[] = [
  {
    id: "task-tenant-accounting",
    title: "Prepare tenant accounting + update owner balances — Holsteinische 18",
    status: "in_progress",
    pinned: true,
    recurring: false,
    dueLabel: "Due Feb 11",
    icon: <Receipt className="h-4 w-4 text-neutral-400" />,
    todos: [
      { id: "t1", text: "Import rent roll + bank export", status: "done", triggerLabel: "Feb 10, 14:05" },
      { id: "t2", text: "Reconcile payments vs bank export", status: "in_progress", triggerLabel: "Feb 10, 14:40" },
      { id: "t3", text: "Create missing data tracker sheet", status: "done", triggerLabel: "Feb 10, 15:10" },
      { id: "t4", text: "Draft tenant follow-up email template", status: "done", triggerLabel: "Feb 10, 15:25" },
      { id: "t5", text: "Send emails to tenants missing documents", status: "not_started", triggerLabel: "Feb 10, 16:45" },
      { id: "t6", text: "Update owner balances document", status: "not_started", triggerLabel: "Feb 11, 10:00" },
    ],
  },
  {
    id: "task-tenant-missing-docs",
    title: "Collect missing tenant documents — March close",
    status: "open",
    pinned: false,
    recurring: true,
    dueLabel: "Due Feb 14",
    icon: <Inbox className="h-4 w-4 text-neutral-400" />,
    todos: [
      { id: "m1", text: "Check which tenants are missing ID / SEPA / handover protocol", status: "done", triggerLabel: "Feb 10, 12:30" },
      { id: "m2", text: "Prepare follow-up list (phone + email)", status: "not_started", triggerLabel: "Feb 11, 09:30" },
      { id: "m3", text: "Send reminders + log responses", status: "not_started", triggerLabel: "Feb 11, 11:00" },
    ],
  },
  {
    id: "task-balance-table-update",
    title: "Update tenant balance table (existing) — normalize + mark missing",
    status: "review",
    pinned: false,
    recurring: false,
    dueLabel: "Due Feb 12",
    icon: <FileSpreadsheet className="h-4 w-4 text-neutral-400" />,
    todos: [
      { id: "b1", text: "Normalize columns (rent, utilities, deposits, arrears)", status: "done", triggerLabel: "Feb 09, 17:10" },
      { id: "b2", text: "Mark missing values + add notes column", status: "done", triggerLabel: "Feb 09, 17:45" },
      { id: "b3", text: "Cross-check totals vs bank export", status: "in_progress", triggerLabel: "Feb 10, 10:15" },
      { id: "b4", text: "Format + freeze header + export PDF for owner", status: "not_started", triggerLabel: "Feb 10, 18:00" },
    ],
  },
];

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
        status === "not_started"
          ? "border-neutral-300"
          : status === "in_progress"
          ? "border-sky-500"
          : "border-emerald-500"
      )}
    >
      <span
        className={cn(
          "grid h-full w-full place-items-center rounded-[4px]",
          status === "not_started" && "bg-transparent",
          status === "in_progress" && "bg-sky-500",
          status === "done" && "bg-emerald-500"
        )}
      />
    </span>
  );
}

function RowEnd({ status }: { status: TodoStatus }) {
  if (status === "in_progress") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />;
  }
  if (status === "done") {
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
          const status: TodoStatus = t.status ?? "not_started";

          return (
            <div key={t.id} className="flex items-center justify-between gap-10">
              <div className="flex min-w-0 items-center gap-3">
                <TodoMark status={status} />

                <div className="min-w-0">
               

                  <div
                    className={cn(
                      "truncate text-[17px] leading-6",
                      status === "done"
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
        .filter((x) => (x.status ?? "not_started") === "in_progress")
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
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[1100px] px-10 pt-8 pb-16">
        {/* tighter like reference */}
        <div className="space-y-10">
          <InProcessSection tasks={TASKS} />

          {TASKS.map((t) => (
            <TaskSection key={t.id} task={t} />
          ))}
        </div>
      </div>
    </div>
  );
}