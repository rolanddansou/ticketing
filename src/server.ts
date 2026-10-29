import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { emailWorker } from "./modules/email/index.js";

try {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  emailWorker.start();
  const server = app.listen(env.PORT, () => {
    console.info(`API démarrée sur le port ${env.PORT}`);
  });

  let stopping = false;
  const shutdown = (exitCode: number) => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => {
      console.error("Délai d'arrêt dépassé");
      process.exit(1);
    }, 10_000);
    timeout.unref();
    server.close(() => {
      void emailWorker.stop().then(() => prisma.$disconnect()).then(() => {
        clearTimeout(timeout);
        process.exitCode = exitCode;
      }).catch(() => process.exit(1));
    });
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  server.on("error", () => {
    console.error("Impossible de démarrer le serveur HTTP");
    shutdown(1);
  });
} catch {
  console.error("Démarrage impossible : connexion PostgreSQL indisponible");
  await emailWorker.stop().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
}
