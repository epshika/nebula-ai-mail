import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import { resolveMailProvider } from "../services/mailProviderFactory.js";
import type { SearchQuery } from "../types/mail.js";

const router = Router();

router.get("/status", (req, res) => {
  const { isLive } = resolveMailProvider(req.userId);
  res.json({ live: isLive, mode: isLive ? "gmail" : "mock" });
});

router.get("/emails", async (req, res) => {
  try {
    const { provider } = resolveMailProvider(req.userId);
    const query: SearchQuery = {
      folder: (req.query.folder as "inbox" | "sent") || "inbox",
      query: (req.query.query as string) || undefined,
      from: (req.query.from as string) || undefined,
      after: (req.query.after as string) || undefined,
      before: (req.query.before as string) || undefined,
      isRead:
        req.query.isRead === "true" ? true : req.query.isRead === "false" ? false : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const emails = await provider.listEmails(query);
    res.json({ emails });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list emails";
    res.status(502).json({ error: message });
  }
});

router.get("/emails/:id", async (req, res) => {
  try {
    const { provider } = resolveMailProvider(req.userId);
    const email = await provider.getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: "Email not found" });
    res.json({
      email: { ...email, bodyHtml: sanitizeHtml(email.bodyHtml || "") },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch email";
    res.status(502).json({ error: message });
  }
});

router.patch("/emails/:id/read", async (req, res) => {
  try {
    const { provider } = resolveMailProvider(req.userId);
    await provider.markAsRead(req.params.id, Boolean(req.body?.isRead));
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update email";
    res.status(502).json({ error: message });
  }
});

router.post("/send", async (req, res) => {
  try {
    const { to, cc, bcc, subject, body } = req.body ?? {};
    if (!Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: "'to' must be a non-empty array of recipients." });
    }
    if (!subject?.trim()) {
      return res.status(400).json({ error: "Subject is required." });
    }
    const { provider } = resolveMailProvider(req.userId);
    const result = await provider.sendEmail({ to, cc, bcc, subject, body: body ?? "" });
    if (!result.success) return res.status(502).json({ error: result.error });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    res.status(502).json({ error: message });
  }
});

export default router;
