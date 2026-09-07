import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { attachUser } from "./middleware/requireAuth.js";
import authRoutes from "./routes/auth.js";
import mailRoutes from "./routes/mail.js";
import aiRoutes from "./routes/ai.js";
import eventsRoutes, { startPollingFallback } from "./routes/events.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(attachUser);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/assistant", aiRoutes);
app.use("/api/realtime", eventsRoutes);

// Central error handler - never leak stack traces to the client.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Nebula AI Mail server listening on http://localhost:${PORT}`);
  console.log(
    `Google OAuth configured: ${Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    )}`
  );
  console.log(`Anthropic API configured: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
  startPollingFallback();
});
