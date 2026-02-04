import type {
    Deliverable,
    DocDeliverable,
    DocSection,
  } from "@/components/review/deliverables";
  
  const kickoffSections: DocSection[] = [
    {
      kind: "h2",
      text: "Growth and Development Update",
    },
    {
      kind: "p",
      inlines: [
        {
          t: "text",
          v: "This summary captures the key outcomes from our week kickoff: how growth is trending, what we’re changing in pricing and positioning, and the execution plan for the next 14 days across product, engineering, and operations.",
        },
      ],
    },
    {
      kind: "h2",
      text: "Growth Metrics and Performance",
    },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Social media traffic increased meaningfully: Twitter reached " },
          { t: "text", v: "2.5k weekly views" },
          { t: "text", v: " (up from ~100–150), while LinkedIn reached " },
          { t: "text", v: "700 views" },
          { t: "text", v: " on the latest product update post." },
        ],
        [
          { t: "text", v: "MRR grew " },
          { t: "text", v: "5.6% month-to-date" },
          { t: "text", v: ", tracking toward " },
          { t: "text", v: "€1.36M by month end" },
          { t: "text", v: " if churn stays within the expected band." },
        ],
        [
          { t: "text", v: "AI feature retention continues to be workflow-driven: AI notes users retain at " },
          { t: "text", v: "66%" },
          { t: "text", v: ", AI chat users at " },
          { t: "text", v: "92%" },
          { t: "text", v: " (users return when they can immediately turn conversation into actions)." },
        ],
        [
          { t: "text", v: "The strongest activation sequence remains: " },
          { t: "text", v: "capture notes → generate summary → create tasks → share output" },
          { t: "text", v: ". Users who complete this loop within the first session have materially higher 7-day retention." },
        ],
      ],
    },
    {
      kind: "h2",
      text: "Key Decisions",
    },
    {
      kind: "p",
      inlines: [
        {
          t: "text",
          v: "We’re moving toward fewer tiers with clearer business-first positioning. The goal is to reduce support load, improve perceived quality, and focus the product on the segment that consistently benefits from the workflow end-to-end.",
        },
      ],
    },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Phase out Personal plan; grandfather existing users for 6 months to reduce churn shock." },
        ],
        [
          { t: "text", v: "Default onboarding to Business monthly + annual, with pricing copy focused on time-to-value." },
        ],
        [
          { t: "text", v: "Keep Pro only if a distinct segment emerges (validated by willingness-to-pay + usage patterns)." },
        ],
      ],
    },
    {
      kind: "h2",
      text: "Execution Plan (Next 14 Days)",
    },
    {
      kind: "bullets",
      items: [
        [
          { t: "text", v: "Ship pricing + billing changes with monitoring, dashboards, and rollback paths." },
        ],
        [
          { t: "text", v: "Write an FAQ that reduces inbound support volume and clarifies tier differences." },
        ],
        [
          { t: "text", v: "Run a reactivation campaign targeting churned users from the last 90 days." },
        ],
        [
          { t: "text", v: "Instrument onboarding to measure time-to-first-value and primary drop-off points." },
        ],
        [
          { t: "text", v: "Create lightweight templates for deliverables (email/doc/sheet/file edits) to keep output consistent." },
        ],
      ],
    },
  ];
  
  const brandGuidelinesBefore: DocDeliverable = {
    kind: "doc",
    headerLabel: "Document",
    headerAction: "Open",
    title: "Brand Guidelines (Before)",
    docTitle: "Brand Guidelines",
    createdLabel: "Thu, 6 Feb, 11:02 → 11:18",
    sourcesLabel: "Brand_Guidelines.pdf (v3), Notes",
    mode: "view",
    sections: [
      {
        kind: "h2",
        text: "Typography",
      },
      {
        kind: "p",
        inlines: [
          {
            t: "text",
            v: "Headings should be understated and compact. Use smaller sizes to keep pages feeling dense and efficient. Avoid overly large hero titles unless the context is marketing.",
          },
        ],
      },
      {
        kind: "h2",
        text: "Voice & Tone",
      },
      {
        kind: "p",
        inlines: [
          {
            t: "text",
            v: "Keep language friendly and concise. Avoid heavy jargon. Prefer short sentences and minimal punctuation. When in doubt: neutral and direct.",
          },
        ],
      },
      {
        kind: "h2",
        text: "Examples",
      },
      {
        kind: "bullets",
        items: [
          [{ t: "text", v: "Do: “Share summary”" }],
          [{ t: "text", v: "Do: “Create tasks”" }],
          [{ t: "text", v: "Don’t: “Initiate collaboration workflow”" }],
        ],
      },
    ],
    onOpen: () => {},
    onClose: () => {},
  };
  
  const brandGuidelinesAfter: DocDeliverable = {
    kind: "doc",
    headerLabel: "Document",
    headerAction: "Open",
    title: "Brand Guidelines (After)",
    docTitle: "Brand Guidelines",
    createdLabel: "Thu, 6 Feb, 11:02 → 11:18",
    sourcesLabel: "Brand_Guidelines.pdf (v4), Notes, UI reference",
    mode: "edit",
    sections: [
      {
        kind: "h2",
        text: "Typography",
      },
      {
        kind: "p",
        inlines: [
          { t: "text", v: "Headings should establish clear hierarchy. Use " },
          { t: "del", v: "smaller sizes to keep pages feeling dense and efficient" },
          { t: "add", v: "a consistent type scale that makes documents skimmable at a glance" },
          { t: "text", v: ". Avoid visual noise by using weight + spacing rather than decorative elements." },
        ],
      },
      {
        kind: "h2",
        text: "Voice & Tone",
      },
      {
        kind: "p",
        inlines: [
          { t: "text", v: "Be concise, calm, and helpful. Prefer concrete language and actionable verbs. Add do/don’t examples where ambiguity is common." },
        ],
      },
      {
        kind: "h2",
        text: "Accessibility Checklist",
      },
      {
        kind: "bullets",
        items: [
          [{ t: "add", v: "Ensure contrast is sufficient for secondary text (labels, metadata, timestamps)." }],
          [{ t: "add", v: "Maintain line height for readability in long summaries (avoid cramped paragraphs)." }],
          [{ t: "add", v: "Use spacing and hierarchy before color to communicate structure." }],
        ],
      },
      {
        kind: "h2",
        text: "Examples",
      },
      {
        kind: "bullets",
        items: [
          [{ t: "text", v: "Do: “Share summary”" }],
          [{ t: "text", v: "Do: “Create follow-ups”" }],
          [{ t: "del", v: "Don’t: “Initiate collaboration workflow”" }],
          [{ t: "add", v: "Don’t: “Start end-to-end collaboration workflow”" }],
        ],
      },
    ],
    onOpen: () => {},
    onClose: () => {},
  };
  
  export const demoDeliverables: Deliverable[] = [
    {
      kind: "email",
      headerLabel: "Email",
      headerAction: "Send email",
      to: "team@amie.so, founders@amie.so, ops@amie.so",
      subject: "Thank you for joining the Amie UX test — summary + next steps",
      body: `Hi everyone,
  
  Thanks again for joining yesterday’s Amie UX test. Your feedback on the new dashboard view, meeting notes workflow, and task management was incredibly valuable.
  
  A few highlights that stood out:
  - You want “one surface” that connects notes → follow-ups → reminders, without extra clicks.
  - The fastest path to value is: capture notes during the meeting, then instantly turn them into actions.
  - The “Ask Amie” prompt is powerful, but needs clearer affordances for what it can do (examples + suggested prompts).
  
  What we’ll do next:
  1) Improve the meeting summary layout to be more skimmable (stronger hierarchy, less visual noise).
  2) Add lightweight templates for deliverables (email, doc, spreadsheet, file edits) so output feels consistent.
  3) Create Linear tickets to track the improvements discussed, and share progress updates.
  
  If you have any additional thoughts, feel free to reply with:
  - what felt confusing,
  - what felt magical,
  - what you’d want to use weekly.
  
  Thanks again for your time and input!
  
  Best,
  Louis`,
      onClose: () => {},
    },
  
    {
      kind: "doc",
      headerLabel: "Document",
      headerAction: "Open",
      title: "Week Kickoff — Growth & Development Update",
      docTitle: "Week Kickoff",
      createdLabel: "Mon, 10 Feb, 17:45 → 18:12",
      sourcesLabel: "CRM export, Stripe MRR snapshot, Product analytics",
      mode: "view",
      sections: kickoffSections,
      onOpen: () => {},
      onClose: () => {},
    },
  
    {
      kind: "sheet",
      headerLabel: "Spreadsheet",
      headerAction: "Open sheet",
      title: "Pipeline Forecast — March (Cohort + Channel Breakdown)",
      meta: "Edited • Updated assumptions + normalized currency columns",
      summary: {
        rowsAdded: 18,
        rowsEdited: 42,
        rowsDeleted: 6,
        formulasAdded: 5,
        formulasEdited: 3,
        formulasDeleted: 1,
        dataNotes: [
          "Data source: March CRM export (SMB + Mid + Enterprise) + Stripe MRR snapshots.",
          "Normalized currency → EUR, applied FX conversion on daily close.",
          "Added churn adjustment factor per segment based on last 3 months trailing average.",
        ],
      },
      columns: ["Segment", "Channel", "Leads", "Conv %", "New MRR", "Churn", "Net MRR"],
      rows: [
        ["Business (SMB)", "Paid Search", 520, "7.1%", "€72,800", "€16,200", "€56,600"],
        ["Business (SMB)", "Content", 310, "6.4%", "€31,900", "€8,100", "€23,800"],
        ["Business (SMB)", "Outbound", 210, "8.2%", "€28,700", "€6,900", "€21,800"],
        ["Business (SMB)", "Referrals", 200, "10.3%", "€49,000", "€10,000", "€39,000"],
        ["Business (Mid)", "Outbound", 110, "12.0%", "€44,100", "€9,200", "€34,900"],
        ["Business (Mid)", "Partners", 100, "9.1%", "€38,200", "€6,800", "€31,400"],
        ["Enterprise", "Sales-led", 28, "17.8%", "€118,000", "€21,500", "€96,500"],
        ["Enterprise", "Partners", 12, "16.7%", "€54,000", "€10,200", "€43,800"],
        ["Self-serve", "Direct", 6200, "2.0%", "€52,400", "€14,300", "€38,100"],
        ["Self-serve", "SEO", 2010, "2.3%", "€24,700", "€5,300", "€19,400"],
        ["Reactivation", "Email", 560, "5.8%", "€38,900", "€7,100", "€31,800"],
        ["Upsell (AI Notes)", "In-app", 420, "8.9%", "€29,400", "€3,600", "€25,800"],
        ["Upsell (AI Chat)", "In-app", 260, "11.4%", "€26,700", "€2,900", "€23,800"],
        ["Annual upgrades", "Billing", 110, "22.7%", "€48,500", "€0", "€48,500"],
        ["TOTAL", "—", 11012, "—", "€677,300", "€121,400", "€555,900"],
      ],
      onOpen: () => {},
      onClose: () => {},
    },
  
    {
      kind: "file_edited",
      headerLabel: "File",
      headerAction: "Open",
      title: "Brand_Guidelines.pdf",
      meta: "Edited",
      fileType: "pdf",
      changeSummary: "Updated typography + refreshed examples",
      changes: [
        "Updated heading scale to match new UI hierarchy",
        "Rewrote voice/tone section with clearer do/don’t examples",
        "Added a short accessibility checklist for contrast + spacing",
      ],
      beforeDoc: brandGuidelinesBefore,
      afterDoc: brandGuidelinesAfter,
      onOpen: () => {},
      onClose: () => {},
    },
  ];