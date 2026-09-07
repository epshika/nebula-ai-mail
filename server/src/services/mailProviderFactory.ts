import type { MailProvider } from "../types/mail.js";
import { GmailService } from "./gmailService.js";
import { MockMailService } from "./mockMailService.js";
import { getAuthenticatedClientForUser, isGoogleOAuthConfigured } from "./authService.js";

// Single shared mock instance so state (e.g. sent mail) persists across
// requests during local development without Gmail credentials.
const sharedMock = new MockMailService();

export function getMockMailService(): MockMailService {
  return sharedMock;
}

/**
 * Resolves the correct MailProvider for a request.
 *  - If Google OAuth is fully configured AND the user has a live Gmail
 *    session, returns a real GmailService bound to their credentials.
 *  - Otherwise falls back to the shared in-memory MockMailService so the
 *    rest of the app (AI tools, UI) remains fully exercisable locally.
 *
 * This indirection is the ONLY place that decides real-vs-mock — routes,
 * tools, and the AI service are unaware of which one they're talking to.
 */
export function resolveMailProvider(userId: string | null): {
  provider: MailProvider;
  isLive: boolean;
} {
  if (userId && isGoogleOAuthConfigured()) {
    const client = getAuthenticatedClientForUser(userId);
    if (client) {
      return { provider: new GmailService(client), isLive: true };
    }
  }
  return { provider: sharedMock, isLive: false };
}
