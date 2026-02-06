// src/lib/runs/eventsHub.ts
export type RunEventRowLike = {
    runId: string;
    seq: number;
    type: string;
    payload: any;
    createdAt: string; // ISO for SSE
  };
  
  type Subscriber = (evt: RunEventRowLike) => void;
  
  type RunBucket = {
    events: RunEventRowLike[];
    seen: Set<string>; // `${seq}` (seq is per-run monotonic)
    subs: Set<Subscriber>;
  };
  
  const MAX_EVENTS_PER_RUN_IN_MEM = 2000;
  
  class EventsHub {
    private runs = new Map<string, RunBucket>();
  
    private bucket(runId: string): RunBucket {
      let b = this.runs.get(runId);
      if (!b) {
        b = { events: [], seen: new Set(), subs: new Set() };
        this.runs.set(runId, b);
      }
      return b;
    }
  
    publishMany(runId: string, events: RunEventRowLike[]) {
      const b = this.bucket(runId);
  
      for (const e of events) {
        const key = String(e.seq);
        if (b.seen.has(key)) continue;
        b.seen.add(key);
  
        b.events.push(e);
        if (b.events.length > MAX_EVENTS_PER_RUN_IN_MEM) {
          const drop = b.events.splice(0, b.events.length - MAX_EVENTS_PER_RUN_IN_MEM);
          for (const d of drop) b.seen.delete(String(d.seq));
        }
  
        for (const sub of b.subs) sub(e);
      }
    }
  
    // In-memory only (useful for dev or for quick reconnect windows).
    list(runId: string): RunEventRowLike[] {
      return this.bucket(runId).events.slice();
    }
  
    subscribe(runId: string, fn: Subscriber): () => void {
      const b = this.bucket(runId);
      b.subs.add(fn);
      return () => b.subs.delete(fn);
    }
  }
  
  export const runEventsHub = new EventsHub();