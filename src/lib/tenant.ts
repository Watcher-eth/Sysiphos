import type {
    Deliverable,
    DocDeliverable,
    DocSection,
  } from "@/components/review/deliverables";
  
  /* ───────────────────────── Document sections (new) ───────────────────────── */
  
  const tenantAccountingSections: DocSection[] = [
    { kind: "h2", text: "Tenant Accounting — Overview" },
    {
      kind: "p",
      inlines: [
        {
          t: "text",
          v: "This document summarizes the month-end tenant accounting prep for Holsteinische 18. It covers what data we validated, which balances were updated, which tenants still have missing documentation, and the next actions to close the remaining gaps.",
        },
      ],
    },
  
    { kind: "h2", text: "What we checked" },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Cross-checked rent payments vs. bank statement exports for the accounting period." },
        ],
        [
          { t: "text", v: "Validated last known tenant contact details (email + phone) and lease references." },
        ],
        [
          { t: "text", v: "Compared existing owner balance table against rent roll + outstanding items." },
        ],
      ],
    },
  
    { kind: "h2", text: "Open gaps" },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Missing meter readings for " },
          { t: "text", v: "3 units" },
          { t: "text", v: " (needed for utilities allocation)." },
        ],
        [
          { t: "text", v: "Missing updated IBAN for " },
          { t: "text", v: "2 tenants" },
          { t: "text", v: " (returned transfers in February)." },
        ],
        [
          { t: "text", v: "One disputed late fee still unresolved; requires follow-up and written confirmation." },
        ],
      ],
    },
  
    { kind: "h2", text: "Next steps (this week)" },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Send tenant email requesting missing documents and confirm deadlines." },
        ],
        [
          { t: "text", v: "Finalize the tenant accounting sheet and mark remaining gaps clearly." },
        ],
        [
          { t: "text", v: "Update owner balances table with validated deltas and attach notes for exceptions." },
        ],
      ],
    },
  ];
  
  /* ───────────────────────── Updated document (edit mode) ───────────────────────── */
  
  const ownerBalancesBefore: DocDeliverable = {
    kind: "doc",
    headerLabel: "Document",
    headerAction: "Open",
    title: "Owner Balances — February (Before)",
    docTitle: "Owner Balances — February",
    createdLabel: "Fri, 31 Jan, 09:10 → 09:32",
    sourcesLabel: "OwnerBalances_v2.docx, Notes",
    mode: "view",
    sections: [
      { kind: "h2", text: "Summary" },
      {
        kind: "p",
        inlines: [
          {
            t: "text",
            v: "This draft reflects balances as of the last export. A few tenant payments were not yet reconciled, and utilities allocations are still pending meter readings.",
          },
        ],
      },
      { kind: "h2", text: "Open Items" },
      {
        kind: "bullets",
        items: [
          [{ t: "text", v: "Meter readings pending for 3 units." }],
          [{ t: "text", v: "Two returned transfers require updated IBAN." }],
          [{ t: "text", v: "Late fee dispute remains open." }],
        ],
      },
    ],
    onOpen: () => {},
    onClose: () => {},
  };
  
  const ownerBalancesAfter: DocDeliverable = {
    kind: "doc",
    headerLabel: "Document",
    headerAction: "Open",
    title: "Owner Balances — February (Updated)",
    docTitle: "Owner Balances — February",
    createdLabel: "Mon, 10 Feb, 16:05 → 16:44",
    sourcesLabel: "OwnerBalances_v3.docx, Bank export, Tenant sheet",
    mode: "edit",
    sections: [
      { kind: "h2", text: "Summary" },
      {
        kind: "p",
        inlines: [
          { t: "text", v: "This update reflects balances after reconciling the latest bank exports and rent roll. " },
          { t: "del", v: "A few tenant payments were not yet reconciled" },
          { t: "add", v: "All received payments in the period were reconciled" },
          { t: "text", v: ", and the remaining gaps are now limited to missing documents (meter readings + IBAN updates)." },
        ],
      },
      { kind: "h2", text: "Changes applied" },
      {
        kind: "bullets",
        items: [
          [{ t: "add", v: "Updated owner balance deltas for 6 units based on reconciled February payments." }],
          [{ t: "add", v: "Added explicit exception notes per unit for missing inputs (meter readings, IBAN, dispute)." }],
          [{ t: "add", v: "Standardized formatting to match the monthly accounting package." }],
        ],
      },
      { kind: "h2", text: "Open Items" },
      {
        kind: "bullets",
        items: [
          [{ t: "text", v: "Meter readings pending for 3 units (deadline: Wed)." }],
          [{ t: "text", v: "Two tenants need updated IBAN to prevent returned transfers." }],
          [{ t: "text", v: "Late fee dispute: waiting on written confirmation from tenant." }],
        ],
      },
    ],
    onOpen: () => {},
    onClose: () => {},
  };
  
  /* ───────────────────────── Deliverables (real estate task) ───────────────────────── */
  
  export const demoDeliverables: Deliverable[] = [
    {
      kind: "email",
      headerLabel: "Email",
      headerAction: "Send email",
      to: "tenant@unit-xx.example, tenant@unit-yy.example",
      subject: "Action required: Missing documents for tenant accounting (Holsteinische 18)",
      body: `Hi {{first_name}},
  
  We’re preparing the month-end tenant accounting for Holsteinische 18 and we’re missing one or more items for your unit.
  
  What we need from you:
  {{missing_items}}
  
  Please reply with the information/documents by {{deadline_date}} so we can finalize the balances without delays.
  
  If you have questions, reply to this email and we’ll help.
  
  Thanks,
  Company Name`,
      onClose: () => {},
    },
  
    {
      kind: "sheet",
      headerLabel: "Spreadsheet",
      headerAction: "Open sheet",
      title: "Tenant Accounting — Missing Data Tracker (Holsteinische 18)",
      meta: "Created • New table for reconciliation + missing inputs",
      summary: {
        rowsAdded: 24,
        rowsEdited: 0,
        rowsDeleted: 0,
        formulasAdded: 6,
        formulasEdited: 0,
        formulasDeleted: 0,
        dataNotes: [
          "Data sources: rent roll export + bank statement CSV + existing owner balances table.",
          "Added status fields to track missing docs (meter readings, IBAN, dispute flags).",
          "Added simple validation formulas for outstanding balance + missing fields.",
        ],
      },
      columns: [
        "Unit",
        "Tenant",
        "Email",
        "Rent",
        "Paid",
        "Outstanding",
        "Missing",
        "Status",
      ],
      rows: [
        ["1A", "M. Meyer", "mmeyer@example.com", "€1,250", "€1,250", "€0", "—", "Complete"],
        ["1B", "S. Klein", "sklein@example.com", "€1,050", "€1,050", "€0", "Meter reading", "Waiting"],
        ["2A", "A. Fischer", "afischer@example.com", "€1,400", "€1,200", "€200", "IBAN update", "Waiting"],
        ["2B", "J. Wolf", "jwolf@example.com", "€980", "€980", "€0", "—", "Complete"],
        ["3A", "N. Braun", "nbraun@example.com", "€1,320", "€1,320", "€0", "Late fee dispute", "Review"],
        ["3B", "L. Becker", "lbecker@example.com", "€1,150", "€1,150", "€0", "—", "Complete"],
        ["4A", "K. Schneider", "kschneider@example.com", "€1,600", "€1,600", "€0", "Meter reading", "Waiting"],
        ["4B", "T. Wagner", "twagner@example.com", "€1,100", "€1,100", "€0", "—", "Complete"],
        ["TOTAL", "—", "—", "—", "—", "€400", "—", "—"],
      ],
      onOpen: () => {},
      onClose: () => {},
    },
  
    {
      kind: "file_edited",
      headerLabel: "File",
      headerAction: "Open",
      title: "Owner_Balances_February.docx",
      meta: "Edited",
      fileType: "doc",
      changeSummary: "Reconciled payments + updated deltas + clarified exceptions",
      changes: [
        "Reconciled February payments against bank export and corrected 6 unit deltas",
        "Added exception notes per unit for missing inputs (meter readings, IBAN updates, dispute)",
        "Standardized formatting to match month-end accounting package",
      ],
      beforeDoc: ownerBalancesBefore,
      afterDoc: ownerBalancesAfter,
      onOpen: () => {},
      onClose: () => {},
    },
  ];
  
  /* ───────────────────────── Task model (timeline + todos updated) ───────────────────────── */
  
  type TaskStatus = "review" | "success" | "in_progress" | "error";
  type StepStatus = "done" | "pending_review" | "running" | "todo" | "error";
  type TodoStatus = "not_started" | "in_progress" | "done";
  
  type TimelineItem = {
    id: string;
    text: string;
    at: string;
    status?: StepStatus;
  };
  
  type TodoItem = {
    id: string;
    text: string;
    status?: TodoStatus;
  };
  
  type TaskReviewModel = {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    updatedLabel: string;
    timeline: TimelineItem[];
    todos: TodoItem[];
    deliverables: Deliverable[];
  };
  
  export const demoTask: TaskReviewModel = {
    id: "3127",
    title: "Tenant Accounting Prep — Holsteinische 18",
    description:
      "Prepare the tenant accounting sheet and update owner balances by reconciling February payments, identifying missing tenant data, and sending follow-ups to close open gaps.",
    status: "review",
    updatedLabel: "Updated 2 hours ago",
    timeline: [
      {
        id: "t1",
        text: "Imported rent roll + bank export; reconciled received payments for the period",
        at: "Feb 10, 14:05",
        status: "done",
      },
      {
        id: "t2",
        text: "Created missing data tracker (meter readings, IBAN updates, disputes) with per-unit status",
        at: "Feb 10, 14:40",
        status: "done",
      },
      {
        id: "t3",
        text: "Drafted tenant email template to request missing documents with deadline + clear checklist",
        at: "Feb 10, 15:10",
        status: "done",
      },
      {
        id: "t4",
        text: "Updated owner balances document with reconciled deltas + exception notes per unit",
        at: "Feb 10, 16:05",
        status: "pending_review",
      },
      {
        id: "t5",
        text: "Send emails to tenants with missing documents and track responses in the sheet",
        at: "Feb 10, 16:45",
        status: "todo",
      },
      {
        id: "t6",
        text: "Finalize accounting package and share updated balances with owners",
        at: "Feb 11, 10:00",
        status: "todo",
      },
    ],
    todos: [
      { id: "td1", text: "Verify bank export period matches accounting month (Feb 1–Feb 29)", status: "done" },
      { id: "td2", text: "Mark units missing meter readings and set deadline", status: "in_progress" },
      { id: "td3", text: "Send follow-up emails to tenants with missing IBAN or documents", status: "not_started" },
      { id: "td4", text: "Update owner balances table with reconciled deltas", status: "done" },
      { id: "td5", text: "Add exception notes for disputes / unresolved items", status: "not_started" },
    ],
    deliverables: demoDeliverables,
  };