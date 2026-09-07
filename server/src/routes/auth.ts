import { Router } from "express";
import {
  getAuthUrl,
  handleOAuthCallback,
  isGoogleOAuthConfigured,
} from "../services/authService.js";
import { sessionsRepo, usersRepo } from "../db/index.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ googleConfigured: isGoogleOAuthConfigured() });
});

router.get("/google/login", (_req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(400).json({
      error:
        "Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in server/.env.",
    });
  }
  res.redirect(getAuthUrl());
});

router.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const oauthError = req.query.error as string | undefined;
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  if (oauthError) {
    return res.redirect(`${clientUrl}/?authError=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return res.redirect(`${clientUrl}/?authError=missing_code`);
  }

  try {
    const { sessionId, userId } = await handleOAuthCallback(code);
    sessionsRepo.create(sessionId, userId);
    res.cookie("session_id", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect(clientUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    console.error("[auth] OAuth callback error:", message);
    res.redirect(`${clientUrl}/?authError=${encodeURIComponent(message)}`);
  }
});

router.post("/logout", (req, res) => {
  const sessionId = req.cookies?.session_id;
  if (sessionId) sessionsRepo.destroy(sessionId);
  res.clearCookie("session_id");
  res.json({ success: true });
});

router.get("/me", (req, res) => {
  if (!req.userId) return res.json({ authenticated: false });
  const user = usersRepo.get(req.userId);
  res.json({ authenticated: true, user });
});

export default router;
