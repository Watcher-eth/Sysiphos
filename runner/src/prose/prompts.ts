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
        ? `\n<examples>\n${examples.map((e) => `<example>\n${e}\n</example>`).join("\n")}\n</examples>\n`
        : "";
  
    const user =
      `<task>\n${title}\n</task>\n` +
      ctx +
      ex +
      `\n<instructions>\n` +
      `- Use context by reference (do not paste huge content unless needed).\n` +
      `- Return a concise result.\n` +
      `</instructions>\n`;
  
    return { system: agentSystem, user };
  }