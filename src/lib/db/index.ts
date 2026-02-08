// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";


const rawConnectionString = process.env.DATABASE_URL!;
if (!rawConnectionString) throw new Error("DATABASE_URL missing");

const connectionString = (() => {
  try {
    const url = new URL(rawConnectionString);
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode && sslmode !== "disable") {
      // Let pg's ssl option control verification to avoid verify-full behavior.
      url.searchParams.delete("sslmode");
    }
    return url.toString();
  } catch {
    return rawConnectionString;
  }
})();

const isProd = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString,
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
export { schema };