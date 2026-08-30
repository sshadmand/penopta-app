/**
 * Wipe local Docker Postgres so the same Google/GitHub account can sign in as
 * a brand-new empty user (fresh personal org, no projects or threads).
 *
 * Refuses anything that is not the local compose DB. Never points at Neon.
 *
 *   npm run db:wipe          # dry-run: show counts, do nothing
 *   npm run db:wipe -- --yes # truncate all public tables, keep migrations
 */
import { Client } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_PORT = "5434";
const LOCAL_DB = "penopta";
const SKIP_TABLES = new Set(["__drizzle_migrations"]);

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Refusing to truncate unexpected table name: ${name}`);
  }
  return `"${name}"`;
}

function assertLocalDevDatabase(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (/neon\.tech/i.test(raw) || process.env.DB_DRIVER === "neon") {
    throw new Error("Refusing to wipe: this looks like Neon / production.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to wipe: DATABASE_URL host is "${parsed.hostname}", not localhost.`,
    );
  }

  const port = parsed.port || "5432";
  if (port !== LOCAL_PORT) {
    throw new Error(
      `Refusing to wipe: expected local Docker port ${LOCAL_PORT}, got ${port}.`,
    );
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split(
    "/",
  )[0];
  if (dbName !== LOCAL_DB) {
    throw new Error(
      `Refusing to wipe: expected database "${LOCAL_DB}", got "${dbName}".`,
    );
  }

  return parsed;
}

async function listPublicTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return rows
    .map((r) => r.tablename)
    .filter((name) => !SKIP_TABLES.has(name));
}

async function countRows(
  client: Client,
  tables: string[],
): Promise<{ name: string; count: number }[]> {
  const out: { name: string; count: number }[] = [];
  for (const name of tables) {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${quoteIdent(name)}`,
    );
    out.push({ name, count: Number(rows[0]?.n ?? 0) });
  }
  return out;
}

function printCounts(counts: { name: string; count: number }[]): void {
  const nonempty = counts.filter((c) => c.count > 0);
  if (nonempty.length === 0) {
    console.log("All public tables are already empty.");
    return;
  }
  const width = Math.max(...nonempty.map((c) => c.name.length));
  for (const row of nonempty) {
    console.log(`  ${row.name.padEnd(width)}  ${row.count}`);
  }
}

async function main() {
  const yes = process.argv.slice(2).includes("--yes");
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. This script loads .env.local.");
  }

  const target = assertLocalDevDatabase(connectionString);
  console.log(
    `Target: ${target.hostname}:${target.port}/${LOCAL_DB} (local Docker only)`,
  );

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tables = await listPublicTables(client);
    if (tables.length === 0) {
      console.log("No public tables found. Run `npm run db:migrate` first.");
      return;
    }

    const before = await countRows(client, tables);
    console.log("Rows that would be deleted:");
    printCounts(before);

    if (!yes) {
      console.log("");
      console.log("Dry-run only. Re-run with --yes to truncate:");
      console.log("  npm run db:wipe -- --yes");
      return;
    }

    const quoted = tables.map(quoteIdent).join(", ");
    await client.query(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );

    const after = await countRows(client, tables);
    const leftover = after.filter((c) => c.count > 0);
    if (leftover.length > 0) {
      throw new Error(
        `Wipe incomplete; still has rows: ${leftover.map((c) => c.name).join(", ")}`,
      );
    }

    console.log("");
    console.log("Local data wiped. Schema and migrations are intact.");
    console.log("Sign out (or clear the localhost:3200 cookie), then sign in");
    console.log("with the same Google/GitHub account — you will get a new");
    console.log("personal org and an empty workspace.");
    console.log("Optional: npm run db:seed  (sample Welcome project)");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
