import "dotenv/config";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

const migration = "20261029110000_add_users_and_ticket_relations";
const marker = "ticketing:legacy-user-recovery";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est obligatoire");
const url = new URL(process.env.DATABASE_URL);
const schema = url.searchParams.get("schema") ?? "public";
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const cli = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { stdio: "inherit" });

try {
  await client.query(`SET search_path TO ${quote(schema)}`);
  const { rows } = await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
  if (!rows.some(row => row.migration_name === "20261029095052_init_ticket" && row.finished_at)) {
    throw new Error("La migration initiale doit être appliquée avant cette reprise");
  }
  if (!rows.some(row => row.migration_name === migration && row.finished_at)) {
    const relation = await client.query("SELECT to_regclass($1) AS relation", [`${quote(schema)}."User"`]);
    if (relation.rows[0].relation) {
      const comment = await client.query("SELECT obj_description(to_regclass($1), 'pg_class') AS marker", [`${quote(schema)}."User"`]);
      if (comment.rows[0].marker !== marker) {
        throw new Error("Une table User existe déjà sans marqueur de reprise ; arrêt sans modification");
      }
    } else {
      const original = readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8");
      const guardStart = original.indexOf("-- Existing tickets");
      const guardEnd = original.indexOf('CREATE TYPE "UserRole"');
      if (guardStart < 0 || guardEnd < guardStart || !original.includes('ADD COLUMN "createdById" UUID NOT NULL')) {
        throw new Error("Migration source inattendue ; arrêt sans modification");
      }
      const recovery = (original.slice(0, guardStart) + original.slice(guardEnd))
        .replace('ADD COLUMN "createdById" UUID NOT NULL', 'ADD COLUMN "createdById" UUID')
        .replace("COMMIT;", `COMMENT ON TABLE "User" IS '${marker}';\nCOMMIT;`);
      await client.query(recovery);
    }
    // A failed Prisma migration can be marked applied after the equivalent SQL succeeds.
    // The marker makes a retry safe if this CLI step fails after the SQL transaction commits.
    cli("migrate", "resolve", "--applied", migration);
  }
  cli("migrate", "deploy");
  console.info("Reprise terminée : tickets conservés, créateur facultatif");
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  client.release();
  await pool.end();
}
