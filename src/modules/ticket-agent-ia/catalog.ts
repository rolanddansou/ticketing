import { readFileSync } from "node:fs";
import { z } from "zod";

const procedureSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000).optional(),
  resolutionText: z.string().trim().min(1).max(8000),
});
const catalogSchema = z.array(procedureSchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length);
export type Procedure = z.infer<typeof procedureSchema>;
export const normalize = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function loadCatalog(): Procedure[] {
  return catalogSchema.parse(JSON.parse(readFileSync(new URL("../../../src/modules/ticket-agent-ia/catalog.json", import.meta.url), "utf8")));
}
