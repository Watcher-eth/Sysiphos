export type BindingRef = {
    name: string;
    kind: "output" | "input" | "let" | "const";
    contentRef: string;
    preview?: string;
    summary?: string;
    sha256?: string;
    size?: number;
    mime?: string;
  };
  
  export type RuntimeState = {
    runId: string;
    programHash: string;
    bindings: Map<string, BindingRef>;
    outputs: BindingRef[];
  };