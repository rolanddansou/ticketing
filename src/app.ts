import express from "express";
import { errorHandler } from "./middlewares/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { createTicketsRouter } from "./routes/tickets.js";
import { ticketRepository } from "./modules/tickets/index.js";
import { authService } from "./modules/auth/index.js";
import { createAuthRouter } from "./routes/auth.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(healthRouter);
app.use("/auth", createAuthRouter(authService));
app.use("/tickets", createTicketsRouter(ticketRepository));
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Route introuvable" } });
});
app.use(errorHandler);
