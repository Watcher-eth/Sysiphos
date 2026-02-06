import { env } from "./env";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function assertRunnerAuth(headers: Headers) {
  const token = headers.get("x-runner-token");
  if (!token || token !== env.sharedSecret) throw new HttpError(401, "Unauthorized");
}