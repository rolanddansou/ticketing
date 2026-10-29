import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { prisma } from "../src/lib/prisma.js";
import { BootstrapService } from "../src/modules/auth/bootstrap.js";
import { PrismaAuthRepository } from "../src/modules/auth/prisma-auth.repository.js";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";

async function secret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
  reader.on("SIGINT", () => { reader.close(); process.exit(130); });
  try { return await reader.question(""); }
  finally { reader.close(); process.stdout.write("\n"); }
}

try {
  if (!process.stdin.isTTY) throw new Error("Terminal interactif requis");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const name = await reader.question("Nom : ");
  const email = await reader.question("Email : ");
  reader.close();
  const password = await secret("Mot de passe (15–128 caractères) : ");
  const confirmPassword = await secret("Confirmation : ");
  await new BootstrapService(new PrismaAuthRepository(prisma), new Argon2PasswordHasher()).create({ name, email, password, confirmPassword });
  console.info("Super Admin créé");
} catch {
  console.error("Initialisation refusée : vérifier la saisie, l'email, les migrations et l'absence de Super Admin");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
