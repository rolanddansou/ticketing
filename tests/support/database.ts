import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";

export async function testDatabase() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL obligatoire (base dédiée)");
  const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("schema", schema);
  const pool = new Pool({ connectionString: url.toString() });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const close = async () => {
    await prisma.$disconnect();
    try { await pool.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await pool.end(); }
  };
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe", timeout: 30000,
    });
  } catch (error) { await close(); throw error; }
  return { prisma, pool, schema, url, close };
}
