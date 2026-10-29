import express from "express";
import { errorHandler } from "./middlewares/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { createTicketsRouter } from "./routes/tickets.js";
import { ticketRepository } from "./modules/tickets/index.js";
import { authService } from "./modules/auth/index.js";
import { createAuthRouter } from "./routes/auth.js";
import { browserConfig, authConfig } from "./config/auth.js";
import { cors } from "./middlewares/browser-security.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", authConfig.TRUST_PROXY_HOPS || false);
app.use(cors(browserConfig));
app.use(express.json({ limit: "1mb" }));
app.use(healthRouter);
app.use("/auth", createAuthRouter(authService, browserConfig));
app.use("/tickets", createTicketsRouter(ticketRepository));
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Route introuvable" } });
});
app.use(errorHandler);
