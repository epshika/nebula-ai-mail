import { Router } from "express";
import { runAssistantTurn } from "../services/aiService.js";
import { resolveMailProvider } from "../services/mailProviderFactory.js";
import type { AppContext, ChatTurn } from "../types/ai.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { message, history, context } = req.body as {
      message: string;
      history?: ChatTurn[];
      context: AppContext;
    };

    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const { provider } = resolveMailProvider(req.userId);
    const payload = await runAssistantTurn(message, history ?? [], context, provider);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assistant error";
    res.status(500).json({ error: message });
  }
});

export default router;
