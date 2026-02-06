import type { AgentDef, ProseProgram, SessionProps, Stmt, Expr } from "./ast";

function trimComment(line: string) {
  const idx = line.indexOf("#");
  return idx >= 0 ? line.slice(0, idx).trimEnd() : line.trimEnd();
}

function isIndent(line: string) {
  return /^\s+/.test(line);
}

function unquote(s: string) {
  const m = s.match(/^"(.*)"$/);
  if (!m) throw new Error(`parse_expected_quoted_string: ${s}`);
  return m[1];
}

export function parseProse(programText: string): ProseProgram {
  const rawLines = programText.split("\n");
  const lines = rawLines.map((l) => trimComment(l)).filter((l) => l.length > 0);

  const header: string[] = [];
  const agents: Record<string, AgentDef> = {};
  const statements: Stmt[] = [];

  let i = 0;

  function parseBlock(baseIndent: number): Stmt[] {
    const out: Stmt[] = [];
    while (i < lines.length) {
      const line = lines[i];
      const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
      if (indent < baseIndent) break;

      if (indent > baseIndent) {
        throw new Error(`parse_unexpected_indent at line: ${line}`);
      }

      // --- agent def ---
      const agentM = line.match(/^agent\s+([a-zA-Z0-9_-]+):$/);
      if (agentM) {
        const name = agentM[1];
        i++;
        const propsIndent = baseIndent + 2;
        let model: string | undefined;
        let prompt: string | undefined;
        let persist: AgentDef["persist"] | undefined;

        while (i < lines.length) {
          const l2 = lines[i];
          const ind2 = l2.match(/^\s*/)?.[0]?.length ?? 0;
          if (ind2 < propsIndent) break;
          if (ind2 !== propsIndent) throw new Error(`parse_bad_indent agent props: ${l2}`);

          const t = l2.trim();
          if (t.startsWith("model:")) model = t.slice("model:".length).trim();
          else if (t.startsWith("persist:")) persist = t.slice("persist:".length).trim() as any;
          else if (t.startsWith("prompt:")) {
            const rest = t.slice("prompt:".length).trim();
            if (rest.startsWith('"""')) {
              // multi-line
              let acc: string[] = [];
              const first = rest.replace(/^"""\s?/, "");
              if (first.endsWith('"""')) {
                acc.push(first.replace(/"""$/, ""));
                prompt = acc.join("\n");
              } else {
                if (first.length) acc.push(first);
                i++;
                while (i < lines.length) {
                  const l3 = lines[i];
                  const t3 = l3.trim();
                  if (t3.endsWith('"""')) {
                    acc.push(t3.replace(/"""$/, ""));
                    prompt = acc.join("\n");
                    break;
                  }
                  acc.push(l3.slice(propsIndent)); // keep inner indentation
                  i++;
                }
              }
            } else {
              prompt = unquote(rest);
            }
          } else {
            // ignore unknown props for now
          }
          i++;
        }

        agents[name] = { name, model, prompt, persist };
        continue;
      }

      // --- try/catch/finally ---
      if (line.trim() === "try:") {
        i++;
        const body = parseBlock(baseIndent + 2);

        let catchName: string | undefined;
        let catchBody: Stmt[] | undefined;
        let finallyBody: Stmt[] | undefined;

        if (i < lines.length && lines[i].trim().startsWith("catch")) {
          const m = lines[i].trim().match(/^catch(\s+as\s+([a-zA-Z0-9_-]+))?:$/);
          if (!m) throw new Error(`parse_bad_catch: ${lines[i]}`);
          catchName = m[2] ?? "err";
          i++;
          catchBody = parseBlock(baseIndent + 2);
        }

        if (i < lines.length && lines[i].trim() === "finally:") {
          i++;
          finallyBody = parseBlock(baseIndent + 2);
        }

        out.push({ kind: "try", body, catchName, catchBody, finallyBody });
        continue;
      }

      // --- parallel ---
      const parM = line.trim().match(/^parallel(\(([^)]*)\))?:$/);
      if (parM) {
        const opts = parM[2] ?? "";
        const onFail =
          opts.includes("on-fail:") ? (opts.split("on-fail:")[1]?.trim() as any) : "fail-fast";
        i++;
        const branches: Array<{ name?: string; stmt: Stmt }> = [];
        const blockIndent = baseIndent + 2;

        while (i < lines.length) {
          const l2 = lines[i];
          const ind2 = l2.match(/^\s*/)?.[0]?.length ?? 0;
          if (ind2 < blockIndent) break;
          if (ind2 !== blockIndent) throw new Error(`parse_bad_indent parallel: ${l2}`);

          const t = l2.trim();
          const assign = t.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
          if (assign) {
            const name = assign[1];
            const rhs = assign[2];
            const stmt = parseSingleStmt(rhs, blockIndent);
            branches.push({ name, stmt });
            i++;
            continue;
          } else {
            const stmt = parseSingleStmt(t, blockIndent);
            branches.push({ stmt });
            i++;
            continue;
          }
        }

        out.push({ kind: "parallel", branches, onFail });
        continue;
      }

      // --- repeat ---
      const repM = line.trim().match(/^repeat\s+(\d+):$/);
      if (repM) {
        const n = Number(repM[1]);
        i++;
        const body = parseBlock(baseIndent + 2);
        out.push({ kind: "repeat", n, body });
        continue;
      }

      // normal single stmt
      out.push(parseSingleStmt(line.trim(), baseIndent));
      i++;
    }
    return out;
  }

  function parseSessionPropsInline(_indent: number): SessionProps | undefined {
    // v1: ignore inline props; add later if you emit `prompt:` under session blocks.
    return undefined;
  }

  function parseExpr(expr: string): Expr {
    const s = expr.trim();

    if (/^".*"$/.test(s)) return { kind: "string", value: unquote(s) };

    const sessM = s.match(/^session\s+"(.+)"$/);
    if (sessM) return { kind: "call_session", title: sessM[1] };

    const resM = s.match(/^resume:\s*([a-zA-Z0-9_-]+)\s+"(.+)"$/);
    if (resM) return { kind: "call_resume", agentName: resM[1], title: resM[2] };

    const varM = s.match(/^[a-zA-Z0-9_-]+$/);
    if (varM) return { kind: "var", name: s };

    throw new Error(`parse_unknown_expr: ${expr}`);
  }

  function parseSingleStmt(text: string, indent: number): Stmt {
    if (text.startsWith("#")) return { kind: "comment", text };

    const outM = text.match(/^output\s+([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (outM) return { kind: "output", name: outM[1], expr: parseExpr(outM[2]) };

    const letM = text.match(/^let\s+([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (letM) return { kind: "let", name: letM[1], expr: parseExpr(letM[2]) };

    const sessM = text.match(/^session\s+"(.+)"$/);
    if (sessM) return { kind: "session", title: sessM[1], props: parseSessionPropsInline(indent) };

    // "session: captain" not yet in parser; your compiler can add later, runtime supports agentName once you emit it.
    const sessAgentM = text.match(/^session:\s*([a-zA-Z0-9_-]+)\s+"(.+)"$/);
    if (sessAgentM) return { kind: "session", agentName: sessAgentM[1], title: sessAgentM[2] };

    const resumeM = text.match(/^resume:\s*([a-zA-Z0-9_-]+)\s+"(.+)"$/);
    if (resumeM) return { kind: "resume", agentName: resumeM[1], title: resumeM[2] };

    throw new Error(`parse_unknown_stmt: ${text}`);
  }

  // header lines (comments at top)
  while (i < lines.length && lines[i].trim().startsWith("#")) {
    header.push(lines[i]);
    i++;
  }

  statements.push(...parseBlock(0));

  return { header: { raw: header }, agents, statements };
}