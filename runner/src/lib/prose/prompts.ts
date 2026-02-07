// runner/src/prose/prompts.ts
export type PromptParts = {
    system?: string;
    user: string;
  };
  
  export function renderSessionPrompt(args: {
    title: string;
    agentSystem?: string;
    contextRefs?: Array<{ name: string; contentRef: string }>;
    examples?: string[];
  }): PromptParts {
    const { title, agentSystem, contextRefs, examples } = args;
  
    const ctx =
      contextRefs && contextRefs.length
        ? `\n<context_refs>\n${contextRefs
            .map((c) => `- ${c.name}: ${c.contentRef}`)
            .join("\n")}\n</context_refs>\n`
        : "";
  
    const ex =
      examples && examples.length
        ? `\n<examples>\n${examples
            .map((e) => `<example>\n${e}\n</example>`)
            .join("\n")}\n</examples>\n`
        : "";
  
    // IMPORTANT: matches the adapter’s fallback parser:
    //   @event todo {...}
    //   @event step started {...}
    //   @event log info ...
    const protocol =
      `\n<protocol>\n` +
      `You MUST emit realtime events using the @event prefix.\n\n` +
      `Allowed formats (each event MUST be exactly ONE line):\n` +
      `1) @event todo {"op":"add|update|complete","id":"t1","text":"...","status":"not_started|in_progress|done","order":1,"description":"..."}\n` +
      `2) @event step started {"name":"Plan|Execute|Verify|tool:XYZ","detail":"..."}\n` +
      `   @event step completed {"name":"...","detail":"..."}\n` +
      `   @event step failed {"name":"...","detail":"..."}\n` +
      `3) @event log info Your message here\n` +
      `   @event log error Your message here\n` +
      `4) @event artifact {"type":"file|document|spreadsheet|email|patch|log","title":"...","data":{...}}\n` +
      `5) @event result_text {"text":"..."}  (optional; you still MUST return <result>...)</n\n` +
      `Rules:\n` +
      `- Every @event line must be a single line (no newlines).\n` +
      `- For JSON payloads: must be valid JSON (double quotes, no trailing commas).\n` +
      `- Do NOT put @event lines inside <result>.\n` +
      `- Do NOT wrap @event lines in markdown code blocks.\n\n` +
      `TODO REQUIREMENT (strict):\n` +
      `- BEFORE ANY long text, emit AT LEAST 5 todo(add) events outlining your plan.\n` +
      `- Use stable IDs: t1, t2, t3, t4, t5 (and t6+ if needed).\n` +
      `- Orders must be 1..N and reflect execution order.\n` +
      `- As you progress, emit todo(update/complete) events.\n\n` +
      `Minimum step events:\n` +
      `- step started Plan\n` +
      `- step completed Plan\n` +
      `- step started Execute\n` +
      `- step completed Execute\n` +
      `- step started Verify\n` +
      `- step completed Verify\n\n` +
      `If you need more context, emit a todo(add) describing exactly what you need.\n` +
      `</protocol>\n`
      
  
    const instructions =
      `\n<instructions>\n` +
      `- Use context by reference. Only fetch/paste content if required.\n` +
      `- Be precise and follow the task exactly.\n` +
      `- Keep non-event narrative minimal outside <result>.\n` +
      `- Return the final answer inside <result>...</result>.\n` +
      `- At the end, your final answer MUST be representable as structured JSON matching the provided schema.\n` +
      `- The <result> MUST contain only the human-readable final answer (no @event lines).\n` +
      `</instructions>\n`;
  
    const user =
      `<task>\n${title}\n</task>\n` +
      ctx +
      ex +
      protocol +
      instructions;
  
    return { system: agentSystem, user };
  }