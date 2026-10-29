import express from "express";
import { errorHandler } from "./middlewares/error-handler.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(healthRouter);
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Route introuvable" } });
});
app.use(errorHandler);
