export type ProseProgram = {
    header: { raw: string[] };
    agents: Record<string, AgentDef>;
    statements: Stmt[];
  };
  
  export type AgentDef = {
    name: string;
    model?: string;
    prompt?: string; // system-ish
    persist?: "true" | "false" | "project" | "user" | string;
  };
  
  export type Stmt =
    | { kind: "session"; title: string; agentName?: string; props?: SessionProps; assignTo?: string }
    | { kind: "resume"; title: string; agentName: string; props?: SessionProps; assignTo?: string }
    | { kind: "let"; name: string; expr: Expr }
    | { kind: "output"; name: string; expr: Expr }
    | { kind: "try"; body: Stmt[]; catchName?: string; catchBody?: Stmt[]; finallyBody?: Stmt[] }
    | { kind: "parallel"; branches: Array<{ name?: string; stmt: Stmt }>; onFail?: "fail-fast" | "continue" | "ignore" }
    | { kind: "repeat"; n: number; body: Stmt[] }
    | { kind: "comment"; text: string };
  
  export type SessionProps = {
    prompt?: string;
    context?: string[];
    examples?: string[];
  };
  
  export type Expr =
    | { kind: "string"; value: string }
    | { kind: "call_session"; title: string; agentName?: string; props?: SessionProps }
    | { kind: "call_resume"; title: string; agentName: string; props?: SessionProps }
    | { kind: "var"; name: string };