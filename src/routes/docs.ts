import { readFileSync } from "node:fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";

const document = JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"));

export function readOnlyOperations() {
  return {
    statePlugins: {
      spec: {
        wrapSelectors: {
          // Swagger serializes this plugin into a standalone browser script.
          allowTryItOutFor(
            original: (path: string, method: string) => boolean,
            system: { specSelectors: { specJson(): { getIn(keys: string[]): unknown } } },
          ) {
            return (path: string, method: string) =>
              system.specSelectors.specJson().getIn(["paths", path, method, "x-swagger-ui-read-only"]) !== true &&
              original(path, method);
          },
        },
      },
    },
  };
}

export function createDocsRouter(production: boolean): Router {
  const router = Router();
  router.get("/openapi.json", (_req, res) => { res.json(document); });
  const ui = { swaggerOptions: {
    url: "/openapi.json",
    supportedSubmitMethods: production ? [] : ["get", "post", "patch"],
    plugins: [readOnlyOperations],
    withCredentials: true,
  } };
  router.use("/docs", swaggerUi.serveFiles(undefined, ui), swaggerUi.setup(undefined, ui));
  return router;
}
