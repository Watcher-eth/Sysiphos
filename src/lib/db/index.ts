// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";


const connectionString = process.env.DATABASE_URL!;
if (!connectionString) throw new Error("DATABASE_URL missing");

const isProd = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString,
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
export { schema };