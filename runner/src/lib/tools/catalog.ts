import { ToolRegistry } from "./registry";
import { FilesGet, FilesList, FilesPut } from "./builtins/files";
import { HttpFetch } from "./builtins/http";
import { ToolsRequest, ToolsSearch } from "./builtins/tools";

export function buildRegistry() {
  const r = new ToolRegistry();
  r.register(ToolsSearch);
  r.register(ToolsRequest);
  r.register(FilesList);
  r.register(FilesGet);
  r.register(FilesPut);
  r.register(HttpFetch);
  return r;
}