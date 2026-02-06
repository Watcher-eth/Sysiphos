export type PromptParts = {
    system?: string;
    user: string;
  };
  
  type ContextRef = { name: string; contentRef: string };
  
  function joinNonEmpty(parts: Array<string | undefined | null>, sep = "\n") {
    return parts.filter((p): p is string => !!p && p.trim().length > 0).join(sep);
  }
  
  function renderContextRefs(contextRefs?: ContextRef[]) {
    if (!contextRefs?.length) return "";
    return (
      `<context_refs>\n` +
      contextRefs.map((c) => `- ${c.name}: ${c.contentRef}`).join("\n") +
      `\n</context_refs>`
    );
  }
  
  function renderExamples(examples?: string[]) {
    if (!examples?.length) return "";
    return (
      `<examples>\n` +
      examples.map((e) => `<example>\n${e}\n</example>`).join("\n") +
      `\n</examples>`
    );
  }
  
  /**
   * Prompt template builder:
   * - Fixed content lives in system (policy + formatting contract)
   * - Variable content lives in user (task title + context refs + examples)
   * - Structured with XML tags (Anthropic best practice)
   */
  export function renderSessionPrompt(args: {
    title: string;
    agentSystem?: string;
    contextRefs?: Array<ContextRef>;
    examples?: string[];
  }): PromptParts {
    const { title, agentSystem, contextRefs, examples } = args;
  
    const baseSystem = joinNonEmpty([
      agentSystem?.trim(),
      `Rules:
  - Follow the user's instructions precisely.
  - Use context by reference. If you need details, ask for specific binding names.
  - Prefer concise output.
  - If producing a final deliverable, wrap it in <result>...</result>.`,
    ]);
  
    const user = joinNonEmpty([
      `<task>\n${title}\n</task>`,
      renderContextRefs(contextRefs),
      renderExamples(examples),
      `<instructions>
  - The <context_refs> are pointers. Do not paste huge content unless necessary.
  - If context is missing, request exactly which ref(s) you need.
  - Provide the deliverable. Wrap the final output in <result>...</result>.
  </instructions>`,
    ]);
  
    return { system: baseSystem || undefined, user };
  }