import type { NextFunction, Request, Response } from "express";
import { sessionsRepo } from "../db/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string | null;
    }
  }
}

/**
 * Attaches req.userId from the session cookie if present and valid.
 * Deliberately does NOT reject unauthenticated requests - the app is
 * designed to work in local dev-mode (mock mail) without Google login,
 * per the assignment's "implement the strongest possible real architecture
 * even if a credential is missing" guidance. Routes that require a live
 * Gmail session check `isLive` from mailProviderFactory instead.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.cookies?.session_id;
  req.userId = sessionId ? sessionsRepo.getUserId(sessionId) ?? null : null;
  next();
}
