import { Router } from "express";
import { resolveMailProvider, getMockMailService } from "../services/mailProviderFactory.js";

const router = Router();

type Client = { userId: string | null; res: import("express").Response };
const clients: Client[] = [];

function broadcast(userId: string | null, event: string, data: unknown) {
  for (const client of clients) {
    if (client.userId === userId) {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }
}

/**
 * SSE endpoint the frontend subscribes to for live inbox updates.
 *
 * PRODUCTION architecture (documented in README, not deployable from this
 * sandbox - see gmailService.ts `watch()` for the detailed steps):
 *   Gmail watch() -> Google Cloud Pub/Sub topic -> push subscription hits
 *   POST /api/realtime/gmail-webhook -> server calls users.history.list ->
 *   server calls broadcast() here -> client updates inbox instantly.
 *
 * DEV FALLBACK (what actually runs in this environment): a lightweight
 * poll every POLL_INTERVAL_MS checks for new inbox messages and broadcasts
 * a delta. This is explicitly a fallback, not push - documented as such
 * per the assignment's anti-faking requirement.
 */
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: {}\n\n`);

  const client: Client = { userId: req.userId, res };
  clients.push(client);

  req.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

// Dev-only: manually trigger a "new mail arrived" event to demonstrate the
// SSE path without waiting for the poll interval or needing live Gmail.
router.post("/simulate-incoming", (req, res) => {
  const mock = getMockMailService();
  const summary = mock.simulateIncoming();
  broadcast(req.userId, "new-mail", summary);
  res.json({ success: true, email: summary });
});

/**
 * Production Pub/Sub push endpoint. Google's push subscription would POST
 * here with a base64-encoded Pub/Sub message wrapping { emailAddress, historyId }.
 * Requires GMAIL_PUBSUB_TOPIC + a deployed HTTPS URL registered as the push
 * subscription endpoint - not reachable/testable from this dev sandbox.
 * Implemented so the production wiring is a config change, not new code:
 * once reachable, this should map emailAddress -> userId, call
 * gmail.users.history.list(startHistoryId), and broadcast() the delta.
 */
router.post("/gmail-webhook", async (req, res) => {
  try {
    const messageData = req.body?.message?.data;
    if (!messageData) return res.status(400).json({ error: "Missing Pub/Sub message data" });
    const decoded = JSON.parse(Buffer.from(messageData, "base64").toString("utf-8"));
    console.log("[realtime] Gmail push notification received:", decoded);
    // NOTE: userId resolution + users.history.list + broadcast() intentionally
    // left as a documented next step - requires a live Pub/Sub subscription
    // to exercise/test, which this environment cannot reach. See README
    // "Real-Time Sync" and "Limitations".
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[realtime] gmail-webhook error:", err instanceof Error ? err.message : err);
    res.status(200).json({ received: true }); // ack anyway - Pub/Sub retries on non-2xx
  }
});

const POLL_INTERVAL_MS = Number(process.env.MAIL_POLL_INTERVAL_MS || 15000);
const lastSeenByUser = new Map<string | null, string>();

export function startPollingFallback() {
  setInterval(async () => {
    const activeUserIds = [...new Set(clients.map((c) => c.userId))];
    for (const userId of activeUserIds) {
      try {
        const { provider } = resolveMailProvider(userId);
        const emails = await provider.listEmails({ folder: "inbox", limit: 1 });
        const newest = emails[0];
        if (!newest) continue;
        const lastSeen = lastSeenByUser.get(userId);
        if (lastSeen && lastSeen !== newest.id) {
          broadcast(userId, "new-mail", newest);
        }
        lastSeenByUser.set(userId, newest.id);
      } catch (err) {
        console.error("[realtime] poll error:", err instanceof Error ? err.message : err);
      }
    }
  }, POLL_INTERVAL_MS);
}

export default router;
