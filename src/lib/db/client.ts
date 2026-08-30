import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Start local Postgres with `docker compose up -d` " +
      "or point it at your Neon connection string.",
  );
}

/**
 * Pick the driver by URL, overridable with DB_DRIVER=pg|neon.
 *   - Local Docker Postgres → node-postgres (`pg`), a real TCP connection.
 *   - Neon (serverless) → neon-http, which works from Vercel functions.
 */
function shouldUseNeonDriver(url: string): boolean {
  const override = process.env.DB_DRIVER;
  if (override) return override === "neon";
  return /neon\.tech/i.test(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: PgDatabase<any, typeof schema> = shouldUseNeonDriver(connectionString)
  ? drizzleNeon(neon(connectionString), { schema })
  : drizzlePg(new Pool({ connectionString }), { schema });
