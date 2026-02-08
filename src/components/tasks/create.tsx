"use client";

import * as React from "react";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  Folder,
  Globe,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

/* ───────────────── Types ───────────────── */

type DeliverableType = "file" | "doc" | "edit";
type LocationType = "file" | "folder" | "path" | "multi";

type ProcessItem = { id: string; text: string };
type TodoItem = { id: string; text: string; details?: string; showDetails?: boolean };

type Deliverable = {
  id: string;
  type: DeliverableType;
  label: string;
  notes?: string;
};

type Location = {
  id: string;
  type: LocationType;
  label: string;
  value: string;
};

type Integration = {
  id: string;
  name: string;
  category: "Docs" | "Email" | "PM" | "Design" | "Storage" | "Finance" | "Other";
  connected: boolean;
  icon?: React.ReactNode;
};

type Schedule =
  | { kind: "one_time"; dateISO: string; time: string } // dateISO: YYYY-MM-DD
  | {
      kind: "recurring";
      cadence: "daily" | "weekly" | "monthly";
      atTime: string;
      weekday?: string;
      monthday?: string;
      startDateISO?: string;
    };

type DraftTask = {
  title: string;
  description: string;

  // Deliverables step revamped
  deliverables: Deliverable[]; // still useful as output definition
  process: ProcessItem[]; // optional
  todos: TodoItem[]; // optional

  locations: Location[];
  integrations: string[];
  schedule: Schedule;
};

type StepId = "basics" | "deliverables" | "locations" | "integrations" | "schedule" | "review";

/* ───────────────── Demo data ───────────────── */

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "basics", label: "Details" },
  { id: "deliverables", label: "Outputs" },
  { id: "locations", label: "Location" },
  { id: "integrations", label: "Tools" },
  { id: "schedule", label: "Schedule" },
  { id: "review", label: "Review" },
];

const INTEGRATIONS: Integration[] = [
  { id: "word", name: "Microsoft Word", category: "Docs", connected: true, icon: <FileText className="h-5 w-5 text-neutral-400" /> },
  { id: "excel", name: "Microsoft Excel", category: "Docs", connected: true, icon: <FileText className="h-5 w-5 text-neutral-400" /> },
  { id: "email", name: "Email", category: "Email", connected: true, icon: <Mail className="h-5 w-5 text-neutral-400" /> },
  { id: "pdf", name: "PDF", category: "Docs", connected: true, icon: <File className="h-5 w-5 text-neutral-400" /> },
  { id: "linear", name: "Linear", category: "PM", connected: false, icon: <Link2 className="h-5 w-5 text-neutral-400" /> },
  { id: "dropbox", name: "Dropbox", category: "Storage", connected: false, icon: <Folder className="h-5 w-5 text-neutral-400" /> },
  { id: "figma", name: "Figma", category: "Design", connected: false, icon: <Link2 className="h-5 w-5 text-neutral-400" /> },
  { id: "notion", name: "Notion", category: "Docs", connected: false, icon: <FileText className="h-5 w-5 text-neutral-400" /> },
  { id: "quickbooks", name: "Intuit QuickBooks", category: "Finance", connected: false, icon: <Link2 className="h-5 w-5 text-neutral-400" /> },
  { id: "other", name: "Other tool", category: "Other", connected: false, icon: <Globe className="h-5 w-5 text-neutral-400" /> },
];

/* ───────────────── tiny utils ───────────────── */

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/* ───────────────── atoms: inputs, buttons, chips, checkbox ───────────────── */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[880px] rounded-[28px] bg-white">
      {children}
    </div>
  );
}

function SoftInput({
  label,
  hintRight,
  children,
}: {
  label: string;
  hintRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-neutral-500">{label}</div>
        {hintRight ? (
          <div className="text-[13px] text-neutral-400 tabular-nums">{hintRight}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-[22px] border border-neutral-200 bg-white px-4 text-[15px] text-neutral-900",
        "placeholder:text-neutral-300 outline-none",
        "focus:border-neutral-300"
      )}
    />
  );
}

function TextAreaField(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[128px] w-full resize-none rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-[15px] text-neutral-900",
        "placeholder:text-neutral-300 outline-none",
        "focus:border-neutral-300"
      )}
    />
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition",
        active
          ? "border-neutral-300 bg-neutral-50 text-neutral-900"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}

function TinyBtn({
  icon,
  label,
  onClick,
  tone = "neutral",
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4.5 py-2.5 text-[13px] font-medium transition",
        "disabled:opacity-50 disabled:pointer-events-none",
        tone === "neutral" &&
          "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
        tone === "primary" &&
          "bg-neutral-900 text-white hover:bg-neutral-800 shadow-[0_10px_20px_rgba(0,0,0,0.12)]",
        tone === "danger" &&
          "border border-neutral-200 bg-white text-neutral-700 hover:bg-red-50 hover:text-red-600"
      )}
    >
      {icon ? <span className="grid h-5 w-5 place-items-center">{icon}</span> : null}
      {label}
    </button>
  );
}

/** “Existing custom checkbox” style (square + inset) */
function UiCheckbox({
  checked,
  onChange,
  size = 20,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className={cn(
        "grid place-items-center rounded-[7px] border bg-white p-[1.5px] transition",
        checked ? "border-neutral-400" : "border-neutral-200 hover:border-neutral-300"
      )}
      style={{ width: size, height: size }}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "grid h-full w-full place-items-center rounded-[5px] transition",
          checked ? "bg-neutral-900" : "bg-transparent"
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5 text-white" /> : null}
      </span>
    </button>
  );
}

/* ───────────────── layout + motion ───────────────── */

function StepRail({ step }: { step: StepId }) {
  const idx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex items-center justify-between gap-6 px-10 pt-9">
      <div className="flex items-center gap-3 text-[13px] text-neutral-500">
        <span className="text-neutral-400">Create task</span>
        <span className="h-1 w-1 rounded-full bg-neutral-300" />
        <span className="text-neutral-900 font-medium">{STEPS[idx]?.label}</span>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "h-1.5 w-10 rounded-full transition",
              i <= idx ? "bg-neutral-900" : "bg-neutral-200"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1100px] items-center justify-center px-8 py-14">
        {children}
      </div>
    </div>
  );
}

function Slide({
  children,
  stepKey,
  direction,
}: {
  children: React.ReactNode;
  stepKey: string;
  direction: 1 | -1;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, y: 6 * direction, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -6 * direction, filter: "blur(2px)" }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function Divider() {
  return <div className="h-px w-full bg-neutral-100" />;
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-10 py-5">
      <div className="text-[13px] font-medium text-neutral-500">{label}</div>
      <div className="min-w-0 text-right text-[14px] text-neutral-900">{value}</div>
    </div>
  );
}

/* ───────────────── Calendar (simple, “reference-like”) ───────────────── */

type CalValue = { dateISO: string }; // YYYY-MM-DD

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function MiniCalendar({
  value,
  onChange,
}: {
  value?: CalValue;
  onChange?: (v: CalValue) => void;
}) {
  const initial = React.useMemo(() => {
    if (value?.dateISO) {
      const [y, m] = value.dateISO.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [value?.dateISO]);

  const [view, setView] = React.useState<Date>(initial);

  React.useEffect(() => {
    setView(initial);
  }, [initial]);

  const first = startOfMonth(view);
  const offset = (first.getDay() + 6) % 7; // monday=0
  const count = daysInMonth(view);

  const cells: Array<{ day?: number; iso?: string; muted?: boolean }> = [];

  for (let i = 0; i < offset; i++) cells.push({ muted: true });
  for (let day = 1; day <= count; day++) {
    const d = new Date(view.getFullYear(), view.getMonth(), day);
    cells.push({ day, iso: toISODate(d) });
  }
  while (cells.length % 7 !== 0) cells.push({ muted: true });

  const selectedISO = value?.dateISO;

  const monthLabel = view.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-[26px] border border-neutral-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-medium text-neutral-900">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView((v) => addMonths(v, -1))}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-50"
          >
            <ChevronLeft className="h-4 w-4 text-neutral-500" />
          </button>
          <button
            type="button"
            onClick={() => setView((v) => addMonths(v, 1))}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-50"
          >
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2 text-[12px] text-neutral-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {cells.map((c, i) => {
          const isSel = !!c.iso && c.iso === selectedISO;
          return (
            <button
              key={i}
              type="button"
              disabled={!c.iso}
              onClick={() => c.iso && onChange?.({ dateISO: c.iso })}
              className={cn(
                "h-10 rounded-[16px] text-[13px] font-medium transition",
                !c.iso && "pointer-events-none bg-transparent",
                c.iso && !isSel && "bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
                isSel && "bg-neutral-900 text-white"
              )}
            >
              {c.day ?? ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────── Main wizard ───────────────── */

export default function CreateTaskWizardPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<StepId>("basics");
  const [dir, setDir] = React.useState<1 | -1>(1);

  const [draft, setDraft] = React.useState<DraftTask>(() => ({
    title: "",
    description: "",

    deliverables: [{ id: uid("del"), type: "doc", label: "Owner-ready summary", notes: "" }],
    process: [],
    todos: [],

    locations: [{ id: uid("loc"), type: "folder", label: "Project folder", value: "~/Desktop/Client/Feb" }],
    integrations: ["email", "pdf"],
    schedule: { kind: "one_time", dateISO: "", time: "09:30" },
  }));

  const [toolQuery, setToolQuery] = React.useState("");

  const idx = STEPS.findIndex((s) => s.id === step);
  const canBack = idx > 0;
  const canNext = idx < STEPS.length - 1;

  const go = (next: StepId) => {
    const nextIdx = STEPS.findIndex((s) => s.id === next);
    setDir(nextIdx > idx ? 1 : -1);
    setStep(next);
  };

  const back = () => canBack && go(STEPS[idx - 1]!.id);
  const next = () => canNext && go(STEPS[idx + 1]!.id);

  const errors = validateStep(step, draft);

  const filteredTools = React.useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    const list = !q
      ? INTEGRATIONS
      : INTEGRATIONS.filter(
          (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
        );
    return list.slice().sort((a, b) => Number(b.connected) - Number(a.connected));
  }, [toolQuery]);

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const deliverablesSpec = draft.deliverables.map((d) => ({
        id: d.id,
        type: d.type,
        label: d.label,
        notes: d.notes ?? "",
      }));

      const contextSpec = [
        { type: "process", items: draft.process },
        { type: "todos", items: draft.todos },
        { type: "integrations", items: draft.integrations },
      ];

      const mountsSpec = draft.locations.map((l) => ({
        id: l.id,
        type: l.type,
        label: l.label,
        value: l.value,
      }));

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          deliverablesSpec,
          contextSpec,
          mountsSpec,
          executionSpec: {},
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      router.push("/tasks");
    } catch (err: any) {
      setSubmitError(String(err?.message ?? "Failed to submit task"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrap>
      <div className="w-full">
        <div className="mx-auto max-w-[880px]">
          <Slide stepKey={step} direction={dir}>
            <CardShell>
              <StepRail step={step} />

              <div className="px-10 pb-10 pt-8">
                {step === "basics" ? (
                  <BasicsStep draft={draft} setDraft={setDraft} />
                ) : step === "deliverables" ? (
                  <OutputsStep draft={draft} setDraft={setDraft} />
                ) : step === "locations" ? (
                  <LocationsStep draft={draft} setDraft={setDraft} />
                ) : step === "integrations" ? (
                  <IntegrationsStep
                    draft={draft}
                    setDraft={setDraft}
                    toolQuery={toolQuery}
                    setToolQuery={setToolQuery}
                    tools={filteredTools}
                  />
                ) : step === "schedule" ? (
                  <ScheduleStep draft={draft} setDraft={setDraft} />
                ) : (
                  <ReviewStep draft={draft} tools={INTEGRATIONS} />
                )}

                <div className="mt-10 flex items-center justify-between">
                  <div className="text-[13px] text-neutral-400">
                    {errors.length ? (
                      <span className="text-red-500">{errors[0]}</span>
                    ) : submitError ? (
                      <span className="text-red-500">{submitError}</span>
                    ) : (
                      <span> </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <TinyBtn
                      label="Back"
                      icon={<ArrowLeft className="h-4 w-4" />}
                      onClick={back}
                      disabled={!canBack}
                    />
                    {step !== "review" ? (
                      <TinyBtn
                        tone="primary"
                        label="Continue"
                        icon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => {
                          const errs = validateStep(step, draft);
                          if (errs.length) return;
                          next();
                        }}
                      />
                    ) : (
                      <TinyBtn
                        tone="primary"
                        label="Submit task"
                        icon={<Check className="h-4 w-4" />}
                        onClick={submit}
                        disabled={submitting}
                      />
                    )}
                  </div>
                </div>
              </div>
            </CardShell>
          </Slide>
        </div>
      </div>
    </PageWrap>
  );
}

/* ───────────────── Validation ───────────────── */

function validateStep(step: StepId, d: DraftTask): string[] {
  const errs: string[] = [];
  if (step === "basics") {
    if (!d.title.trim()) errs.push("Add a title.");
    if (!d.description.trim()) errs.push("Add a short description.");
  }
  if (step === "deliverables") {
    if (!d.deliverables.length) errs.push("Add at least one deliverable.");
    if (d.deliverables.some((x) => !x.label.trim())) errs.push("Deliverables need a name.");
    // process/todos are optional
  }
  if (step === "locations") {
    if (!d.locations.length) errs.push("Add at least one location or path.");
    if (d.locations.some((x) => !x.value.trim())) errs.push("Locations need a path or identifier.");
  }
  if (step === "schedule") {
    if (d.schedule.kind === "one_time") {
      if (!d.schedule.dateISO) errs.push("Pick a date.");
      if (!d.schedule.time) errs.push("Pick a time.");
    } else {
      if (!d.schedule.atTime) errs.push("Pick a time.");
      if (d.schedule.cadence === "weekly" && !d.schedule.weekday) errs.push("Pick a weekday.");
      if (d.schedule.cadence === "monthly" && !d.schedule.monthday) errs.push("Pick a day of month.");
    }
  }
  return errs;
}

/* ───────────────── Steps ───────────────── */

function BasicsStep({
  draft,
  setDraft,
}: {
  draft: DraftTask;
  setDraft: React.Dispatch<React.SetStateAction<DraftTask>>;
}) {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Task details</div>
        <div className="mt-1 text-[13px] text-neutral-500">
          Give the agent a clear goal and success criteria.
        </div>
      </div>

      <SoftInput label="Title">
        <TextField
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="e.g. Prepare tenant accounting for Holsteinische 18"
        />
      </SoftInput>

      <SoftInput label="Description" hintRight={`${draft.description.length}/500`}>
        <TextAreaField
          value={draft.description}
          maxLength={500}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="What should the agent do? Include constraints, tone, formats, and what “done” looks like."
        />
      </SoftInput>

      <div className="pt-1 text-[13px] text-neutral-400">
        Tip: “Reconcile bank export, produce owner-ready PDF summary, flag missing documents.”
      </div>
    </div>
  );
}

/** Step 2 revamped: Deliverables + optional Process + optional Todos (list style, no nested bordered cards) */
function OutputsStep({
  draft,
  setDraft,
}: {
  draft: DraftTask;
  setDraft: React.Dispatch<React.SetStateAction<DraftTask>>;
}) {
  const addDeliverable = () =>
    setDraft((d) => ({
      ...d,
      deliverables: [...d.deliverables, { id: uid("del"), type: "file", label: "", notes: "" }],
    }));

  const updateDeliverable = (id: string, patch: Partial<Deliverable>) =>
    setDraft((d) => ({
      ...d,
      deliverables: d.deliverables.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const removeDeliverable = (id: string) =>
    setDraft((d) => ({ ...d, deliverables: d.deliverables.filter((x) => x.id !== id) }));

  const addProcess = () =>
    setDraft((d) => ({ ...d, process: [...d.process, { id: uid("proc"), text: "" }] }));

  const updateProcess = (id: string, text: string) =>
    setDraft((d) => ({ ...d, process: d.process.map((p) => (p.id === id ? { ...p, text } : p)) }));

  const removeProcess = (id: string) =>
    setDraft((d) => ({ ...d, process: d.process.filter((p) => p.id !== id) }));

  const addTodo = () =>
    setDraft((d) => ({ ...d, todos: [...d.todos, { id: uid("todo"), text: "", details: "", showDetails: false }] }));

  const updateTodo = (id: string, patch: Partial<TodoItem>) =>
    setDraft((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  const removeTodo = (id: string) =>
    setDraft((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Outputs</div>
        <div className="mt-1 text-[13px] text-neutral-500">
          Define what should come out, and optionally provide a process + todos.
        </div>
      </div>

      {/* Deliverables (list style) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium text-neutral-900">Deliverables</div>
            <div className="mt-0.5 text-[13px] text-neutral-500">Files, docs, or edits to produce.</div>
          </div>
          <TinyBtn label="Add" icon={<Plus className="h-4 w-4" />} onClick={addDeliverable} />
        </div>

        <div className="space-y-5">
          {draft.deliverables.map((d) => (
            <div key={d.id} className="rounded-[26px] bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip active={d.type === "file"} onClick={() => updateDeliverable(d.id, { type: "file" })}>
                    <File className="h-4 w-4 text-neutral-400" />
                    File
                  </Chip>
                  <Chip active={d.type === "doc"} onClick={() => updateDeliverable(d.id, { type: "doc" })}>
                    <FileText className="h-4 w-4 text-neutral-400" />
                    Document
                  </Chip>
                  <Chip active={d.type === "edit"} onClick={() => updateDeliverable(d.id, { type: "edit" })}>
                    <RefreshCw className="h-4 w-4 text-neutral-400" />
                    Edit
                  </Chip>
                </div>

                <button
                  type="button"
                  onClick={() => removeDeliverable(d.id)}
                  className="grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <TextField
                  value={d.label}
                  onChange={(e) => updateDeliverable(d.id, { label: e.target.value })}
                  placeholder="Deliverable name (e.g. Owner summary PDF)"
                />
                <TextField
                  value={d.notes ?? ""}
                  onChange={(e) => updateDeliverable(d.id, { notes: e.target.value })}
                  placeholder="Optional notes (format, audience, required fields)"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* Process (optional) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium text-neutral-900">Process (optional)</div>
            <div className="mt-0.5 text-[13px] text-neutral-500">A suggested sequence of steps.</div>
          </div>
          <TinyBtn label="Add" icon={<Plus className="h-4 w-4" />} onClick={addProcess} />
        </div>

        <div className="space-y-4">
          {draft.process.length === 0 ? (
            <div className="text-[13px] text-neutral-400">Leave empty if you don’t care how it gets done.</div>
          ) : null}

          {draft.process.map((p, idx) => (
            <div key={p.id} className="flex items-start gap-3">
              <div className="mt-2 h-2.5 w-2.5 rounded-full bg-neutral-300" />
              <div className="flex-1">
                <TextField
                  value={p.text}
                  onChange={(e) => updateProcess(p.id, e.target.value)}
                  placeholder={`Step ${idx + 1} (e.g. Import rent roll + bank export)`}
                />
              </div>
              <button
                type="button"
                onClick={() => removeProcess(p.id)}
                className="grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* Todos (optional) with optional subdescription toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium text-neutral-900">Todos (optional)</div>
            <div className="mt-0.5 text-[13px] text-neutral-500">Small checkpoints. Each can have details.</div>
          </div>
          <TinyBtn label="Add" icon={<Plus className="h-4 w-4" />} onClick={addTodo} />
        </div>

        <div className="space-y-5">
          {draft.todos.length === 0 ? (
            <div className="text-[13px] text-neutral-400">Optional — you can keep it blank.</div>
          ) : null}

          {draft.todos.map((t) => (
            <div key={t.id} className="rounded-[26px] bg-white">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <UiCheckbox checked={true} onChange={() => {}} size={20} />
                  <div className="min-w-0 flex-1">
                    <TextField
                      value={t.text}
                      onChange={(e) => updateTodo(t.id, { text: e.target.value })}
                      placeholder="Todo title (e.g. Reconcile payments vs bank export)"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateTodo(t.id, { showDetails: !t.showDetails })}
                    className="grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
                    title="Add details"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTodo(t.id)}
                    className="grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {t.showDetails ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 40 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3">
                      <TextField
                        value={t.details ?? ""}
                        onChange={(e) => updateTodo(t.id, { details: e.target.value })}
                        placeholder="Optional details (constraints, edge cases, acceptance criteria)"
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LocationsStep({
  draft,
  setDraft,
}: {
  draft: DraftTask;
  setDraft: React.Dispatch<React.SetStateAction<DraftTask>>;
}) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      locations: [...d.locations, { id: uid("loc"), type: "path", label: "Path", value: "" }],
    }));

  const update = (id: string, patch: Partial<Location>) =>
    setDraft((d) => ({
      ...d,
      locations: d.locations.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const remove = (id: string) => setDraft((d) => ({ ...d, locations: d.locations.filter((x) => x.id !== id) }));

  const typeIcon = (t: LocationType) =>
    t === "file" ? <File className="h-4 w-4 text-neutral-400" /> : <Folder className="h-4 w-4 text-neutral-400" />;

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Location / file environment</div>
        <div className="mt-1 text-[13px] text-neutral-500">
          Where should the agent look? Add files, folders, or paths.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[13px] text-neutral-400">Add one or multiple references.</div>
        <TinyBtn label="Add" icon={<Plus className="h-4 w-4" />} onClick={add} />
      </div>

      <div className="space-y-6">
        {draft.locations.map((l) => (
          <div key={l.id} className="rounded-[26px] bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip active={l.type === "file"} onClick={() => update(l.id, { type: "file", label: "File" })}>
                  {typeIcon("file")}
                  File
                </Chip>
                <Chip active={l.type === "folder"} onClick={() => update(l.id, { type: "folder", label: "Folder" })}>
                  {typeIcon("folder")}
                  Folder
                </Chip>
                <Chip active={l.type === "path"} onClick={() => update(l.id, { type: "path", label: "Path" })}>
                  <Link2 className="h-4 w-4 text-neutral-400" />
                  Path
                </Chip>
                <Chip active={l.type === "multi"} onClick={() => update(l.id, { type: "multi", label: "Multiple" })}>
                  <CalendarIcon className="h-4 w-4 text-neutral-400" />
                  Multiple
                </Chip>
              </div>

              <button
                type="button"
                onClick={() => remove(l.id)}
                className="grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <TextField
                value={l.value}
                onChange={(e) => update(l.id, { value: e.target.value })}
                placeholder={
                  l.type === "folder"
                    ? "Folder path (e.g. ~/Desktop/Client/Feb)"
                    : l.type === "file"
                    ? "File path (e.g. ~/Desktop/notes.pdf)"
                    : "Path or reference (e.g. /Users/me/Desktop)"
                }
              />
              <TextField
                value={l.label}
                onChange={(e) => update(l.id, { label: e.target.value })}
                placeholder="Label (optional)"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-[13px] text-neutral-400">
        Desktop file-picking can be wired later; for now this collects paths/references.
      </div>
    </div>
  );
}

/** Tools step: 2-col grid, bigger tiles, super subtle borders, use UiCheckbox */
function IntegrationsStep({
  draft,
  setDraft,
  toolQuery,
  setToolQuery,
  tools,
}: {
  draft: DraftTask;
  setDraft: React.Dispatch<React.SetStateAction<DraftTask>>;
  toolQuery: string;
  setToolQuery: (v: string) => void;
  tools: Integration[];
}) {
  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      integrations: d.integrations.includes(id)
        ? d.integrations.filter((x) => x !== id)
        : [...d.integrations, id],
    }));

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Tools & integrations</div>
        <div className="mt-1 text-[13px] text-neutral-500">
          Choose what the agent can use. Connected tools appear first.
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
        <input
          value={toolQuery}
          onChange={(e) => setToolQuery(e.target.value)}
          placeholder="Search tools (Word, email, Dropbox, …)"
          className={cn(
            "h-12 w-full rounded-[22px] border border-neutral-200 bg-white pl-11 pr-4 text-[15px] text-neutral-900",
            "placeholder:text-neutral-300 outline-none focus:border-neutral-300"
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => {
          const on = draft.integrations.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={cn(
                "group w-full rounded-[26px] bg-white p-5 text-left transition",
                "border border-neutral-100 hover:border-neutral-200"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-white">
                    {t.icon ?? <Globe className="h-5 w-5 text-neutral-400" />}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-neutral-900">{t.name}</div>
                    <div className="mt-0.5 text-[13px] text-neutral-500">
                      {t.category} · {t.connected ? "Connected" : "Not connected"}
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <UiCheckbox checked={on} onChange={() => toggle(t.id)} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-[13px] text-neutral-400">
        You can leave this empty — the agent will still run, just with fewer capabilities.
      </div>
    </div>
  );
}

/** Schedule step: real calendar (for one-time) + time; recurring keeps cadence chips and optional start date calendar */
function ScheduleStep({
  draft,
  setDraft,
}: {
  draft: DraftTask;
  setDraft: React.Dispatch<React.SetStateAction<DraftTask>>;
}) {
  const schedule = draft.schedule;

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Schedule</div>
        <div className="mt-1 text-[13px] text-neutral-500">Run once or automatically on a cadence.</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          active={schedule.kind === "one_time"}
          onClick={() => setDraft((d) => ({ ...d, schedule: { kind: "one_time", dateISO: "", time: "09:30" } }))}
        >
          <CalendarIcon className="h-4 w-4 text-neutral-400" />
          One-time
        </Chip>
        <Chip
          active={schedule.kind === "recurring"}
          onClick={() =>
            setDraft((d) => ({
              ...d,
              schedule: { kind: "recurring", cadence: "weekly", atTime: "09:00", weekday: "mon", startDateISO: "" },
            }))
          }
        >
          <RefreshCw className="h-4 w-4 text-neutral-400" />
          Recurring
        </Chip>
      </div>

      {schedule.kind === "one_time" ? (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <MiniCalendar
            value={schedule.dateISO ? { dateISO: schedule.dateISO } : undefined}
            onChange={(v) => setDraft((d) => ({ ...d, schedule: { ...schedule, dateISO: v.dateISO } }))}
          />

          <div className="rounded-[26px] border border-neutral-100 bg-white p-5">
            <div className="text-[14px] font-medium text-neutral-900">Time</div>
            <div className="mt-1 text-[13px] text-neutral-500">Choose when to run.</div>

            <div className="mt-5 space-y-3">
              <SoftInput label="At">
                <input
                  type="time"
                  value={schedule.time}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, schedule: { ...schedule, time: e.target.value } }))
                  }
                  className={cn(
                    "h-12 w-full rounded-[22px] border border-neutral-200 bg-white px-4 text-[15px] text-neutral-900",
                    "outline-none focus:border-neutral-300"
                  )}
                />
              </SoftInput>

              <div className="text-[13px] text-neutral-400">
                Selected:{" "}
                <span className="text-neutral-700 tabular-nums">
                  {schedule.dateISO ? `${schedule.dateISO} · ${schedule.time}` : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Chip
              active={schedule.cadence === "daily"}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  schedule: { kind: "recurring", cadence: "daily", atTime: schedule.atTime || "09:00", startDateISO: schedule.startDateISO },
                }))
              }
            >
              Daily
            </Chip>
            <Chip
              active={schedule.cadence === "weekly"}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  schedule: { kind: "recurring", cadence: "weekly", atTime: schedule.atTime || "09:00", weekday: "mon", startDateISO: schedule.startDateISO },
                }))
              }
            >
              Weekly
            </Chip>
            <Chip
              active={schedule.cadence === "monthly"}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  schedule: { kind: "recurring", cadence: "monthly", atTime: schedule.atTime || "09:00", monthday: "1", startDateISO: schedule.startDateISO },
                }))
              }
            >
              Monthly
            </Chip>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <MiniCalendar
              value={schedule.startDateISO ? { dateISO: schedule.startDateISO } : undefined}
              onChange={(v) => setDraft((d) => ({ ...d, schedule: { ...schedule, startDateISO: v.dateISO } }))}
            />

            <div className="rounded-[26px] border border-neutral-100 bg-white p-5">
              <div className="text-[14px] font-medium text-neutral-900">Cadence</div>
              <div className="mt-1 text-[13px] text-neutral-500">Set time and any required options.</div>

              <div className="mt-5 grid gap-3">
                <SoftInput label="Time">
                  <input
                    type="time"
                    value={schedule.atTime}
                    onChange={(e) => setDraft((d) => ({ ...d, schedule: { ...schedule, atTime: e.target.value } }))}
                    className={cn(
                      "h-12 w-full rounded-[22px] border border-neutral-200 bg-white px-4 text-[15px] text-neutral-900",
                      "outline-none focus:border-neutral-300"
                    )}
                  />
                </SoftInput>

                {schedule.cadence === "weekly" ? (
                  <SoftInput label="Weekday">
                    <select
                      value={schedule.weekday ?? "mon"}
                      onChange={(e) => setDraft((d) => ({ ...d, schedule: { ...schedule, weekday: e.target.value } }))}
                      className={cn(
                        "h-12 w-full rounded-[22px] border border-neutral-200 bg-white px-4 text-[15px] text-neutral-900",
                        "outline-none focus:border-neutral-300"
                      )}
                    >
                      <option value="mon">Monday</option>
                      <option value="tue">Tuesday</option>
                      <option value="wed">Wednesday</option>
                      <option value="thu">Thursday</option>
                      <option value="fri">Friday</option>
                      <option value="sat">Saturday</option>
                      <option value="sun">Sunday</option>
                    </select>
                  </SoftInput>
                ) : schedule.cadence === "monthly" ? (
                  <SoftInput label="Day of month">
                    <select
                      value={schedule.monthday ?? "1"}
                      onChange={(e) => setDraft((d) => ({ ...d, schedule: { ...schedule, monthday: e.target.value } }))}
                      className={cn(
                        "h-12 w-full rounded-[22px] border border-neutral-200 bg-white px-4 text-[15px] text-neutral-900",
                        "outline-none focus:border-neutral-300"
                      )}
                    >
                      {Array.from({ length: 28 }).map((_, i) => (
                        <option key={i + 1} value={`${i + 1}`}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </SoftInput>
                ) : null}

                <div className="pt-1 text-[13px] text-neutral-400">
                  Start date:{" "}
                  <span className="text-neutral-700 tabular-nums">
                    {schedule.startDateISO ? schedule.startDateISO : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[13px] text-neutral-400">We’ll run it automatically at the selected cadence.</div>
        </div>
      )}
    </div>
  );
}

function ReviewStep({ draft, tools }: { draft: DraftTask; tools: Integration[] }) {
  const toolNames = draft.integrations
    .map((id) => tools.find((t) => t.id === id)?.name)
    .filter(Boolean) as string[];

  const scheduleLabel =
    draft.schedule.kind === "one_time"
      ? draft.schedule.dateISO
        ? `One-time · ${draft.schedule.dateISO} ${draft.schedule.time}`
        : "One-time"
      : draft.schedule.cadence === "daily"
      ? `Recurring · Daily at ${draft.schedule.atTime}`
      : draft.schedule.cadence === "weekly"
      ? `Recurring · Weekly (${draft.schedule.weekday?.toUpperCase()}) at ${draft.schedule.atTime}`
      : `Recurring · Monthly (day ${draft.schedule.monthday}) at ${draft.schedule.atTime}`;

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[18px] font-medium text-neutral-900">Review</div>
        <div className="mt-1 text-[13px] text-neutral-500">Confirm everything looks right.</div>
      </div>

      <div className="rounded-[26px] border border-neutral-100 bg-white px-7">
        <SummaryRow label="Title" value={<span className="font-medium">{draft.title || "—"}</span>} />
        <Divider />
        <SummaryRow
          label="Description"
          value={<span className="text-neutral-700">{draft.description || "—"}</span>}
        />
        <Divider />
        <SummaryRow
          label="Deliverables"
          value={
            <div className="space-y-1.5">
              {draft.deliverables.map((d) => (
                <div key={d.id} className="text-neutral-700">
                  <span className="font-medium">{d.label || "Untitled"}</span>{" "}
                  <span className="text-neutral-400">· {d.type}</span>
                </div>
              ))}
            </div>
          }
        />
        <Divider />
        <SummaryRow
          label="Process"
          value={
            draft.process.length ? (
              <div className="space-y-1.5">
                {draft.process.map((p, i) => (
                  <div key={p.id} className="text-neutral-700">
                    <span className="text-neutral-400">{i + 1}.</span> {p.text || "—"}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-neutral-400">None</span>
            )
          }
        />
        <Divider />
        <SummaryRow
          label="Todos"
          value={
            draft.todos.length ? (
              <div className="space-y-1.5">
                {draft.todos.map((t) => (
                  <div key={t.id} className="text-neutral-700">
                    <span className="font-medium">{t.text || "—"}</span>
                    {t.details?.trim() ? <span className="text-neutral-400"> · {t.details}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-neutral-400">None</span>
            )
          }
        />
        <Divider />
        <SummaryRow
          label="Location"
          value={
            <div className="space-y-1.5">
              {draft.locations.map((l) => (
                <div key={l.id} className="text-neutral-700">
                  <span className="font-medium">{l.value || "—"}</span>{" "}
                  <span className="text-neutral-400">· {l.type}</span>
                </div>
              ))}
            </div>
          }
        />
        <Divider />
        <SummaryRow
          label="Tools"
          value={
            toolNames.length ? (
              <div className="flex flex-wrap justify-end gap-2">
                {toolNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[12px] text-neutral-700"
                  >
                    {n}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-neutral-400">None selected</span>
            )
          }
        />
        <Divider />
        <SummaryRow label="Schedule" value={<span className="text-neutral-700">{scheduleLabel}</span>} />
      </div>

      <div className="text-[13px] text-neutral-400">
        Submitting will create the task and queue it according to your schedule.
      </div>
    </div>
  );
}