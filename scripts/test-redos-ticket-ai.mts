// Reproduit la mesure de VULN-001 (AUDIT-SECURITE.md) : appelle le vrai
// TicketAgentIa.analyze() avec un faux fournisseur IA (aucune clé, aucun réseau,
// aucune base) et mesure si la boucle d'événements reste bloquée.
//
// Usage :
//   npx tsx scripts/test-redos-ticket-ai.mts            # 100 000 et 200 000 caractères
//   npx tsx scripts/test-redos-ticket-ai.mts 500000      # une taille précise
//
// Sur le code corrigé (description tronquée à 4000 caractères avant les regex),
// le blocage attendu est de quelques millisecondes quelle que soit la taille.

import { TicketAgentIa } from "../src/modules/ticket-agent-ia/agent.js";
import type { AiService } from "../src/modules/ai/ai.service.js";

const fakeAi: Pick<AiService, "generateJson"> = {
  async generateJson(_input, schema) {
    return { data: schema.parse({ scope: "IT", draft: "ok", procedureId: null }), provider: "openai", model: "fake" };
  },
};

async function measure(size: number): Promise<void> {
  const agent = new TicketAgentIa(fakeAi, [], false);
  const description = "a.".repeat(Math.ceil(size / 2));

  let ticks = 0;
  const timer = setInterval(() => ticks++, 100);
  const started = performance.now();
  await agent.analyze({ title: "Imprimante", description });
  const elapsedMs = Math.round(performance.now() - started);
  clearInterval(timer);

  console.log(`description ${size.toLocaleString("fr-FR")} car. → boucle d'événements bloquée ${elapsedMs} ms (${ticks} tic${ticks === 1 ? "" : "s"} de minuteur)`);
}

const requested = process.argv.slice(2).map(Number).filter(n => Number.isFinite(n) && n > 0);
const sizes = requested.length ? requested : [100_000, 200_000];

for (const size of sizes) {
  await measure(size);
}
