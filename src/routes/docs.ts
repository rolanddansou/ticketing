import { readFileSync } from "node:fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";

const document = JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"));

export function createDocsRouter(production: boolean): Router {
  const router = Router();
  router.get("/openapi.json", (_req, res) => { res.json(document); });
  const ui = { swaggerOptions: {
    url: "/openapi.json",
    supportedSubmitMethods: production ? [] : ["get", "post", "patch"],
    withCredentials: true,
  } };
  router.use("/docs", swaggerUi.serveFiles(undefined, ui), swaggerUi.setup(undefined, ui));
  return router;
}
